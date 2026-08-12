import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Shield, Heart, Skull, Zap } from 'lucide-react';
import { Badge } from '../components/ui/badge';
import socket from '../socket';
import { type Character } from '../types/character';

interface Combatant {
  id: number;
  character_id: number | null;
  entity_name: string;
  entity_type: 'pc' | 'monster' | 'npc';
  initiative: number;
  current_hp: number | null;
  max_hp: number | null;
  hp_status: string;
  is_active: number;
}

interface CombatState {
  round: number;
  turnIndex: number;
}

export default function EncounterCastView() {
  const { id } = useParams<{ id: string }>();
  const [party, setParty] = useState<Character[]>([]);
  const [initiative, setInitiative] = useState<Combatant[]>([]);
  const [combatState, setCombatState] = useState<CombatState>({ round: 0, turnIndex: 0 });
  const [isConnected, setIsConnected] = useState(socket.connected);

  useEffect(() => {
    const onPartyState = (chars: any[]) => {
      setParty(chars.map((raw: any) => ({
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
        conditions: (raw.conditions || []).map((c: string) => {
          const l = (c || '').toLowerCase().trim();
          return l.charAt(0).toUpperCase() + l.slice(1);
        }),
      } as Character)));
    };

    const onInitiativeState = (state: Combatant[]) => setInitiative(Array.isArray(state) ? state : []);
    const onCombatState = (state: CombatState) => setCombatState(state);
    const registerCastView = () => socket.emit('register_cast_view', { encounterId: id });
    const onConnect = () => {
      setIsConnected(true);
      registerCastView();
    };
    const onDisconnect = () => setIsConnected(false);

    socket.on('party_state', onPartyState);
    socket.on('initiative_state', onInitiativeState);
    socket.on('combat_state_sync', onCombatState);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    registerCastView();

    return () => {
      socket.off('party_state', onPartyState);
      socket.off('initiative_state', onInitiativeState);
      socket.off('combat_state_sync', onCombatState);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, [id]);

  const activeCombatants = initiative;
  const currentTurnIndex = initiative.findIndex(combatant => combatant.is_active === 1);

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-red-900 overflow-hidden flex flex-col">
      {/* Dark Fantasy Header */}
      <div className="h-16 border-b border-red-900/30 bg-gradient-to-r from-red-950/20 via-black to-red-950/20 flex items-center justify-between px-8 relative shadow-[0_0_30px_rgba(220,38,38,0.1)]">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/black-scales.png')] opacity-20 pointer-events-none mix-blend-overlay"></div>
        <div className="flex items-center gap-4 z-10">
          <Skull className="h-6 w-6 text-red-700" />
          <h1 className="text-2xl font-display tracking-[0.2em] text-red-50 uppercase drop-shadow-[0_0_10px_rgba(220,38,38,0.5)]">
            Encounter Cast {id ? `[${id}]` : ''}
          </h1>
        </div>
        <div className="flex items-center gap-6 z-10 font-display">
          {initiative.length > 0 && combatState.round > 0 && (
            <div className="text-red-400 text-lg flex items-center gap-2 animate-pulse">
              <Zap className="h-5 w-5" /> ROUND {combatState.round}
            </div>
          )}
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 shadow-[0_0_10px_#22c55e]' : 'bg-red-500'}`} />
            <span className="text-[10px] uppercase tracking-widest text-white/50">{isConnected ? 'Live' : 'Offline'}</span>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 p-8 grid grid-cols-1 lg:grid-cols-4 gap-8 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-neutral-900 via-black to-black relative">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-10 pointer-events-none"></div>
        
        {/* Initiative Tracker Side */}
        <div className="lg:col-span-1 space-y-4 relative z-10 border-r border-white/5 pr-8">
          <h2 className="text-sm font-display uppercase tracking-[0.3em] text-red-500/80 mb-6 flex items-center gap-2">
            <Zap className="h-4 w-4" /> Initiative Order
          </h2>
          {initiative.length > 0 ? (
            <div className="space-y-3">
              {activeCombatants.map((combatant, idx) => {
                const isCurrentTurn = idx === currentTurnIndex;
                const char = party.find(p => p.id === String(combatant.character_id));
                const isDead = combatant.entity_type === 'pc'
                  ? Boolean(char && char.hp.current <= 0)
                  : combatant.hp_status === 'Dead';
                
                return (
                  <div 
                    key={combatant.id}
                    className={`p-4 rounded-lg border transition-all duration-500 ${isCurrentTurn ? 'bg-red-950/40 border-red-500/50 scale-105 shadow-[0_0_20px_rgba(220,38,38,0.2)]' : 'bg-neutral-900/40 border-white/10 opacity-70'} ${isDead ? 'opacity-30 grayscale' : ''}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full border flex items-center justify-center font-display text-sm ${isCurrentTurn ? 'border-red-500 text-red-400 bg-red-950' : 'border-white/20 text-white/60 bg-black'}`}>
                          {combatant.initiative}
                        </div>
                        <span className={`font-display text-lg ${isCurrentTurn ? 'text-red-50' : 'text-white/80'} ${isDead ? 'line-through' : ''}`}>
                          {combatant.entity_name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {combatant.entity_type !== 'pc' && (
                          <span className="text-[9px] uppercase tracking-wider text-white/40">{combatant.hp_status}</span>
                        )}
                        {isCurrentTurn && <div className="w-2 h-2 rounded-full bg-red-500 animate-ping"></div>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 text-white/30 font-display italic tracking-wider">
              Peace... for now.
            </div>
          )}
        </div>

        {/* Party Status Grid */}
        <div className="lg:col-span-3 relative z-10">
          <h2 className="text-sm font-display uppercase tracking-[0.3em] text-white/50 mb-6 flex items-center gap-2">
            <Shield className="h-4 w-4" /> Party Status
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {party.map(char => {
              const hpPct = Math.max(0, Math.min(100, (char.hp.current / char.hp.max) * 100));
              const isDead = char.hp.current <= 0;
              const hasTemp = char.hp.temp > 0;
              
              return (
                <div key={char.id} className={`bg-neutral-950 border border-white/10 rounded-xl overflow-hidden relative shadow-2xl transition-all duration-700 ${isDead ? 'border-red-900/50 opacity-60' : 'hover:border-white/20 hover:-translate-y-1'}`}>
                  {isDead && (
                    <div className="absolute inset-0 bg-red-950/20 pointer-events-none z-10 mix-blend-color flex items-center justify-center">
                      <Skull className="h-24 w-24 text-red-900/20" />
                    </div>
                  )}
                  <div className="p-5">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-xl font-display text-white mb-1 drop-shadow-md">{char.name}</h3>
                        <p className="text-[10px] uppercase tracking-widest text-white/40">Level {char.level} {char.class}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge variant="outline" className="bg-black/50 border-white/20 text-white/80 font-display">
                          AC {char.ac}
                        </Badge>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex justify-between items-end">
                        <div className="flex items-center gap-1.5 text-sm">
                          <Heart className={`h-4 w-4 ${isDead ? 'text-neutral-700' : 'text-red-500'}`} />
                          <span className={`font-display text-2xl leading-none ${isDead ? 'text-red-700' : 'text-white'}`}>{char.hp.current}</span>
                          <span className="text-white/40">/ {char.hp.max}</span>
                        </div>
                        {hasTemp && (
                          <span className="text-[10px] text-cyan-400 font-display uppercase tracking-wider">+{char.hp.temp} Temp</span>
                        )}
                      </div>
                      
                      <div className="h-2 w-full bg-neutral-900 rounded-full overflow-hidden border border-white/5 relative">
                        <div 
                          className={`h-full transition-all duration-1000 rounded-full ${hpPct > 50 ? 'bg-gradient-to-r from-green-600 to-green-400' : hpPct > 25 ? 'bg-gradient-to-r from-yellow-600 to-yellow-400' : 'bg-gradient-to-r from-red-700 to-red-500 shadow-[0_0_10px_#ef4444]'}`}
                          style={{ width: `${hpPct}%` }}
                        />
                      </div>
                    </div>
                    
                    {char.conditions && char.conditions.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-1">
                        {char.conditions.map(cond => (
                          <Badge key={cond} variant="destructive" className="bg-red-950/60 border-red-900/50 text-[9px] uppercase tracking-wider py-0 px-1.5 h-4">
                            {cond}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
