import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DmAccessGate } from './DmAccessGate';

const game = vi.hoisted(() => ({
  dmToken: null as string | null,
  setDmAuth: vi.fn(),
  clearDmAuth: vi.fn(),
}));

vi.mock('../context/GameContext', () => ({
  useGame: () => ({
    state: { dmToken: game.dmToken },
    setDmAuth: game.setDmAuth,
    clearDmAuth: game.clearDmAuth,
  }),
}));

describe('DmAccessGate', () => {
  beforeEach(() => {
    game.dmToken = null;
    game.setDmAuth.mockReset();
    game.clearDmAuth.mockReset();
    vi.restoreAllMocks();
  });

  it('does not mount protected DM content before authentication', () => {
    const fetchSpy = vi.spyOn(window, 'fetch');

    render(<DmAccessGate><div>Protected command center</div></DmAccessGate>);

    expect(screen.getByLabelText('DM PIN')).toBeInTheDocument();
    expect(screen.queryByText('Protected command center')).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('exchanges a valid PIN for a session before mounting protected content', async () => {
    vi.spyOn(window, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ token: 'fresh-session-token' }),
    } as Response);

    render(<DmAccessGate><div>Protected command center</div></DmAccessGate>);
    fireEvent.change(screen.getByLabelText('DM PIN'), { target: { value: 'correct-pin-value' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Unlock DM Tools' }).closest('form')!);

    await waitFor(() => expect(game.setDmAuth).toHaveBeenCalledWith('fresh-session-token'));
    expect(screen.getByText('Protected command center')).toBeInTheDocument();
  });

  it('clears a rejected stored session without mounting protected content', async () => {
    game.dmToken = 'stale-session-token';
    vi.spyOn(window, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ code: 'REST_DM_REQUIRED' }),
    } as Response);

    render(<DmAccessGate><div>Protected command center</div></DmAccessGate>);

    await waitFor(() => expect(game.clearDmAuth).toHaveBeenCalledOnce());
    expect(screen.getByLabelText('DM PIN')).toBeInTheDocument();
    expect(screen.queryByText('Protected command center')).not.toBeInTheDocument();
  });
});
