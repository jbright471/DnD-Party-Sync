import { Character, getAbilityModifier } from '../types/character';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';
import { Heart, Shield, Footprints, AlertTriangle, MoreVertical, Wind } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '../context/GameContext';
import socket from '../socket';

interface CharacterCardProps {
  character: Character;
  onClick?: () => void;
  selected?: boolean;
  compact?: boolean;
}

export function CharacterCard({ character, onClick, selected, compact }: CharacterCardProps) {
  const navigate = useNavigate();
  const { state } = useGame();
  const { isDm } = state;
  const hpPercent = (character.hp.current / character.hp.max) * 100;
  const hpColor = hpPercent > 50 ? 'bg-health' : hpPercent > 25 ? 'bg-gold' : 'bg-destructive';

  const handleClick = () => {
    if (onClick) onClick();
    else navigate(`/character/${character.id}`);
  };

  const handleBreakConcentration = (e: React.MouseEvent) => {
    e.stopPropagation();
    socket.emit('drop_concentration', { characterId: parseInt(character.id!), actor: 'DM' });
  };

  return (
    <Card
      className={`cursor-pointer transition-all duration-200 hover:border-primary/60 hover:shadow-lg hover:shadow-primary/10 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
        selected ? 'border-primary shadow-lg shadow-primary/20 animate-pulse-glow' : ''
      }`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(); } }}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-display">{character.name || 'Unnamed'}</CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-body">
              Lv.{character.level} {character.class}
            </span>
            {isDm && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                  <button
                    className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground/50 hover:text-foreground hover:bg-secondary/50 transition-colors"
                    aria-label="Character options"
                  >
                    <MoreVertical className="h-3 w-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44" onClick={e => e.stopPropagation()}>
                  {character.concentratingOn && (
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive cursor-pointer text-xs"
                      onSelect={handleBreakConcentration}
                    >
                      <Wind className="h-3 w-3 mr-2" />
                      Break Concentration
                    </DropdownMenuItem>
                  )}
                  {!character.concentratingOn && (
                    <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                      Not concentrating
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-1">
              <Heart className="h-3.5 w-3.5 text-destructive" />
              <span>HP</span>
            </div>
            <span className="font-display text-sm">
              {character.hp.current}/{character.hp.max}
              {character.hp.temp > 0 && <span className="text-mana"> +{character.hp.temp}</span>}
            </span>
          </div>
          <div className="h-2 rounded-full bg-secondary overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-500 ${hpColor}`} style={{ width: `${hpPercent}%` }} />
          </div>
        </div>

        <div className="flex gap-3 text-sm">
          <div className="flex items-center gap-1">
            <Shield className="h-3.5 w-3.5 text-mana" />
            <span className="font-display">{character.ac}</span>
          </div>
          <div className="flex items-center gap-1">
            <Footprints className="h-3.5 w-3.5 text-muted-foreground" />
            <span>{character.speed}ft</span>
          </div>
        </div>

        {/* Concentration indicator */}
        {character.concentratingOn && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded border border-blue-500/30 bg-blue-950/20">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
            </span>
            <span className="text-[10px] text-blue-400 font-semibold truncate">
              Conc: {character.concentratingOn}
            </span>
          </div>
        )}

        {!compact && (
          <div className="grid grid-cols-6 gap-1 text-center">
            {(Object.entries(character.abilityScores) as [string, number][]).map(([key, val]) => (
              <div key={key} className="bg-secondary/50 rounded p-1">
                <div className="text-[10px] text-muted-foreground font-display">{key}</div>
                <div className="text-sm font-bold">{val}</div>
                <div className="text-[10px] text-primary">
                  {getAbilityModifier(val) >= 0 ? '+' : ''}{getAbilityModifier(val)}
                </div>
              </div>
            ))}
          </div>
        )}

        {character.conditions.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-xs text-destructive">
              <AlertTriangle className="h-3 w-3" />
              <span className="font-display">Conditions</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {character.conditions.map(c => {
                const dur = character.conditionDurations?.[c.toLowerCase()];
                return (
                  <Badge key={c} variant="destructive" className="text-[10px] px-1.5 py-0.5">
                    {c}{dur != null && <span className="ml-0.5 opacity-70">({dur})</span>}
                  </Badge>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
