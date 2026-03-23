import { useState } from 'react';
import { useGame } from '../context/GameContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Switch } from '../components/ui/switch';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import { ActionLog } from '../components/ActionLog';
import { EffectTimeline } from '../components/EffectTimeline';
import { DmAutomationPanel } from '../components/DmAutomationPanel';
import { DmPrepPanel } from '../components/DmPrepPanel';
import { InitiativeTracker } from '../components/InitiativeTracker';
import { DiceRoller } from '../components/DiceRoller';
import { WorldPanel } from '../components/WorldPanel';
import { QuestTracker } from '../components/QuestTracker';
import { Soundboard } from '../components/Soundboard';
import { NPCManager } from '../components/NPCManager';
import { LootManager } from '../components/LootManager';
import { BuffManagerModal } from '../components/BuffManagerModal';
import { EncounterBuilderModal } from '../components/EncounterBuilderModal';
import {
  Eye, Swords, Users, Gem, Scroll, Sparkles, Map,
  FlagOff, Plus, BookOpen, ShieldAlert, Send, Zap, NotebookPen, StickyNote
} from 'lucide-react';
import { toast } from 'sonner';
import socket from '../socket';

const LORE_PRESETS = [
  { label: 'Room Desc', prompt: 'Describe a room in a dungeon/castle/tavern with vivid sensory details.' },
  { label: 'NPC Idea', prompt: 'Generate a unique NPC with a name, physical quirk, and one secret.' },
  { label: 'Loot Drop', prompt: 'Generate 3 interesting mundane or minor magic items found in a chest.' },
  { label: 'Combat', prompt: 'Give a flavorful description of a critical hit or a narrow miss in combat.' },
];

