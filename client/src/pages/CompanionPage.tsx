/**
 * /companion/:characterId — Player mobile second-screen view.
 * Rendered outside the main Layout so it has no sidebar or header.
 * Intended to be shared as a URL: http://host:5173/companion/3
 */
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Swords, Shield, Heart, Zap, Dices, RefreshCw, WifiOff } from 'lucide-react';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { DiceRoller } from '../components/DiceRoller';
import { toast } from 'sonner';
import socket from '../socket';
import { type Character, rollDice } from '../types/character';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hpBarColor(pct: number, dead: boolean) {
  if (dead) return 'bg-muted-foreground/40';
  if (pct > 50) return 'bg-health';
  if (pct > 25) return 'bg-gold';
  return 'bg-destructive';
}

function hpTextColor(pct: number, dead: boolean) {
  if (dead) return 'text-muted-foreground';
  if (pct > 50) return 'text-health';
  if (pct > 25) return 'text-gold';
  return 'text-destructive';
}

// ─── Spell slot pips ─────────────────────────────────────────────────────────

function SpellSlotPips({ character }: { character: Character }) {
  const entries = Object.entries(character.spellSlots || {})
    .filter(([, slot]) => slot.max > 0)
    .sort(([a], [b]) => Number(a) - Number(b));

  if (entries.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <div className="text-[9px] uppercase tracking-wider text-primary/50 font-bold">Spell Slots</div>
      <div className="flex flex-wrap gap-2">
        {entries.map(([level, slot]) => {
          const remaining = slot.max - slot.used;
          return (
            <div key={level} className="flex items-center gap-1">
              <span className="text-[8px] text-muted-foreground/50 w-4">L{level}</span>
              <div className="flex gap-0.5">
                {Array.from({ length: slot.max }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-3.5 h-3.5 rounded-sm border transition-colors ${
                      i < remaining
                        ? 'bg-violet-500/60 border-violet-400/50'
                        : 'bg-secondary/20 border-border/30'
                    }`}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Quick attack button ──────────────────────────────────────────────────────

function AttackButton({ attack, characterName }: {
  attack: { id: string; name: string; attackBonus: number; damageDice: string; damageCount: number; damageBonus: number; damageType: string };
  characterName: string;
}) {
  const [rolling, setRolling] = useState(false);

  const handleRoll = () => {
    setRolling(true);
    setTimeout(() => setRolling(false), 600);

    const attackRoll = Math.floor(Math.random() * 20) + 1;
    const isCrit = attackRoll === 20;
    const isFumble = attackRoll === 1;
    const totalAtk = attackRoll + attack.attackBonus;

    const diceCount = isCrit ? attack.damageCount * 2 : attack.damageCount;
    let dmg = 0;
    for (let i = 0; i < diceCount; i++) {
      dmg += Math.floor(Math.random() * parseInt(attack.damageDice.replace('d', ''))) + 1;
    }
    dmg += attack.damageBonus;

    socket.emit('dice_roll', {
      characterName,
      label: `${attack.name} — ATK`,
      rollType: 'attack',
      dice: 'd20',
      count: 1,
      modifier: attack.attackBonus,
      result: attackRoll,
      total: totalAtk,
      isCrit,
      isFumble,
      isPrivate: false,
    });
    socket.emit('dice_roll', {
      characterName,
      label: `${attack.name} — DMG`,
      rollType: 'damage',
      dice: attack.damageDice,
      count: diceCount,
      modifier: attack.damageBonus,
      result: dmg - attack.damageBonus,
      total: dmg,
      damageType: attack.damageType,
      isCrit,
      isPrivate: false,
    });

    if (isCrit) toast.success(`CRITICAL HIT! ${attack.name} — ${dmg} dmg`, { duration: 5000 });
    else if (isFumble) toast.error(`Fumble! ${attack.name} — attack missed`, { duration: 4000 });
    else toast(`${attack.name}: ${totalAtk} to hit / ${dmg} ${attack.damageType} dmg`, { duration: 3000 });
  };

  return (
    <button
      onClick={handleRoll}
      className={`flex-1 min-w-[calc(50%-4px)] py-3 px-2 rounded-lg border text-left transition-all select-none active:scale-95 ${
        rolling
          ? 'bg-primary/20 border-primary/60 scale-95'
          : 'bg-secondary/20 border-border/30 hover:border-primary/30 hover:bg-secondary/30'
      }`}
    >
      <div className="text-[11px] font-bold text-foreground leading-tight">{attack.name}</div>
      <div className="flex items-center gap-1.5 mt-0.5">
        <span className="text-[9px] text-primary font-semibold">
          {attack.attackBonus >= 0 ? '+' : ''}{attack.attackBonus} hit
        </span>
        <span className="text-[8px] text-muted-foreground/40">·</span>
        <span className="text-[9px] text-destructive font-semibold">
          {attack.damageCount}{attack.damageDice}+{attack.damageBonus} {attack.damageType.slice(0, 4)}
        </span>
      </div>
    </button>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CompanionPage() {
  const { characterId } = useParams<{ characterId: string }>();
  const [character, setCharacter] = useState<Character | null>(null);
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [showDice, setShowDice] = useState(false);

  useEffect(() => {
    const onPartyState = (chars: any[]) => {
      const raw = chars.find((c: any) => String(c.id) === characterId);
      if (!raw) return;
      // Minimal normalisation (mirrors GameContext.normaliseCharacter key fields)
      setCharacter({
        id: String(raw.id),
        name: raw.name || 'Unknown',
        class: raw.class || 'Adventurer',
        level: raw.level || 1,
        hp: {
          current: raw.currentHp ?? raw.current_hp ?? 0,
          max: raw.maxHp ?? raw.max_hp ?? 1,
          temp: raw.tempHp ?? raw.temp_hp ?? 0,
        },
        ac: raw.ac || 10,
        acBreakdown: [],
        abilityScores: raw.abilityScores || { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
        abilityModifiers: raw.abilityModifiers || {},
        formattedModifiers: raw.formattedModifiers || {},
        conditions: (raw.conditions || []).map((c: string) => {
          const l = (c || '').toLowerCase().trim();
          return l.charAt(0).toUpperCase() + l.slice(1);
        }),
        conditionDurations: raw.conditionDurations || {},
        equipment: raw.inventory || [],
        homebrewInventory: raw.homebrewInventory || [],
        spellSlots: raw.spellSlotsMax
          ? Object.fromEntries(Object.entries(raw.spellSlotsMax as Record<string, number>).map(([k, max]) => [
              Number(k), { max: max as number, used: (raw.spellSlotsUsed?.[k] as number) || 0 }
            ]).filter(([k]) => Number(k) >= 1 && Number(k) <= 9))
          : {},
        spells: raw.spells || [],
        abilities: raw.features || [],
        skillProficiencies: raw.skillProficiencies || {},
        saveProficiencies: raw.saveProficiencies || {},
        proficiencyBonus: raw.proficiencyBonus ?? (Math.floor(((raw.level || 1) - 1) / 4) + 2),
        speed: raw.speed || 30,
        initiative: raw.initiativeBonus || 0,
        attacks: raw.attacks || [],
      } as Character);
    };

    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);

    socket.on('party_state', onPartyState);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    // Request initial state
    socket.emit('request_party_state', { characterId });

    return () => {
      socket.off('party_state', onPartyState);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, [characterId]);

  if (!character) {
    return (
      <div className="min-h-screen bg-[hsl(240_10%_5%)] flex items-center justify-center">
        <div className="text-center space-y-3">
          <Swords className="h-10 w-10 text-primary/30 mx-auto animate-pulse" />
          <p className="text-muted-foreground text-sm">
            {isConnected ? 'Waiting for party state…' : 'Connecting to Arcane Ally…'}
          </p>
          {!isConnected && (
            <p className="text-[10px] text-muted-foreground/40">
              Make sure the host is running the server.
            </p>
          )}
        </div>
      </div>
    );
  }

  const hp = character.hp.current;
  const maxHp = character.hp.max;
  const tempHp = character.hp.temp;
  const hpPct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
  const isDead = hp <= 0;

  return (
    <div className="min-h-screen bg-[hsl(240_10%_5%)] text-foreground flex flex-col max-w-sm mx-auto">

      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-primary/10 bg-[hsl(240_10%_7%)]">
        <div className="flex items-center gap-2">
          <Swords className="h-4 w-4 text-primary shrink-0" />
          <span className="font-display text-sm font-bold text-primary/80 tracking-widest uppercase">
            Arcane Ally
          </span>
        </div>
        <div className="flex items-center gap-2">
          {!isConnected && (
            <div className="flex items-center gap-1 text-orange-400">
              <WifiOff className="h-3.5 w-3.5" />
              <span className="text-[10px] font-semibold uppercase tracking-wider">Offline</span>
            </div>
          )}
          {isConnected && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
          )}
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">

        {/* Character identity */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-primary leading-tight">{character.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className="text-[8px] h-4 px-1.5 border-primary/30 text-primary/70">
                {character.class}
              </Badge>
              <span className="text-[10px] text-muted-foreground/60">Level {character.level}</span>
              <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground/60">
                <Shield className="h-3 w-3 text-mana" /> {character.ac}
              </span>
            </div>
          </div>
        </div>

        {/* HP section */}
        <div className="space-y-2">
          <div className="flex items-end justify-between">
            <div className="flex items-baseline gap-1">
              <span className={`text-5xl font-bold tabular-nums leading-none font-display ${hpTextColor(hpPct, isDead)}`}>
                {hp}
              </span>
              <span className="text-muted-foreground/50 text-lg">/ {maxHp}</span>
            </div>
            <div className="text-right">
              {tempHp > 0 && (
                <div className="text-[11px] font-semibold text-blue-400">+{tempHp} temp</div>
              )}
              <div className="text-[9px] text-muted-foreground/40 uppercase tracking-wider">
                {isDead ? 'Dead' : hpPct <= 25 ? 'Critical' : hpPct <= 50 ? 'Bloodied' : 'Healthy'}
              </div>
            </div>
          </div>

          {/* HP bar */}
          <div className="h-3 rounded-full bg-secondary/30 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ease-out ${hpBarColor(hpPct, isDead)}`}
              style={{ width: `${Math.max(0, hpPct)}%` }}
            />
          </div>
        </div>

        {/* Conditions */}
        {character.conditions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {character.conditions.map(cond => (
              <span
                key={cond}
                className="text-[10px] font-bold px-2 py-1 rounded-lg bg-orange-500/20 text-orange-400 border border-orange-500/30"
              >
                {cond}
                {character.conditionDurations?.[cond.toLowerCase()]
                  ? ` (${character.conditionDurations[cond.toLowerCase()]}r)`
                  : ''}
              </span>
            ))}
          </div>
        )}

        {/* Ability scores */}
        <div className="grid grid-cols-6 gap-1 text-center">
          {Object.entries(character.abilityScores).map(([key, score]) => (
            <div key={key} className="bg-secondary/20 rounded-lg py-2">
              <div className="text-[7px] font-bold text-muted-foreground/50 uppercase">{key}</div>
              <div className="text-sm font-bold text-foreground">{score as number}</div>
              <div className="text-[10px] text-primary/70">{character.formattedModifiers?.[key] ?? '+0'}</div>
            </div>
          ))}
        </div>

        {/* Quick attacks */}
        {character.attacks && character.attacks.length > 0 && (
          <div className="space-y-2">
            <div className="text-[9px] uppercase tracking-wider text-primary/50 font-bold flex items-center gap-1.5">
              <Swords className="h-3 w-3" /> Quick Attacks
            </div>
            <div className="flex flex-wrap gap-2">
              {(character.attacks as any[]).slice(0, 6).map((atk: any) => (
                <AttackButton key={atk.id} attack={atk} characterName={character.name} />
              ))}
            </div>
          </div>
        )}

        {/* Spell slots */}
        <SpellSlotPips character={character} />

        {/* Dice roller toggle */}
        <div className="space-y-2">
          <button
            onClick={() => setShowDice(v => !v)}
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-primary/20 bg-secondary/10 hover:bg-secondary/20 transition-colors"
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-foreground/80">
              <Dices className="h-4 w-4 text-primary" />
              Dice Roller
            </span>
            <span className="text-[9px] text-muted-foreground/50 uppercase tracking-wider">
              {showDice ? 'Hide' : 'Show'}
            </span>
          </button>

          {showDice && (
            <div className="rounded-lg border border-border/20 bg-secondary/5 p-3">
              <DiceRoller
                compact={false}
                characterName={character.name}
                showPrivateToggle
              />
            </div>
          )}
        </div>

        {/* Footer spacer for iOS safe area */}
        <div className="h-8" />
      </div>
    </div>
  );
}
