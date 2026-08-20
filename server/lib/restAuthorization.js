'use strict';

const PUBLIC_REST_ROUTES = Object.freeze([
  { method: 'POST', path: '/api/auth/dm', routeClass: 'dm_auth' },
  { method: 'GET', path: '/api/health', routeClass: 'health' },
]);

const DM_REST_SURFACES = Object.freeze([
  { pathPrefix: '/api/characters/import', routeClass: 'character_imports' },
  { pathPrefix: '/api/characters', routeClass: 'characters' },
  { pathPrefix: '/api/encounters', routeClass: 'encounters' },
  { pathPrefix: '/api/initiative', routeClass: 'initiative' },
  { pathPrefix: '/api/maps', routeClass: 'maps' },
  { pathPrefix: '/api/npcs', routeClass: 'npcs' },
  { pathPrefix: '/api/loot', routeClass: 'loot' },
  { pathPrefix: '/api/quests', routeClass: 'quests' },
  { pathPrefix: '/api/world', routeClass: 'world' },
  { pathPrefix: '/api/notes', routeClass: 'party_notes' },
  { pathPrefix: '/api/homebrew', routeClass: 'homebrew' },
  { pathPrefix: '/api/automation', routeClass: 'automation' },
  { pathPrefix: '/api/dm-notes', routeClass: 'dm_notes', unauthenticatedStatus: 403 },
  { pathPrefix: '/api/prep-packs', routeClass: 'prep_packs' },
  { pathPrefix: '/api/effect-presets', routeClass: 'effect_presets', unauthenticatedStatus: 403 },
  { pathPrefix: '/api/combat/snapshots', routeClass: 'combat_snapshots' },
  { pathPrefix: '/api/v1/effects/bulk-apply', routeClass: 'bulk_effects' },
  { pathPrefix: '/api/log', routeClass: 'action_log' },
  { pathPrefix: '/api/lore', routeClass: 'ai_lore' },
  { pathPrefix: '/api/chat', routeClass: 'ai_rules' },
  { pathPrefix: '/api/offline-bundle', routeClass: 'offline_bundle' },
  { pathPrefix: '/api/effect-timeline', routeClass: 'effect_timeline' },
  { pathPrefix: '/api/combat-sessions', routeClass: 'combat_sessions' },
  { pathPrefix: '/api/sync-audit', routeClass: 'sync_audit' },
  { pathPrefix: '/api/recaps', routeClass: 'recaps' },
  { pathPrefix: '/api/access-grants', routeClass: 'access_grants' },
]);

const ROUTE_CLASS_IDS = new Set([
  ...PUBLIC_REST_ROUTES.map(route => route.routeClass),
  ...DM_REST_SURFACES.map(route => route.routeClass),
  'unclassified_api',
]);

function isPathWithin(pathname, prefix) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function classifyRestRoute(method, pathname) {
  const publicRoute = PUBLIC_REST_ROUTES.find(route => route.path === pathname);
  if (publicRoute) {
    return {
      routeClass: publicRoute.routeClass,
      access: publicRoute.method === method ? 'public' : 'dm',
      unauthenticatedStatus: 401,
    };
  }

  const protectedSurface = DM_REST_SURFACES.find(route => isPathWithin(pathname, route.pathPrefix));
  if (protectedSurface) {
    return {
      routeClass: protectedSurface.routeClass,
      access: 'dm',
      unauthenticatedStatus: protectedSurface.unauthenticatedStatus || 401,
    };
  }
  return null;
}

function readCredential(req) {
  const authorization = req.headers.authorization;
  const dmHeader = req.headers['x-dm-token'];
  let bearer = null;
  let malformedAuthorization = false;

  if (authorization !== undefined) {
    const match = typeof authorization === 'string' && authorization.match(/^Bearer ([^\s]+)$/);
    if (match) bearer = match[1];
    else malformedAuthorization = true;
  }

  const compatibilityToken = typeof dmHeader === 'string' && dmHeader.length > 0 ? dmHeader : null;
  if (malformedAuthorization) return { state: 'invalid', token: null };
  if (bearer && compatibilityToken && bearer !== compatibilityToken) {
    return { state: 'invalid', token: null };
  }

  const token = bearer || compatibilityToken;
  if (!token) return { state: 'missing', token: null };
  if (token.length > 256) return { state: 'invalid', token: null };
  return { state: 'present', token };
}

function createRestAuthorizationMiddleware({
  authenticateDm,
  authenticateAccessGrant,
  onDenial = () => {},
}) {
  if (typeof authenticateDm !== 'function' || typeof authenticateAccessGrant !== 'function') {
    throw new TypeError('REST authorization requires server-side credential validators.');
  }

  function deny(req, res, { actorRole, routeClass, reasonCode, status, code }) {
    onDenial({
      eventType: 'rest_authorization_denied',
      actorRole,
      routeClass,
      outcome: 'denied',
      reasonCode,
    }, req);
    return res.status(status).json({ error: 'DM REST authorization required', code });
  }

  return function restAuthorization(req, res, next) {
    // Express route matching is case-insensitive by default. Match the policy
    // the same way so `/API/...` cannot skip this boundary and reach a route.
    const pathname = typeof req.path === 'string' ? req.path.toLowerCase() : '';
    if (pathname !== '/api' && !pathname.startsWith('/api/')) return next();

    const classification = classifyRestRoute(req.method, pathname);
    if (classification?.access === 'public') {
      req.restAuthorization = { role: 'unauthenticated', routeClass: classification.routeClass };
      return next();
    }

    const credential = readCredential(req);
    let actorRole = 'unauthenticated';
    let identity = null;
    if (credential.state === 'present') {
      if (authenticateDm(credential.token)) {
        identity = { role: 'dm' };
        actorRole = 'dm';
      } else {
        const grant = authenticateAccessGrant(credential.token);
        if (grant?.role === 'player' || grant?.role === 'cast') {
          identity = { role: grant.role, grantId: grant.id };
          actorRole = grant.role;
        }
      }
    }

    if (!classification) {
      return deny(req, res, {
        actorRole,
        routeClass: 'unclassified_api',
        reasonCode: 'route_unclassified',
        status: 403,
        code: 'REST_ROUTE_UNCLASSIFIED',
      });
    }

    if (identity?.role === 'dm') {
      req.restAuthorization = { role: 'dm', routeClass: classification.routeClass };
      return next();
    }

    const accessGrantPresented = identity?.role === 'player' || identity?.role === 'cast';
    return deny(req, res, {
      actorRole,
      routeClass: classification.routeClass,
      reasonCode: accessGrantPresented
        ? 'access_grant_forbidden'
        : credential.state === 'missing' ? 'credential_missing' : 'credential_invalid',
      status: accessGrantPresented ? 403 : classification.unauthenticatedStatus,
      code: 'REST_DM_REQUIRED',
    });
  };
}

module.exports = {
  DM_REST_SURFACES,
  PUBLIC_REST_ROUTES,
  ROUTE_CLASS_IDS,
  classifyRestRoute,
  createRestAuthorizationMiddleware,
  readCredential,
};
