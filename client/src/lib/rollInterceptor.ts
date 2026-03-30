/**
 * rollInterceptor.ts — Cross-Effect Rules Engine
 *
 * Evaluates a character's active conditions and determines advantage,
 * disadvantage, auto-fail, or incapacitation for any requested roll.
 * Mirrors the server-side CONDITION_EFFECTS from rulesEngine.js.
 */

import type { AbilityScore } from '../types/character';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RollAdvantage = 'advantage' | 'disadvantage' | 'straight';

export interface RollModification {
  /** Net result after advantage/disadvantage cancel out */
  advantage: RollAdvantage;
  /** Auto-fail (paralyzed/stunned STR/DEX saves, etc.) */
  autoFail: boolean;
  /** Character cannot act at all (incapacitated, stunned, etc.) */
  incapacitated: boolean;
  /** Human-readable reasons for each modifier applied */
  reasons: string[];
}

export type ActionType =
  | 'attack'
  | 'ability_check'
  | 'saving_throw'
  | 'initiative';

// ---------------------------------------------------------------------------
// Condition Rule Matrix (mirrors server CONDITION_EFFECTS)
// ---------------------------------------------------------------------------

interface ConditionRule {
  attacksDisadvantage?: boolean;
  attacksAdvantage?: boolean;
  checksDisadvantage?: boolean;
  savingThrowDisadvantage?: AbilityScore[];
  autoFail?: AbilityScore[];
  noActions?: boolean;
}

const CONDITION_RULES: Record<string, ConditionRule> = {
  blinded: {
    attacksDisadvantage: true,
  },
  charmed: {
    // Social advantage for charmer — not mechanically applied to the charmed
    // creature's own rolls in 5e RAW.
  },
  deafened: {
    // No mechanical roll penalties in 5e RAW.
  },
  frightened: {
    attacksDisadvantage: true,
    checksDisadvantage: true,
  },
  grappled: {
    // Speed = 0 only; no roll penalties.
  },
  incapacitated: {
    noActions: true,
  },
  invisible: {
    attacksAdvantage: true,
  },
  paralyzed: {
    noActions: true,
    autoFail: ['STR', 'DEX'],
  },
  petrified: {
    noActions: true,
    autoFail: ['STR', 'DEX'],
  },
  poisoned: {
    attacksDisadvantage: true,
    checksDisadvantage: true,
  },
  prone: {
    attacksDisadvantage: true,
  },
  restrained: {
    attacksDisadvantage: true,
    savingThrowDisadvantage: ['DEX'],
  },
  stunned: {
    noActions: true,
    autoFail: ['STR', 'DEX'],
  },
  unconscious: {
    noActions: true,
    autoFail: ['STR', 'DEX'],
  },
};

// ---------------------------------------------------------------------------
// evaluateRoll — the main interceptor
// ---------------------------------------------------------------------------

/**
 * Given a character's active conditions, determine how a requested roll
 * should be modified.
 *
 * @param conditions  Active conditions (Title Case from Character.conditions)
 * @param action      The type of roll being attempted
 * @param ability     The ability score involved (for saves/checks)
 */
export function evaluateRoll(
  conditions: string[],
  action: ActionType,
  ability?: AbilityScore,
): RollModification {
  let hasAdvantage = false;
  let hasDisadvantage = false;
  let autoFail = false;
  let incapacitated = false;
  const reasons: string[] = [];

  for (const condition of conditions) {
    const rule = CONDITION_RULES[condition.toLowerCase()];
    if (!rule) continue;

    // Incapacitation — can't take actions at all
    if (rule.noActions) {
      incapacitated = true;
      reasons.push(`${condition}: Incapacitated`);
    }

    // Auto-fail certain saving throws
    if (action === 'saving_throw' && ability && rule.autoFail?.includes(ability)) {
      autoFail = true;
      reasons.push(`${condition}: Auto-fail ${ability} saves`);
    }

    // Attack roll modifiers
    if (action === 'attack') {
      if (rule.attacksDisadvantage) {
        hasDisadvantage = true;
        reasons.push(`${condition}: Disadvantage on attacks`);
      }
      if (rule.attacksAdvantage) {
        hasAdvantage = true;
        reasons.push(`${condition}: Advantage on attacks`);
      }
    }

    // Ability checks (includes initiative per 5e RAW — initiative is a DEX check)
    if (action === 'ability_check' || action === 'initiative') {
      if (rule.checksDisadvantage) {
        hasDisadvantage = true;
        reasons.push(`${condition}: Disadvantage on ability checks`);
      }
    }

    // Saving throw disadvantage for specific abilities
    if (action === 'saving_throw' && ability && rule.savingThrowDisadvantage?.includes(ability)) {
      hasDisadvantage = true;
      reasons.push(`${condition}: Disadvantage on ${ability} saves`);
    }
  }

  // 5e RAW: advantage + disadvantage cancel to a straight roll
  let advantage: RollAdvantage = 'straight';
  if (hasAdvantage && !hasDisadvantage) advantage = 'advantage';
  else if (hasDisadvantage && !hasAdvantage) advantage = 'disadvantage';
  // both → straight (cancel out)

  return { advantage, autoFail, incapacitated, reasons };
}

// ---------------------------------------------------------------------------
// Roll execution helpers
// ---------------------------------------------------------------------------

/**
 * Roll 2d20 and pick the appropriate result based on advantage state.
 * Returns { chosen, all, isAdvantage, isDisadvantage }.
 */
export function rollWithAdvantage(
  rollFn: () => number,
  advantage: RollAdvantage,
): { chosen: number; all: [number, number]; isAdvantage: boolean; isDisadvantage: boolean } {
  if (advantage === 'straight') {
    const r = rollFn();
    return { chosen: r, all: [r, r], isAdvantage: false, isDisadvantage: false };
  }
  const r1 = rollFn();
  const r2 = rollFn();
  const chosen = advantage === 'advantage' ? Math.max(r1, r2) : Math.min(r1, r2);
  return {
    chosen,
    all: [r1, r2],
    isAdvantage: advantage === 'advantage',
    isDisadvantage: advantage === 'disadvantage',
  };
}

// ---------------------------------------------------------------------------
// UI helper — determine indicator state for a stat button
// ---------------------------------------------------------------------------

export type RollIndicator = 'advantage' | 'disadvantage' | 'auto-fail' | 'incapacitated' | null;

/**
 * Quick check for UI indicators on stat buttons. Returns the most severe
 * modifier applicable, or null if the roll is unmodified.
 */
export function getRollIndicator(
  conditions: string[],
  action: ActionType,
  ability?: AbilityScore,
): RollIndicator {
  const mod = evaluateRoll(conditions, action, ability);
  if (mod.incapacitated) return 'incapacitated';
  if (mod.autoFail) return 'auto-fail';
  if (mod.advantage === 'disadvantage') return 'disadvantage';
  if (mod.advantage === 'advantage') return 'advantage';
  return null;
}
