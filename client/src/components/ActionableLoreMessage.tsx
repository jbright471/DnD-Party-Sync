/**
 * ActionableLoreMessage — renders an AI lore response with interactive
 * entity cards that let the DM inject items, monsters, and NPCs into
 * the live game state with one click.
 */

import { useState } from 'react';
import { parseLoreMessage, type ParsedEntity, type ParsedLoreMessage } from '../lib/loreParser';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { cn } from '../lib/utils';
import socket from '../socket';
import { toast } from 'sonner';
import {
  Gem, Swords, Users, Check, Package, Shield, Heart, Zap,
} from 'lucide-react';

// ── Type config ──────────────────────────────────────────────────────────

const ENTITY_META: Record<string, {
  icon: typeof Gem;
  label: string;
  action: string;
  added: string;
  color: string;
  border: string;
  bg: string;
}> = {
  item: {
    icon: Gem,
    label: 'Item',
    action: 'Send to Party Loot',
    added: 'Added to Loot Pool!',
    color: 'text-amber-300',
    border: 'border-amber-700/40',
    bg: 'bg-amber-950/30',
  },
  monster: {
    icon: Swords,
    label: 'Monster',
    action: 'Add to Combat Tracker',
    added: 'Spawned into Combat!',
    color: 'text-red-400',
    border: 'border-red-700/40',
    bg: 'bg-red-950/30',
  },
  npc: {
    icon: Users,
    label: 'NPC',
    action: 'Save to Notes',
    added: 'Saved to Notes!',
    color: 'text-blue-400',
    border: 'border-blue-700/40',
    bg: 'bg-blue-950/30',
  },
};

// ── Main component ───────────────────────────────────────────────────────

interface ActionableLoreMessageProps {
  rawText: string;
}

