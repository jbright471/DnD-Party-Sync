import { useCallback } from 'react';
import socket from '../socket';
import { toast } from 'sonner';

/**
 * useHpBroadcast — player-side hook that broadcasts an HP change to the server
 * and shows optimistic local feedback.
 *
 * Usage:
 *   const { broadcast } = useHpBroadcast(character.id, character.name);
 *   broadcast(-5, 'fire');   // damage
 *   broadcast(10);           // heal
 */
export function useHpBroadcast(characterId: string, characterName: string) {
  const broadcast = useCallback(
    (delta: number, damageType?: string) => {
      if (!delta) return;
      if (!navigator.onLine) {
        toast.warning('Offline — HP changes cannot be saved.');
        return;
      }

      const absDelta = Math.abs(delta);
      const type = delta < 0 ? 'damage' : 'heal';

      // Optimistic toast — shown before the server roundtrip
      if (type === 'damage') {
        toast.error(`${characterName} took ${absDelta}${damageType ? ` ${damageType}` : ''} damage`);
      } else {
        toast.success(`${characterName} healed for ${absDelta} HP`);
      }

      socket.emit('update_hp', {
        characterId: parseInt(characterId),
        delta,
        actor: characterName,
        damageType: type === 'damage' ? (damageType || 'untyped') : undefined,
      });
    },
    [characterId, characterName],
  );

  return { broadcast };
}
