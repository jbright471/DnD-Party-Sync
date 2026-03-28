import { useState, useEffect } from 'react';
import socket from '../socket';

export interface HpChangeEvent {
  characterId: number;
  characterName: string;
  currentHp: number;
  maxHp: number;
  delta: number;
  type: 'damage' | 'heal';
  damageType: string | null;
  actor: string;
  timestamp: string;
}

/**
 * useHpFlash — DM-side hook that tracks which character cards should be
 * flashing (damage=red, heal=green). Returns a Map of characterId → flash type.
 *
 * Each flash auto-clears after 800ms, matching the CSS animation duration.
 */
export function useHpFlash() {
  const [flashes, setFlashes] = useState<Map<string, 'damage' | 'heal'>>(new Map());

  useEffect(() => {
    const handler = (event: HpChangeEvent) => {
      const charKey = String(event.characterId);
      const type = event.delta < 0 ? 'damage' : 'heal';

      setFlashes(prev => {
        const next = new Map(prev);
        next.set(charKey, type);
        return next;
      });

      // Auto-clear after animation completes
      setTimeout(() => {
        setFlashes(prev => {
          const next = new Map(prev);
          next.delete(charKey);
          return next;
        });
      }, 800);
    };

    socket.on('hp_change_event', handler);
    return () => { socket.off('hp_change_event', handler); };
  }, []);

  return flashes;
}
