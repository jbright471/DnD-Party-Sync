import { type FormEvent, type PropsWithChildren, useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useGame } from '../context/GameContext';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';

type AccessState = 'checking' | 'signed_out' | 'authenticated';

export function DmAccessGate({ children }: PropsWithChildren) {
  const { state, setDmAuth, clearDmAuth } = useGame();
  const [accessState, setAccessState] = useState<AccessState>(
    state.dmToken ? 'checking' : 'signed_out',
  );
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!state.dmToken) {
      setAccessState('signed_out');
      return;
    }

    const controller = new AbortController();
    setAccessState('checking');
    fetch('/api/characters', { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error('stored_session_rejected');
        setAccessState('authenticated');
      })
      .catch(fetchError => {
        if (fetchError instanceof DOMException && fetchError.name === 'AbortError') return;
        clearDmAuth();
        setAccessState('signed_out');
      });

    return () => controller.abort();
  }, [state.dmToken, clearDmAuth]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setAccessState('checking');

    try {
      const response = await fetch('/api/auth/dm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const payload = await response.json();
      if (!response.ok || typeof payload.token !== 'string') {
        throw new Error('login_rejected');
      }
      setDmAuth(payload.token);
      setPin('');
      setAccessState('authenticated');
    } catch {
      setError('The DM PIN was not accepted.');
      setAccessState('signed_out');
    }
  };

  if (accessState === 'authenticated') return children;

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md items-center justify-center px-4">
      <Card className="w-full border-primary/20 bg-secondary/10">
        <CardHeader className="text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-primary" />
          <CardTitle className="font-display">DM Authentication</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="dm-pin">DM PIN</Label>
              <Input
                id="dm-pin"
                type="password"
                autoComplete="current-password"
                value={pin}
                onChange={event => setPin(event.target.value)}
                disabled={accessState === 'checking'}
                required
              />
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={accessState === 'checking'}>
              {accessState === 'checking' ? 'Checking…' : 'Unlock DM Tools'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