export function ActionableLoreMessage({ rawText }: ActionableLoreMessageProps) {
  const parsed = parseLoreMessage(rawText);

  return (
    <div className="space-y-3">
      {/* Narrative text */}
      {parsed.text && (
        <div className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">
          {parsed.text}
        </div>
      )}

      {/* Entity action cards */}
      {parsed.entities.length > 0 && (
        <div className="space-y-2 pt-1">
          {parsed.entities.map((entity, idx) => (
            <EntityActionCard key={idx} entity={entity} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Entity Action Card ───────────────────────────────────────────────────

function EntityActionCard({ entity }: { entity: ParsedEntity }) {
  const [added, setAdded] = useState(false);
  const meta = ENTITY_META[entity.type];
  if (!meta) return null;

  const Icon = meta.icon;
  const name = (entity.data.name as string) || 'Unknown';

  const handleAction = () => {
    if (added) return;

    switch (entity.type) {
      case 'item':
        dropItemToLoot(entity.data);
        break;
      case 'monster':
        spawnMonsterToCombat(entity.data);
        break;
      case 'npc':
        saveNpcToNotes(entity.data);
        break;
    }

    setAdded(true);
  };

  return (
    <div className={cn(
      'rounded-lg border p-3 space-y-2 transition-all',
      meta.border,
      meta.bg,
      added && 'opacity-60',
    )}>
      {/* Entity header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className={cn('h-4 w-4 shrink-0', meta.color)} />
          <span className={cn('font-display font-bold text-sm truncate', meta.color)}>
            {name}
          </span>
          <Badge variant="outline" className={cn('text-[8px] shrink-0', meta.border, meta.color)}>
            {meta.label}
          </Badge>
        </div>

        <Button
          size="sm"
          variant={added ? 'ghost' : 'outline'}
          disabled={added}
          onClick={handleAction}
          className={cn(
            'h-7 text-[10px] font-display shrink-0 transition-all',
            added
              ? 'text-green-400 border-green-800/30 cursor-default'
              : `${meta.color} ${meta.border} hover:${meta.bg}`,
          )}
        >
          {added ? (
            <><Check className="h-3 w-3 mr-1" /> {meta.added}</>
          ) : (
            <><Package className="h-3 w-3 mr-1" /> {meta.action}</>
          )}
        </Button>
      </div>

      {/* Quick stat preview */}
      <EntityPreview type={entity.type} data={entity.data} />
    </div>
  );
}

// ── Stat previews ────────────────────────────────────────────────────────

function EntityPreview({ type, data }: { type: string; data: Record<string, unknown> }) {
  if (type === 'item') {
    return (
      <div className="flex flex-wrap gap-1.5">
        {data.rarity && (
          <Badge variant="outline" className="text-[8px] h-4">{data.rarity as string}</Badge>
        )}
        {data.category && (
          <Badge variant="outline" className="text-[8px] h-4 text-muted-foreground">{data.category as string}</Badge>
        )}
        {data.damage && (
          <Badge variant="outline" className="text-[8px] h-4 text-red-400 border-red-800/30">
            {data.damage as string}
          </Badge>
        )}
        {data.requiresAttunement && (
          <Badge variant="outline" className="text-[8px] h-4 text-purple-400 border-purple-800/30">
            Attunement
          </Badge>
        )}
        {data.description && (
          <p className="w-full text-[10px] text-muted-foreground/60 italic leading-relaxed mt-1">
            {data.description as string}
          </p>
        )}
      </div>
    );
  }

  if (type === 'monster') {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {data.ac != null && (
          <div className="flex items-center gap-1 text-[10px]">
            <Shield className="h-3 w-3 text-mana" />
            <span className="font-bold">{data.ac as number}</span>
            <span className="text-muted-foreground">AC</span>
          </div>
        )}
        {data.hp != null && (
          <div className="flex items-center gap-1 text-[10px]">
            <Heart className="h-3 w-3 text-destructive" />
            <span className="font-bold">{data.hp as number}</span>
            <span className="text-muted-foreground">HP</span>
          </div>
        )}
        {data.challenge_rating != null && (
          <Badge variant="outline" className="text-[8px] h-4">
            CR {data.challenge_rating as string}
          </Badge>
        )}
        {data.speed && (
          <div className="flex items-center gap-1 text-[10px]">
            <Zap className="h-3 w-3 text-primary" />
            <span className="text-muted-foreground">{data.speed as string}</span>
          </div>
        )}
        {data.size && data.type && (
          <span className="text-[10px] text-muted-foreground/50">
            {data.size as string} {data.type as string}
          </span>
        )}
      </div>
    );
  }

  if (type === 'npc') {
    return (
      <div className="space-y-1">
        {data.role && (
          <Badge variant="outline" className="text-[8px] h-4">{data.role as string}</Badge>
        )}
        {data.personality && (
          <p className="text-[10px] text-muted-foreground/60 italic">{data.personality as string}</p>
        )}
        {data.appearance && (
          <p className="text-[10px] text-muted-foreground/50">{data.appearance as string}</p>
        )}
      </div>
    );
  }

  return null;
}

// ── Socket dispatch helpers ──────────────────────────────────────────────

function dropItemToLoot(data: Record<string, unknown>) {
  socket.emit('drop_loot', {
    name: (data.name as string) || 'Unknown Item',
    description: (data.description as string) || '',
    category: (data.category as string) || 'Gear',
    rarity: (data.rarity as string) || 'Common',
    stats: {
      damage: data.damage || null,
      damageType: data.damageType || null,
      baseAc: data.acBonus || 0,
      requiresAttunement: data.requiresAttunement || false,
      properties: data.properties || '',
    },
    droppedBy: 'AI Lore Console',
  });
  toast.success(`${data.name} dropped into the Party Loot Pool!`);
}

function spawnMonsterToCombat(data: Record<string, unknown>) {
  const dex = (data.DEX as number) || 10;
  const dexMod = Math.floor((dex - 10) / 2);
  socket.emit('spawn_monster', {
    name: (data.name as string) || 'Unknown Monster',
    hp: (data.hp as number) || 10,
    ac: (data.ac as number) || 10,
    initiative_mod: dexMod,
    is_hidden: false,
    stats: data,
  });
  toast.success(`${data.name} spawned into the Combat Tracker!`);
}

function saveNpcToNotes(data: Record<string, unknown>) {
  const content = [
    `**${data.name}** — ${data.role || 'NPC'}`,
    data.appearance ? `*${data.appearance}*` : '',
    data.personality ? `Personality: ${data.personality}` : '',
    data.secret ? `Secret: ${data.secret}` : '',
  ].filter(Boolean).join('\n\n');

  socket.emit('create_note', {
    category: 'npc',
    title: (data.name as string) || 'NPC',
    content,
    updated_by: 'AI Lore Console',
  });
  toast.success(`${data.name} saved to Party Notes!`);
}
