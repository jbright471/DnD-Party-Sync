import { describe, it, expect } from 'vitest';
const {
  normalizeRollVisibility,
  buildRollRouting,
  rollServerDice,
} = require('../lib/rollVisibility');

describe('roll visibility routing', () => {
  it('keeps legacy private rolls compatible with the new visibility model', () => {
    expect(normalizeRollVisibility({ isPrivate: true })).toBe('private');
    expect(normalizeRollVisibility({ isPrivate: false })).toBe('public');
  });

  it('routes secret rolls only to the DM and sends a masked acknowledgement to the roller', () => {
    const event = {
      actor: 'Nyx',
      label: 'Stealth',
      rollType: 'Skill Check',
      total: 18,
      rolls: [14],
      modifier: 4,
      timestamp: '2026-07-07T12:00:00.000Z',
    };

    const routing = buildRollRouting(event, 'secret');

    expect(routing.dmEvent.total).toBe(18);
    expect(routing.publicEvent).toBe(null);
    expect(routing.rollerEvent).toMatchObject({
      rollVisibility: 'secret',
      label: 'Stealth',
      masked: true,
    });
    expect(routing.rollerEvent.total).toBeUndefined();
  });

  it('suppresses roller acknowledgement for super-secret rolls', () => {
    const routing = buildRollRouting({ actor: 'Nyx', total: 12, rolls: [12], modifier: 0 }, 'super_secret');

    expect(routing.dmEvent.total).toBe(12);
    expect(routing.publicEvent).toBe(null);
    expect(routing.rollerEvent).toBe(null);
  });

  it('rolls secret dice on the server from the roll spec', () => {
    const result = rollServerDice({ sides: 20, count: 2, modifier: 3 });

    expect(result.sides).toBe(20);
    expect(result.count).toBe(2);
    expect(result.rolls).toHaveLength(2);
    expect(result.total).toBe(result.rolls[0] + result.rolls[1] + 3);
  });

  it('keeps the higher d20 for server-side advantage rolls', () => {
    const result = rollServerDice({ sides: 20, modifier: 2, rollMode: 'advantage' });

    expect(result.count).toBe(2);
    expect(result.rolls).toHaveLength(2);
    expect(result.keptRoll).toBe(Math.max(...result.rolls));
    expect(result.total).toBe(result.keptRoll + 2);
  });
});