export default function DmDashboard() {
  const { state } = useGame();
  const party = state.characters;

  // Modal states
  const [showNpcManager, setShowNpcManager] = useState(false);
  const [showLootManager, setShowLootManager] = useState(false);
  const [showBuffManager, setShowBuffManager] = useState(false);
  const [showEncounterLibrary, setShowEncounterLibrary] = useState(false);
  const [showSpawner, setShowSpawner] = useState(false);
  const [showAutomation, setShowAutomation] = useState(false);
  const [prepContext, setPrepContext] = useState<{ type: string; label?: string } | null>(null);
  const openPrep = (type = 'general', label?: string) => setPrepContext({ type, label });

  // Spawn form
  const [spawnForm, setSpawnForm] = useState({ name: '', hp: 20, ac: 12, initiative_mod: 0, is_hidden: true });

  // AI Lore
  const [loreInput, setLoreInput] = useState('');
  const [loreHistory, setLoreHistory] = useState<{ prompt: string; response: string; timestamp: string }[]>([]);
  const [isGeneratingLore, setIsGeneratingLore] = useState(false);

  // Session
  const [isEndingSession, setIsEndingSession] = useState(false);

  const handleQuickHp = (charId: string, delta: number) => {
    if (!navigator.onLine) { toast.warning('Offline — HP changes cannot be saved.'); return; }
    socket.emit('update_hp', { characterId: parseInt(charId), delta, actor: 'DM', damageType: delta < 0 ? 'force' : null });
  };

  const handleToggleCondition = (charId: string, conditions: string[], condition: string) => {
    const has = conditions.map(c => c.toLowerCase()).includes(condition.toLowerCase());
    socket.emit(has ? 'remove_condition' : 'apply_condition', { characterId: parseInt(charId), condition, actor: 'DM' });
  };

  const handleAiLore = async (overridePrompt?: string) => {
    const prompt = overridePrompt || loreInput;
    if (!prompt.trim()) return;
    setIsGeneratingLore(true);
    try {
      const res = await fetch('/api/lore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });
      const data = await res.json();
      setLoreHistory(prev => [{ prompt, response: data.answer, timestamp: new Date().toLocaleTimeString() }, ...prev]);
      if (!overridePrompt) setLoreInput('');
    } catch {
      toast.error('Ollama connection failed.');
    } finally {
      setIsGeneratingLore(false);
    }
  };

  const sendLoreToNotes = (text: string) => {
    socket.emit('create_note', { category: 'lore', title: 'AI Generated Lore', content: text, updated_by: 'DM' });
    toast.success('Sent to Party Notes!');
  };

  const handleSpawn = (e: React.FormEvent) => {
    e.preventDefault();
    socket.emit('spawn_monster', spawnForm);
    setShowSpawner(false);
    setSpawnForm({ name: '', hp: 20, ac: 12, initiative_mod: 0, is_hidden: true });
    toast.success(`${spawnForm.name} spawned into initiative!`);
  };

  const handleEndSession = () => {
    if (!confirm('End the session? This will archive the action log and generate an AI recap.')) return;
    setIsEndingSession(true);
    socket.emit('end_session', (res: { success: boolean; error?: string; recap?: string }) => {
      setIsEndingSession(false);
      if (res.success) toast.success('Session archived successfully!');
      else toast.error('Error: ' + res.error);
    });
  };

  const handleStartEncounter = (encounterId: number) => {
    socket.emit('start_encounter', { encounterId });
  };

  return (
    <div className="space-y-4 pb-6">
      {/* Modals */}
      <NPCManager open={showNpcManager} onClose={() => setShowNpcManager(false)} isDm />
      <LootManager open={showLootManager} onClose={() => setShowLootManager(false)} />
      <BuffManagerModal open={showBuffManager} onClose={() => setShowBuffManager(false)} />
      <EncounterBuilderModal
        open={showEncounterLibrary}
        onClose={() => setShowEncounterLibrary(false)}
        onStartEncounter={handleStartEncounter}
      />
      <DmAutomationPanel open={showAutomation} onClose={() => setShowAutomation(false)} />
      <DmPrepPanel
        isOpen={prepContext !== null}
        onClose={() => setPrepContext(null)}
        contextFilter={prepContext ? { type: prepContext.type as any, label: prepContext.label } : undefined}
      />

      {/* Spawn Modal */}
      {showSpawner && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleSpawn} className="bg-card border border-border p-6 rounded-xl shadow-2xl w-full max-w-sm animate-in zoom-in-95 duration-200 space-y-4">
            <h3 className="font-display text-xl text-gold">Spawn Entity</h3>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider">Name</Label>
              <Input required value={spawnForm.name} onChange={e => setSpawnForm({ ...spawnForm, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { key: 'hp', label: 'HP' },
                { key: 'ac', label: 'AC' },
                { key: 'initiative_mod', label: 'Init' },
              ].map(({ key, label }) => (
                <div key={key} className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wider">{label}</Label>
                  <Input type="number" value={(spawnForm as any)[key]} onChange={e => setSpawnForm({ ...spawnForm, [key]: parseInt(e.target.value) || 0 })} />
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={spawnForm.is_hidden} onCheckedChange={v => setSpawnForm({ ...spawnForm, is_hidden: v })} />
              <Label className="text-xs cursor-pointer">Spawn Hidden</Label>
            </div>
            <div className="flex gap-3">
              <Button type="button" variant="outline" onClick={() => setShowSpawner(false)} className="flex-1">Cancel</Button>
              <Button type="submit" className="flex-1 font-display">Spawn</Button>
            </div>
          </form>
        </div>
      )}

      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Eye className="h-7 w-7 text-primary" />
          <h1 className="text-3xl font-display tracking-wider">DM Command Center</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-secondary/30 border border-border rounded-lg px-3 py-1.5">
            <span className="text-[10px] font-bold text-gold uppercase tracking-tighter">DM Queue</span>
            <Switch
              checked={state.isApprovalMode}
              onCheckedChange={v => socket.emit('toggle_approval_mode', v)}
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAutomation(true)}
            className="font-display border-primary/30 text-primary hover:bg-primary/10"
          >
            <Zap className="h-4 w-4 mr-1" /> Automation
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => openPrep()}
            className="font-display border-primary/30 text-primary hover:bg-primary/10"
          >
            <NotebookPen className="h-4 w-4 mr-1" /> Prep Notes
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleEndSession}
            disabled={isEndingSession}
            className="font-display"
          >
            <FlagOff className="h-4 w-4 mr-1" />
            {isEndingSession ? 'Archiving...' : 'End Session'}
          </Button>
        </div>
      </div>

      {/* Top Row: God-Eye View + World Panel */}
      <div className="grid grid-cols-12 gap-4">
        {/* God-Eye View */}
        <Card className="col-span-12 lg:col-span-9 border-primary/20 bg-secondary/5">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="font-display flex items-center gap-2 text-primary">
                <Eye className="h-5 w-5" /> God-Eye View
              </CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <Button size="sm" variant="outline" className="h-7 text-[10px] text-gold border-gold/30" onClick={() => setShowLootManager(true)}>
                  <Gem className="h-3 w-3 mr-1" /> Loot
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => setShowNpcManager(true)}>
                  <Users className="h-3 w-3 mr-1" /> NPCs
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-[10px] text-muted-foreground" title="NPC prep notes" onClick={() => openPrep('npc', 'NPCs')}>
                  <StickyNote className="h-3 w-3" />
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-[10px] text-mana border-mana/30" onClick={() => setShowBuffManager(true)}>
                  <Sparkles className="h-3 w-3 mr-1" /> Buffs
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => socket.emit('sync_map_tokens')}>
                  <Map className="h-3 w-3 mr-1" /> Sync VTT
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {party.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground opacity-40 italic">
                No adventurers in the field yet.
              </div>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
                {party.map(char => {
                  const hpPercent = (char.hp.current / char.hp.max) * 100;
                  return (
                    <div key={char.id} className="bg-secondary/30 border border-border/50 rounded-lg p-3 hover:border-primary/30 transition-colors flex flex-col gap-2">
                      <div className="flex justify-between items-start">
                        <div className="min-w-0">
                          <span className="text-sm font-bold font-display block truncate">{char.name}</span>
                          <span className="text-[9px] text-muted-foreground uppercase">Lv.{char.level} {char.class}</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => openPrep('general', char.name)}
                            title={`Notes for ${char.name}`}
                            className="text-muted-foreground/30 hover:text-primary/70 transition-colors"
                          >
                            <StickyNote className="h-3 w-3" />
                          </button>
                          <span className="text-xs font-bold text-mana font-mono">AC {char.ac}</span>
                        </div>
                      </div>
                      <div className="w-full bg-secondary h-1.5 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-500 ${hpPercent < 30 ? 'bg-destructive' : 'bg-health'}`}
                          style={{ width: `${hpPercent}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-bold font-mono">{char.hp.current}/{char.hp.max} HP</div>
                        <div className="flex gap-1">
                          <button onClick={() => handleQuickHp(char.id, -5)} className="w-7 h-6 flex items-center justify-center bg-destructive/10 text-destructive border border-destructive/20 rounded hover:bg-destructive/20 text-[10px] font-bold transition-colors">-5</button>
                          <button onClick={() => handleQuickHp(char.id, 5)} className="w-7 h-6 flex items-center justify-center bg-health/10 text-health border border-health/20 rounded hover:bg-health/20 text-[10px] font-bold transition-colors">+5</button>
                        </div>
                      </div>
                      {char.conditions.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {char.conditions.map(c => (
                            <span
                              key={c}
                              onClick={() => handleToggleCondition(char.id, char.conditions, c)}
                              className="px-1.5 py-0.5 rounded bg-destructive/15 border border-destructive/30 text-destructive text-[7px] font-bold uppercase cursor-pointer hover:bg-destructive/30 transition-colors"
                            >
                              {c}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* World Panel */}
        <div className="col-span-12 lg:col-span-3">
          <WorldPanel isDm />
        </div>
      </div>

      {/* Middle Row: Quests + Initiative + Right Column */}
      <div className="grid grid-cols-12 gap-4">
        {/* Quest Tracker */}
        <div className="col-span-12 lg:col-span-3 flex flex-col min-h-[400px]">
          <QuestTracker isDm />
        </div>

        {/* Center: Initiative + Encounter Controls */}
        <div className="col-span-12 lg:col-span-6 space-y-3">
          {/* Combat Controls */}
          <Card className="border-primary/20 bg-secondary/5">
            <CardContent className="p-3 flex items-center justify-between flex-wrap gap-2">
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setShowEncounterLibrary(true)}>
                  <Swords className="h-3 w-3 mr-1" /> Encounters
                </Button>
                <Button size="sm" variant="ghost" className="h-8 text-xs text-muted-foreground" title="Encounter prep notes" onClick={() => openPrep('encounter', 'Encounters')}>
                  <StickyNote className="h-3.5 w-3.5" />
                </Button>
              </div>
              <Button size="sm" onClick={() => setShowSpawner(true)} className="h-8 text-xs font-display">
                <Plus className="h-3 w-3 mr-1" /> Spawn Monster
              </Button>
            </CardContent>
          </Card>
          <InitiativeTracker />
        </div>

        {/* Right Column: Dice + Soundboard + Chronicle */}
        <div className="col-span-12 lg:col-span-3 space-y-3">
          <Card className="border-primary/20 bg-secondary/5">
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-sm">Dice Roller</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <DiceRoller characterName="DM" />
            </CardContent>
          </Card>
          <Soundboard />
          <div className="h-64">
            <ActionLog />
          </div>
          <EffectTimeline />
        </div>
      </div>

      {/* Bottom Row: AI Lore Console */}
      <Card className="border-primary/20 bg-secondary/5">
        <CardHeader className="pb-2">
          <CardTitle className="font-display flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" /> AI Lore Console
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Preset Buttons */}
          <div className="flex flex-wrap gap-2">
            {LORE_PRESETS.map(preset => (
              <Button
                key={preset.label}
                size="sm"
                variant="outline"
                className="h-7 text-[10px] font-bold text-gold border-gold/30 hover:bg-gold/10"
                onClick={() => handleAiLore(preset.prompt)}
                disabled={isGeneratingLore}
              >
                {preset.label}
              </Button>
            ))}
          </div>

          {/* Input */}
          <div className="flex gap-2">
            <Textarea
              value={loreInput}
              onChange={e => setLoreInput(e.target.value)}
              placeholder="Ask the DM oracle anything about the world, NPCs, or lore..."
              rows={2}
              className="flex-1 text-sm resize-none"
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAiLore(); } }}
            />
            <Button onClick={() => handleAiLore()} disabled={isGeneratingLore || !loreInput.trim()} className="self-end font-display">
              <Send className="h-4 w-4 mr-1" />
              {isGeneratingLore ? 'Weaving...' : 'Ask'}
            </Button>
          </div>

          {/* Lore History */}
          {loreHistory.length > 0 && (
            <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
              {loreHistory.map((entry, idx) => (
                <div key={idx} className="bg-secondary/20 border border-border/40 rounded-lg p-3 space-y-2">
                  <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider italic">{entry.prompt}</div>
                  <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">{entry.response}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] text-muted-foreground/50 font-mono">{entry.timestamp}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-[9px] text-primary"
                      onClick={() => sendLoreToNotes(entry.response)}
                    >
                      <Scroll className="h-3 w-3 mr-1" /> Send to Notes
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
