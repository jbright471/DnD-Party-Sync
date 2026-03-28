/**
 * SharedLootPool — player-facing card that shows the shared party loot pool.
 *
 * Each item displays name, rarity, description, and a "Claim" button that
 * transfers the item to the player's personal homebrew inventory.
 */

import { Gem, Swords, Trash2 } from 'lucide-react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { useGame } from '../context/GameContext';
import { toast } from 'sonner';
import socket from '../socket';

const RARITY_COLORS: Record<string, string> = {
  Common:      'text-foreground/60',
  Uncommon:    'text-green-400',
  Rare:        'text-blue-400',
  'Very Rare': 'text-purple-400',
  Legendary:   'text-amber-400',
  Artifact:    'text-red-400',
};

const RARITY_BORDER: Record<string, string> = {
  Common:      'border-border/40',
  Uncommon:    'border-green-800/30',
  Rare:        'border-blue-800/30',
  'Very Rare': 'border-purple-800/30',
  Legendary:   'border-amber-700/30',
  Artifact:    'border-red-700/30',
};

interface SharedLootPoolProps {
  /** Character that will receive claimed items */
  characterId?: string;
  characterName?: string;
  /** DM mode — show remove buttons instead of claim */
  isDm?: boolean;
}

export function SharedLootPool({ characterId, characterName, isDm }: SharedLootPoolProps) {
  const { state } = useGame();
  const items = state.sharedLoot;

  if (items.length === 0) return null;

  const handleClaim = (lootId: number, itemName: string) => {
    if (!characterId || !characterName) {
      toast.error('No character selected to claim loot.');
      return;
    }
    socket.emit('claim_loot', {
      lootId,
      characterId: parseInt(characterId),
      characterName,
    });
    toast.success(`${characterName} claimed ${itemName}!`);
  };

  const handleRemove = (lootId: number) => {
    socket.emit('remove_loot', { lootId });
  };

  return (
    <Card className="border-gold/20 bg-gold/[0.02]">
      <CardHeader className="pb-2">
        <CardTitle className="font-display text-sm flex items-center gap-2 text-gold">
          <Gem className="h-4 w-4" />
          Party Loot Pool
          <Badge variant="outline" className="text-[9px] ml-auto border-gold/30 text-gold">
            {items.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map(item => {
          const stats = item.stats as Record<string, unknown>;
          const category = (stats?.category as string) || item.category || 'Item';

          return (
            <div
              key={item.id}
              className={`rounded-lg border p-3 bg-secondary/20 space-y-1.5 ${RARITY_BORDER[item.rarity] || 'border-border/40'}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className={`font-display text-sm font-bold ${RARITY_COLORS[item.rarity] || ''}`}>
                    {item.name}
                  </span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Badge variant="outline" className="text-[8px] h-4">{item.rarity}</Badge>
                    <span className="text-[9px] text-muted-foreground">{category}</span>
                  </div>
                </div>
                {isDm ? (
                  <button
                    onClick={() => handleRemove(item.id)}
                    className="text-muted-foreground/30 hover:text-destructive/70 transition-colors shrink-0 mt-1"
                    title="Remove from pool"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => handleClaim(item.id, item.name)}
                    className="h-7 text-[10px] font-display bg-gold text-primary-foreground hover:bg-gold/90 shrink-0"
                  >
                    <Swords className="h-3 w-3 mr-1" /> Claim
                  </Button>
                )}
              </div>

              {item.description && (
                <p className="text-[10px] text-muted-foreground leading-relaxed line-clamp-2">
                  {item.description}
                </p>
              )}

              {/* Quick stat badges */}
              <div className="flex flex-wrap gap-1">
                {stats?.damageType && (
                  <Badge variant="outline" className="text-[8px] h-4 text-red-400 border-red-800/30">
                    {stats.damageCount as number || 1}{stats.damageDice as string} {stats.damageType as string}
                  </Badge>
                )}
                {(stats?.baseAc as number) > 0 && (
                  <Badge variant="outline" className="text-[8px] h-4 text-mana border-mana/30">
                    AC {stats.baseAc as number}{(stats?.plusBonus as number) > 0 ? `+${stats.plusBonus}` : ''}
                  </Badge>
                )}
                {stats?.requiresAttunement && (
                  <Badge variant="outline" className="text-[8px] h-4 text-purple-400 border-purple-800/30">
                    Attunement
                  </Badge>
                )}
                {(stats?.charges as number) && (
                  <Badge variant="outline" className="text-[8px] h-4 text-muted-foreground">
                    {stats.charges as number} charges
                  </Badge>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
