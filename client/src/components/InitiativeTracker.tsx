import { useGame } from '../context/GameContext';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Swords, SkipForward, StopCircle, Heart, Shield } from 'lucide-react';
import socket from '../socket';

export function InitiativeTracker() {
  const { state } = useGame();
  const tracker = state.initiativeState || [];
  const members = state.characters || [];

  const handleStartCombat = () => {
    socket.emit('start_encounter', { encounterId: 1 });
  };

  const handleEndCombat = () => {
    socket.emit('end_encounter');
  };

  const handleNextTurn = () => {
    socket.emit('next_turn');
  };

  const handleSetInitiative = (trackerId: number, val: number) => {
    socket.emit('set_initiative', { trackerId, initiative: val });
  };

  if (tracker.length === 0) {
    return (
      <Card className="border-primary/20 bg-secondary/5">
        <CardContent className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Swords className="h-5 w-5 text-primary" />
            <span className="font-display text-lg">Combat Tracker</span>
          </div>
          <Button onClick={handleStartCombat} size="sm" className="font-display">
            <Swords className="h-4 w-4 mr-1" /> Start Combat
          </Button>
        </CardContent>
      </Card>
    );
  }

  const activeEntity = tracker.find(e => e.is_active);

  return (
    <Card className="border-primary/20 bg-secondary/5">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="font-display flex items-center gap-2 text-primary">
            <Swords className="h-5 w-5" />
            Initiative
          </CardTitle>
          <Button variant="destructive" size="sm" onClick={handleEndCombat} className="h-7 text-[10px] uppercase tracking-wider">
            <StopCircle className="h-3 w-3 mr-1" /> End Combat
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        {tracker.map((ent, i) => {
          const char = members.find(m => m.id === ent.character_id?.toString());
          const hp = ent.current_hp ?? char?.hp.current ?? 0;
          const maxHp = ent.max_hp ?? char?.hp.max ?? 1;
          const hpPercent = (hp / maxHp) * 100;

          return (
            <div
              key={ent.id}
              className={`flex items-center gap-3 rounded-lg p-2 transition-all border ${
                ent.is_active
                  ? 'bg-primary/10 border-primary/40 shadow-[0_0_15px_rgba(var(--primary),0.1)]'
                  : 'bg-secondary/10 border-transparent'
              }`}
            >
              <div className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold shrink-0 ${
                ent.is_active ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
              }`}>
                {i + 1}
              </div>

              <div className="w-10 text-center">
                <input
                  type="number"
                  value={ent.initiative}
                  onChange={e => handleSetInitiative(ent.id, parseInt(e.target.value) || 0)}
                  className="w-full bg-transparent text-center text-xs font-bold focus:outline-none"
                />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`font-display text-sm truncate ${ent.is_active ? 'text-primary' : ''}`}>
                    {ent.entity_name}
                  </span>
                  {ent.entity_type === 'npc' && <Badge variant="outline" className="text-[8px] h-3 px-1">NPC</Badge>}
                </div>
                
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-0.5">
                    <Heart className="h-2.5 w-2.5 text-destructive" /> {hp}/{maxHp}
                  </span>
                  <span className="flex items-center gap-0.5">
                    <Shield className="h-2.5 w-2.5 text-mana" /> {ent.ac ?? char?.ac}
                  </span>
                </div>
              </div>

              <div className="w-16 h-1 rounded-full bg-secondary/30 overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    hpPercent > 50 ? 'bg-health' : hpPercent > 25 ? 'bg-gold' : 'bg-destructive'
                  }`}
                  style={{ width: `${hpPercent}%` }}
                />
              </div>
            </div>
          );
        })}

        <div className="pt-3">
          <Button onClick={handleNextTurn} className="w-full font-display h-9" size="sm">
            <SkipForward className="h-4 w-4 mr-2" />
            Next Turn
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
