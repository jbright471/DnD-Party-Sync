const DEFAULT_AUTOMATION_RULES = Object.freeze({
    automaticUnconscious: true,
    clearUnconsciousOnHeal: true,
    concentrationCleanup: true,
    concentrationChecks: 'automatic',
    conditionDurations: true,
    turnTriggers: true,
    auras: true,
    reactiveHandlers: true,
    initiativeSync: true,
});

const BOOLEAN_RULES = [
    'automaticUnconscious',
    'clearUnconsciousOnHeal',
    'concentrationCleanup',
    'conditionDurations',
    'turnTriggers',
    'auras',
    'reactiveHandlers',
    'initiativeSync',
];

function normalizeAutomationRules(value = {}) {
    const normalized = { ...DEFAULT_AUTOMATION_RULES };
    for (const key of BOOLEAN_RULES) {
        if (typeof value[key] === 'boolean') normalized[key] = value[key];
    }
    if (value.concentrationChecks === 'automatic' || value.concentrationChecks === 'prompt') {
        normalized.concentrationChecks = value.concentrationChecks;
    }
    return normalized;
}

function getAutomationRules(db) {
    const row = db.prepare("SELECT value FROM campaign_state WHERE key = 'automation_rules'").get();
    if (!row?.value) return { ...DEFAULT_AUTOMATION_RULES };
    try {
        return normalizeAutomationRules(JSON.parse(row.value));
    } catch (_error) {
        return { ...DEFAULT_AUTOMATION_RULES };
    }
}

function setAutomationRules(db, patch) {
    const rules = normalizeAutomationRules({ ...getAutomationRules(db), ...(patch || {}) });
    db.prepare("INSERT OR REPLACE INTO campaign_state (key, value) VALUES ('automation_rules', ?)")
        .run(JSON.stringify(rules));
    return rules;
}

module.exports = {
    DEFAULT_AUTOMATION_RULES,
    getAutomationRules,
    normalizeAutomationRules,
    setAutomationRules,
};
