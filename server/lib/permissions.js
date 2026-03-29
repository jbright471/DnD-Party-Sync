/**
 * @backend-smith — Resource Authority Rules
 * Configurable permissions for shared loot and cross-player effects.
 *
 * Permission modes:
 *   - 'open'         — anyone can perform the action (default, current behavior)
 *   - 'dm_approval'  — non-DM actors create a pending action for DM review
 *   - 'owner_only'   — only the character's owner can modify (loot_claim only)
 */

const DEFAULTS = {
    loot_claim: 'open',
    cross_player_effects: 'open',
    inventory_transfer: 'open',
};

function getPermissions(db) {
    const row = db.prepare("SELECT value FROM campaign_state WHERE key = 'resource_permissions'").get();
    if (!row) return { ...DEFAULTS };
    try {
        return { ...DEFAULTS, ...JSON.parse(row.value) };
    } catch {
        return { ...DEFAULTS };
    }
}

function setPermissions(db, permissions) {
    const merged = { ...DEFAULTS, ...permissions };
    db.prepare("INSERT OR REPLACE INTO campaign_state (key, value) VALUES ('resource_permissions', ?)").run(JSON.stringify(merged));
    return merged;
}

/**
 * Check whether an action is allowed under current permissions.
 *
 * @param {object} db - Database instance
 * @param {string} action - Permission key: 'loot_claim', 'cross_player_effects', 'inventory_transfer'
 * @param {boolean} isDm - Whether the actor is authenticated as DM
 * @param {number|null} actorCharacterId - The character ID the actor owns (for owner_only checks)
 * @param {number|null} targetCharacterId - The target character ID
 * @returns {{ allowed: boolean, reason?: string, mode: string }}
 */
function checkPermission(db, action, isDm, actorCharacterId, targetCharacterId) {
    const perms = getPermissions(db);
    const mode = perms[action] || 'open';

    // DM always allowed
    if (isDm) return { allowed: true, mode };

    if (mode === 'open') return { allowed: true, mode };

    if (mode === 'dm_approval') {
        return { allowed: false, reason: 'Awaiting DM approval', mode };
    }

    if (mode === 'owner_only') {
        if (actorCharacterId && actorCharacterId === targetCharacterId) {
            return { allowed: true, mode };
        }
        return { allowed: false, reason: 'Only the character owner can perform this action', mode };
    }

    return { allowed: true, mode };
}

module.exports = { getPermissions, setPermissions, checkPermission };
