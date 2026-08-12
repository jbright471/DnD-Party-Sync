export type AccessFlow = 'companion' | 'cast';

const TOKEN_FRAGMENT_KEY = 'access_token';
const STORAGE_PREFIX = 'arcane_ally_access';

export function accessFlowForPath(pathname: string): AccessFlow | null {
  if (/^\/companion\/[^/]+\/?$/.test(pathname)) return 'companion';
  if (/^\/encounter\/[^/]+\/cast\/?$/.test(pathname)) return 'cast';
  return null;
}

function storageKey(pathname: string) {
  return `${STORAGE_PREFIX}:${pathname.replace(/\/$/, '')}`;
}

export function consumeAccessCredential(): { flow: AccessFlow | null; token: string | null } {
  const flow = accessFlowForPath(window.location.pathname);
  if (!flow) return { flow: null, token: null };

  const fragment = new URLSearchParams(window.location.hash.slice(1));
  const fragmentToken = fragment.get(TOKEN_FRAGMENT_KEY);
  const key = storageKey(window.location.pathname);

  if (fragmentToken) {
    let stored = false;
    try {
      window.sessionStorage.setItem(key, fragmentToken);
      stored = true;
    } catch {
      stored = false;
    } finally {
      window.history.replaceState(
        window.history.state,
        '',
        `${window.location.pathname}${window.location.search}`,
      );
    }
    return { flow, token: stored ? fragmentToken : null };
  }

  try {
    return { flow, token: window.sessionStorage.getItem(key) };
  } catch {
    return { flow, token: null };
  }
}
