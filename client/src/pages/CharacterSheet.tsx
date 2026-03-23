import { useParams, useNavigate } from 'react-router-dom';
import { useGame } from '../context/GameContext';
import { getAbilityModifier, rollDice } from '../types/character';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import {
  Heart, Shield, Footprints, Trash2, ArrowLeft, Swords,
  Sparkles, RefreshCw, Brain, Zap,
} from 'lucide-react';
import { DiceRoller } from '../components/DiceRoller';
import { RollableStat } from '../components/RollableStat';
import { StatChecks } from '../components/StatChecks';
import { ActionsPanel } from '../components/ActionsPanel';
import { ConditionBadges } from '../components/ConditionBadges';
import { useState } from 'react';
import { toast } from 'sonner';
import { backend } from '../integrations/backend';
import socket from '../socket';

const ABILITY_LABELS: Record<string, string> = {
  STR: 'Strength', DEX: 'Dexterity', CON: 'Constitution',
  INT: 'Intelligence', WIS: 'Wisdom', CHA: 'Charisma',
};

export default function CharacterSheet() {
  const { id } = useParams<{ id: string }>();
  const { state } = useGame();
  const navigate = useNavigate();
  const character = state.characters.find(c => c.id === id);
  const [hpChange, setHpChange] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [parsingItem, setIsParsingItem] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!character) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground text-lg">Character not found</p>
        <Button variant="outline" onClick={() => navigate('/')} className="mt-4">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
        </Button>
      </div>
    );
  }

  // ── Derived values ─────────────────────────────────────────────────────────
  const hpPercent = Math.min(100, (character.hp.current / character.hp.max) * 100);
  const initMod = character.initiative ?? getAbilityModifier(character.abilityScores.DEX);
  const initModStr = initMod >= 0 ? `+${initMod}` : `${initMod}`;

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleHeal = () => {
    const amt = parseInt(hpChange);
    if (!amt || amt <= 0) return;
    backend.updateHp(character.id, amt);
    toast.success(`Healed ${character.name} for ${amt} HP`);
    setHpChange('');
  };

  const handleDamage = () => {
    const amt = parseInt(hpChange);
    if (!amt || amt <= 0) return;
    backend.updateHp(character.id, -amt);
    toast.success(`${character.name} took ${amt} damage`);
    setHpChange('');
  };

  const handleDelete = () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    backend.deleteCharacter(character.id);
    toast.success(`${character.name} has been removed`);
    navigate('/');
  };

  const handleSync = async () => {
    let url = '';
    try {
      const raw = JSON.parse(character.raw_dndbeyond_json || '{}');
      url = raw.readonlyUrl || '';
    } catch (e) {}
    if (!url) {
      url = prompt('Enter D&D Beyond URL:', 'https://www.dndbeyond.com/characters/...') || '';
    }
    if (!url) return;
    setIsSyncing(true);
    try {
      await backend.syncDdb(character.id, url);
      toast.success('Character synced with D&D Beyond');
    } catch (e) {
      toast.error('Sync failed');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleParseItem = async (item: any, isHomebrew: boolean) => {
    setIsParsingItem(item.id);
    try {
      await backend.parseItem(character.id, item.id, item.name, item.description || '', isHomebrew);
      toast.success(`Parsed mechanics for ${item.name}`);
    } catch (e) {
      toast.error('AI parsing failed');
    } finally {
      setIsParsingItem(null);
    }
  };

  const handleInitiativeRoll = () => {
    const roll = rollDice('d20', 1, initMod);
    socket.emit('dice_roll', {
      actor: character.name,
      sides: 20,
      count: 1,
      modifier: initMod,
      total: roll.total,
      rolls: roll.results,
      label: 'Initiative',
      rollType: 'Initiative',
    });
    toast(`Initiative Roll`, {
      description: `[${roll.results[0]}] ${initModStr} = ${roll.total}`,
      duration: 3000,
    });
  };

  // ── Layout ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-7xl mx-auto pb-20 px-4 sm:px-6">

      {/* ════════════════════════════════════════════════════════════
          HEADER — full width, always visible
      ════════════════════════════════════════════════════════════ */}
      <div className="pt-4 pb-6 space-y-3">

        {/* Name row */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')} className="shrink-0">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="min-w-0">
              <h1 className="text-3xl font-display tracking-wider truncate">{character.name}</h1>
              <p className="text-muted-foreground text-sm">Level {character.level} {character.class}</p>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={handleSync} disabled={isSyncing}>
              <RefreshCw className={`h-4 w-4 mr-1 ${isSyncing ? 'animate-spin' : ''}`} />
              Sync DDB
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              onBlur={() => setConfirmDelete(false)}
              className={confirmDelete ? 'animate-pulse' : ''}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              {confirmDelete ? 'Confirm?' : 'Delete'}
            </Button>
          </div>
        </div>

        {/* Stats banner */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4 sm:items-center">

              {/* HP widget */}
              <div className="flex-1 space-y-2 min-w-0">
                <div className="flex items-baseline gap-2">
                  <Heart className="h-4 w-4 text-destructive shrink-0 self-center" />
                  <span className="text-2xl font-display font-bold">
                    {character.hp.current}
                    <span className="text-muted-foreground text-base font-normal">/{character.hp.max}</span>
                  </span>
                  {character.hp.temp > 0 && (
                    <span className="text-mana text-sm font-display">+{character.hp.temp} temp</span>
                  )}
                </div>
                <div className="h-2 rounded-full bg-secondary overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      hpPercent > 50 ? 'bg-health' : hpPercent > 25 ? 'bg-gold' : 'bg-destructive'
                    }`}
                    style={{ width: `${hpPercent}%` }}
                  />
                </div>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder="Amount"
                    value={hpChange}
                    onChange={e => setHpChange(e.target.value)}
                    className="w-20 h-8 text-sm"
                  />
                  <Button variant="outline" size="sm" onClick={handleHeal} className="text-health border-health/30 h-8">
                    <Heart className="h-3.5 w-3.5 mr-1" /> Heal
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleDamage} className="text-destructive border-destructive/30 h-8">
                    <Swords className="h-3.5 w-3.5 mr-1" /> Dmg
                  </Button>
                </div>
              </div>

              {/* Dividers */}
              <div className="hidden sm:block w-px self-stretch bg-border/50" />
              <div className="sm:hidden h-px bg-border/50" />

              {/* Combat stat pills */}
              <div className="flex flex-wrap gap-2">
                {/* AC */}
                <div className="flex flex-col items-center justify-center px-3 py-2 rounded-lg border border-border bg-secondary/20 min-w-[56px]">
                  <Shield className="h-3.5 w-3.5 text-mana mb-0.5" />
                  <span className="text-[9px] text-muted-foreground font-display uppercase tracking-wider">AC</span>
                  <span className="font-display font-bold text-lg leading-tight">{character.ac}</span>
                </div>
                {/* Proficiency */}
                <div className="flex flex-col items-center justify-center px-3 py-2 rounded-lg border border-border bg-secondary/20 min-w-[56px]">
                  <Sparkles className="h-3.5 w-3.5 text-primary mb-0.5" />
                  <span className="text-[9px] text-muted-foreground font-display uppercase tracking-wider">PROF</span>
                  <span className="font-display font-bold text-lg leading-tight">+{character.proficiencyBonus}</span>
                </div>
                {/* Speed */}
                <div className="flex flex-col items-center justify-center px-3 py-2 rounded-lg border border-border bg-secondary/20 min-w-[56px]">
                  <Footprints className="h-3.5 w-3.5 text-muted-foreground mb-0.5" />
                  <span className="text-[9px] text-muted-foreground font-display uppercase tracking-wider">SPD</span>
                  <span className="font-display font-bold text-lg leading-tight">{character.speed}ft</span>
                </div>
                {/* Initiative — clickable */}
                <button
                  onClick={handleInitiativeRoll}
                  title={`Roll Initiative (1d20 ${initModStr})`}
                  aria-label="Roll Initiative"
                  className="group flex flex-col items-center justify-center px-3 py-2 rounded-lg border border-border bg-secondary/20 min-w-[56px] hover:border-primary/50 hover:bg-primary/10 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <Zap className="h-3.5 w-3.5 text-primary mb-0.5 group-hover:text-primary transition-colors" />
                  <span className="text-[9px] text-muted-foreground font-display uppercase tracking-wider">INIT</span>
                  <span className="font-display font-bold text-lg leading-tight text-primary">{initModStr}</span>
                </button>
              </div>

            </div>

            {/* ── Conditions row ──────────────────────────────────── */}
            <div className="border-t border-border/30 pt-2.5 flex items-center gap-2.5">
              <span className="text-[9px] font-display tracking-widest uppercase text-muted-foreground/40 shrink-0 select-none">
                COND
              </span>
              <ConditionBadges character={character} />
            </div>

          </CardContent>
        </Card>
      </div>

      {/* ════════════════════════════════════════════════════════════
          MAIN GRID
          Left  (lg): 280px — fixed stat block, sticky
          Right (lg): 1fr  — active play area, scrolls independently
      ════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6 items-start">

        {/* ── LEFT COLUMN: Stat Block ─────────────────────────── */}
        <div className="space-y-4 lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pb-4">

          {/* Ability Scores */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="font-display text-sm">Ability Scores</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(character.abilityScores).map(([key, val]) => (
                  <RollableStat
                    key={key}
                    label={ABILITY_LABELS[key]}
                    sublabel={key}
                    score={val}
                    modifier={getAbilityModifier(val)}
                    rollType="Ability Check"
                    characterName={character.name}
                    variant="card"
                  />
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Saving Throws + Skills */}
          <StatChecks character={character} />

        </div>

        {/* ── RIGHT COLUMN: Active Play ───────────────────────── */}
        <div className="space-y-4">

          {/* Dice Roller — compact so it doesn't dominate */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="font-display text-sm">Dice Roller</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <DiceRoller characterName={character.name} compact />
            </CardContent>
          </Card>

          {/* Attack Actions */}
          <ActionsPanel character={character} />

          {/* Inventory */}
          <Card>
            <CardHeader>
              <CardTitle className="font-display flex items-center gap-2">
                <Shield className="h-5 w-5 text-mana" /> Inventory
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">

              {/* Homebrew Gear */}
              {character.homebrewInventory.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-display text-gold tracking-widest uppercase">Homebrew Gear</h3>
                  {character.homebrewInventory.map(item => (
                    <div key={item.id} className="flex items-center justify-between bg-gold/5 border border-gold/20 rounded p-2">
                      <div>
                        <span className="font-display text-sm text-gold">{item.name}</span>
                        <p className="text-[10px] text-muted-foreground line-clamp-1">{item.description}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-[10px]"
                        onClick={() => handleParseItem(item, true)}
                        disabled={parsingItem === item.id}
                      >
                        <Brain className={`h-3 w-3 mr-1 ${parsingItem === item.id ? 'animate-pulse' : ''}`} />
                        {item.stats ? 'Re-Parse' : 'Parse AI'}
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Standard Equipment */}
              <div className="space-y-2">
                <h3 className="text-xs font-display text-muted-foreground tracking-widest uppercase">Standard Equipment</h3>
                {character.equipment.length === 0 && (
                  <p className="text-xs text-muted-foreground/50 italic">No equipment — sync from D&amp;D Beyond to populate.</p>
                )}
                {character.equipment.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-secondary/30 rounded p-2">
                    <div>
                      <span className="font-display text-sm">{item.name}</span>
                      {item.stats && (
                        <div className="flex gap-1 mt-1">
                          {item.stats.acBonus > 0 && <Badge className="bg-health/20 text-health text-[8px] h-4">+{item.stats.acBonus} AC</Badge>}
                          {item.stats.speedBonus > 0 && <Badge className="bg-mana/20 text-mana text-[8px] h-4">+{item.stats.speedBonus}ft</Badge>}
                        </div>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-[10px]"
                      onClick={() => handleParseItem(item, false)}
                      disabled={parsingItem === `inv-${idx}`}
                    >
                      <Brain className="h-3 w-3 mr-1" /> Parse
                    </Button>
                  </div>
                ))}
              </div>

            </CardContent>
          </Card>

        </div>
        {/* end right column */}

      </div>
      {/* end main grid */}

    </div>
  );
}
