import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GameProvider, useGame } from './GameContext';

const socket = vi.hoisted(() => ({
  emit: vi.fn(),
  off: vi.fn(),
  on: vi.fn(),
}));

vi.mock('../socket', () => ({ default: socket }));

function EffectStateProbe() {
  const { state } = useGame();
  return <div>{Array.isArray(state.effectEvents) ? 'effect-list' : 'invalid-effect-state'}</div>;
}

describe('GameProvider DM session recovery', () => {
  beforeEach(() => {
    window.localStorage.clear();
    socket.emit.mockReset();
    socket.off.mockReset();
    socket.on.mockReset();
    vi.restoreAllMocks();
  });

  it('keeps effect state renderable when a stored DM session has expired', async () => {
    window.localStorage.setItem('dm_token', 'stale-session-token');
    vi.spyOn(window, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ code: 'REST_DM_REQUIRED' }),
    } as Response);

    render(
      <GameProvider>
        <EffectStateProbe />
      </GameProvider>,
    );

    await waitFor(() => expect(window.fetch).toHaveBeenCalledWith('/api/effect-timeline'));
    await waitFor(() => expect(screen.getByText('effect-list')).toBeInTheDocument());
    expect(window.localStorage.getItem('dm_token')).toBeNull();
  });
});
