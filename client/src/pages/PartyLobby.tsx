import { useGame } from '../context/GameContext';
import { CharacterCard } from '../components/CharacterCard';
import { ActionPanel } from '../components/ActionPanel';
import { InitiativeTracker } from '../components/InitiativeTracker';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Users, ScrollText } from 'lucide-react';

export default function PartyLobby() {
  const { state } = useGame();

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20">
      <div className="flex items-center gap-3 pb-2 border-b border-border/50">
        <div className="p-1.5 rounded-lg bg-health/10 border border-health/20">
          <Users className="h-6 w-6 text-health" />
        </div>
        <div>
          <h1 className="text-3xl font-display tracking-wider leading-none">Party Lobby</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Active adventurers &amp; combat tracker</p>
        </div>
      </div>

      {/* Party Members */}
      <div>
        <h2 className="text-xl font-display mb-4 tracking-tight">Active Adventurers</h2>
        {state.characters.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {state.characters.map(m => (
              <CharacterCard key={m.id} character={m} />
            ))}
          </div>
        ) : (
          <Card className="border-dashed border-border/60">
            <CardContent className="p-10 text-center text-muted-foreground space-y-2">
              <Users className="h-10 w-10 mx-auto opacity-20" />
              <p className="text-sm">No adventurers in the field.</p>
              <p className="text-xs opacity-60">Create or import characters to begin your adventure.</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Initiative Tracker */}
      <InitiativeTracker />

      {/* Action Panel */}
      <ActionPanel />

      {/* Action Log */}
      {state.party && state.party.actionLog.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="font-display flex items-center gap-2">
              <ScrollText className="h-5 w-5 text-muted-foreground" />
              Recent Actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-80 overflow-y-auto pr-2">
              {state.party.actionLog.map(entry => (
                <div key={entry.id} className="text-sm bg-secondary/20 border border-border/40 rounded-md p-2.5 flex justify-between items-center gap-3 hover:bg-secondary/40 transition-colors duration-150">
                  <div>
                    <span className="font-display text-primary mr-1">{entry.actor}</span>
                    <span className="text-muted-foreground">{entry.action_description}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground font-mono">
                    {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
