import React, { useState } from 'react';
import ActionLog from './ActionLog';
import EncounterBuilderModal from './EncounterBuilderModal';
import DiceRoller from './DiceRoller';
import MapViewer from './MapViewer';
import MapManagerModal from './MapManagerModal';
import BuffManagerModal from './BuffManagerModal';
import Soundboard from './Soundboard';

const QUICK_CONDITIONS = [
    'Blinded', 'Charmed', 'Deafened', 'Frightened',
    'Grappled', 'Incapacitated', 'Invisible', 'Paralyzed',
    'Petrified', 'Poisoned', 'Prone', 'Restrained',
    'Stunned', 'Unconscious'
];

const LORE_PRESETS = [
    { label: '🏰 Room Desc', prompt: 'Describe a room in a [dungeon/castle/tavern] with sensory details.' },
    { label: '👤 NPC Idea', prompt: 'Generate a unique NPC with a name, physical quirk, and one secret.' },
    { label: '💰 Loot Drop', prompt: 'Generate 3 interesting mundane or minor magic items found in a chest.' },
    { label: '⚔️ Combat', prompt: 'Give me a Flavorful description of a critical hit or a narrow miss in combat.' }
];

export default function DmDashboard({
    party,
    logs,
    isApprovalMode,
    onCharacterClick,
    socket
}) {
    const [aiLoreInput, setAiLoreInput] = useState('');
    const [loreHistory, setLoreHistory] = useState([]);
    const [isGenerating, setIsGenerating] = useState(false);

    // UI States
    const [showSpawner, setShowSpawner] = useState(false);
    const [showEncounterLibrary, setShowEncounterLibrary] = useState(false);
    const [showMapManager, setShowMapManager] = useState(false);
    const [showBuffManager, setShowBuffManager] = useState(false);
    const [isEndingSession, setIsEndingSession] = useState(false);

    const [monsterForm, setMonsterForm] = useState({
        name: '', hp: 20, ac: 12, initiative_mod: 0, is_hidden: true
    });

    const handleQuickHp = (charId, delta) => {
        socket.emit('update_hp', {
            characterId: charId,
            delta,
            actor: 'DM',
            damageType: delta < 0 ? 'force' : null
        });
    };

    const handleToggleCondition = (charId, currentConditions, condition) => {
        const hasIt = (currentConditions || []).map(c => c.toLowerCase()).includes(condition.toLowerCase());
        if (hasIt) {
            socket.emit('remove_condition', { characterId: charId, condition, actor: 'DM' });
        } else {
            socket.emit('apply_condition', { characterId: charId, condition, actor: 'DM' });
        }
    };

    const handleAiLore = async (overridePrompt) => {
        const promptToUse = overridePrompt || aiLoreInput;
        if (!promptToUse.trim()) return;
        setIsGenerating(true);
        try {
            const res = await fetch('/api/lore', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: promptToUse })
            });
            const data = await res.json();
            setLoreHistory(prev => [{
                prompt: promptToUse,
                response: data.answer,
                timestamp: new Date().toLocaleTimeString()
            }, ...prev]);
            if (!overridePrompt) setAiLoreInput('');
        } catch (err) { alert("Ollama connection failed."); }
        finally { setIsGenerating(false); }
    };

    const handleEndSession = () => {
        if (!confirm("Are you sure you want to end the session? This will clear the action log and generate a narrative recap.")) return;
        setIsEndingSession(true);
        socket.emit('end_session', (res) => {
            setIsEndingSession(false);
            if (res.success) alert("Session archived successfully!");
            else alert("Error: " + res.error);
        });
    };

    const handleSpawn = (e) => {
        e.preventDefault();
        socket.emit('spawn_monster', monsterForm);
        setShowSpawner(false);
        setMonsterForm({ name: '', hp: 20, ac: 12, initiative_mod: 0, is_hidden: true });
    };

    const handleStartEncounter = (encounterId) => {
        socket.emit('start_encounter', { encounterId });
        setShowEncounterLibrary(false);
    };

    const sendToNotes = (text) => {
        socket.emit('create_note', { category: 'lore', title: 'AI Generated Lore', content: text, updated_by: 'DM' });
        alert("Sent to Party Notes!");
    };

    return (
        <div className="flex flex-col h-full gap-4 overflow-hidden relative text-white">
            {/* Modals */}
            {showSpawner && (
                <div className="absolute inset-0 z-[80] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <form onSubmit={handleSpawn} className="bg-dnd-surface border border-dnd-gold/30 p-6 rounded-lg shadow-2xl w-full max-w-md animate-in zoom-in-95 duration-200">
                        <h3 className="fantasy-heading text-xl text-dnd-gold mb-4">Spawn Entity</h3>
                        <div className="flex flex-col gap-4">
                            <div><label className="text-[10px] uppercase font-bold text-dnd-muted block mb-1">Name</label><input required type="text" value={monsterForm.name} onChange={e => setMonsterForm({ ...monsterForm, name: e.target.value })} className="w-full bg-dnd-navy border border-dnd-border rounded px-3 py-2 text-sm text-white outline-none focus:border-dnd-gold" /></div>
                            <div className="grid grid-cols-3 gap-3">
                                <div><label className="text-[10px] uppercase font-bold text-dnd-muted block mb-1">HP</label><input type="number" value={monsterForm.hp} onChange={e => setMonsterForm({ ...monsterForm, hp: parseInt(e.target.value) })} className="w-full bg-dnd-navy border border-dnd-border rounded px-3 py-2 text-sm text-white outline-none focus:border-dnd-gold" /></div>
                                <div><label className="text-[10px] uppercase font-bold text-dnd-muted block mb-1">AC</label><input type="number" value={monsterForm.ac} onChange={e => setMonsterForm({ ...monsterForm, ac: parseInt(e.target.value) })} className="w-full bg-dnd-navy border border-dnd-border rounded px-3 py-2 text-sm text-white outline-none focus:border-dnd-gold" /></div>
                                <div><label className="text-[10px] uppercase font-bold text-dnd-muted block mb-1">Init</label><input type="number" value={monsterForm.initiative_mod} onChange={e => setMonsterForm({ ...monsterForm, initiative_mod: parseInt(e.target.value) })} className="w-full bg-dnd-navy border border-dnd-border rounded px-3 py-2 text-sm text-white outline-none focus:border-dnd-gold" /></div>
                            </div>
                            <label className="flex items-center gap-2 cursor-pointer mt-2"><input type="checkbox" checked={monsterForm.is_hidden} onChange={e => setMonsterForm({ ...monsterForm, is_hidden: e.target.checked })} className="accent-dnd-gold" /><span className="text-xs font-bold">Spawn Hidden</span></label>
                            <div className="flex gap-3 mt-4"><button type="button" onClick={() => setShowSpawner(false)} className="flex-1 btn-secondary text-xs font-bold">Cancel</button><button type="submit" className="flex-1 btn-primary text-xs font-bold">Spawn</button></div>
                        </div>
                    </form>
                </div>
            )}

            {showEncounterLibrary && <EncounterBuilderModal onClose={() => setShowEncounterLibrary(false)} onStartEncounter={handleStartEncounter} />}
            {showMapManager && <MapManagerModal onClose={() => setShowMapManager(false)} />}
            {showBuffManager && <BuffManagerModal party={party} onClose={() => setShowBuffManager(false)} />}

            {/* Top Row: God-Eye View */}
            <section className="flex-none bg-dnd-surface border-fantasy p-5 rounded-xl shadow-2xl animate-in fade-in duration-300">
                <div className="flex justify-between items-center mb-4">
                    <div className="flex items-center gap-4">
                        <h3 className="fantasy-heading text-xl m-0 text-dnd-gold">👁 God-Eye View</h3>
                        <button onClick={handleEndSession} disabled={isEndingSession} className="bg-dnd-red/10 text-dnd-red border border-dnd-red/30 px-3 py-1 rounded text-[10px] font-bold uppercase tracking-widest hover:bg-dnd-red/20 transition-all">{isEndingSession ? 'Archiving...' : '🏁 End Session'}</button>
                    </div>
                    <div className="flex items-center gap-4">
                        <button onClick={() => setShowBuffManager(true)} className="text-[10px] font-bold text-dnd-gold hover:text-white uppercase tracking-widest bg-dnd-gold/10 px-3 py-1 rounded border border-dnd-gold/20 transition-all">✨ Multi-Buff</button>
                        <button onClick={() => socket.emit('sync_map_tokens')} className="text-[10px] font-bold text-dnd-blue/60 hover:text-dnd-blue uppercase tracking-widest bg-dnd-blue/5 px-3 py-1 rounded border border-dnd-blue/20 transition-all">Sync VTT</button>
                        <div className="flex items-center gap-2 bg-dnd-navy px-3 py-1 rounded border border-dnd-border"><span className="text-[10px] font-bold text-dnd-gold uppercase tracking-tighter">DM Queue</span><input type="checkbox" checked={isApprovalMode} onChange={(e) => socket.emit('toggle_approval_mode', e.target.checked)} className="accent-dnd-gold w-3 h-3" /></div>
                    </div>
                </div>

                <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
                    {party.map(char => (
                        <div key={char.id} className="bg-dnd-navy/40 border border-dnd-border p-4 rounded-lg hover:border-dnd-gold/30 hover:shadow-[0_0_15px_rgba(212,160,23,0.1)] transition-all flex flex-col gap-3">
                            <div className="flex justify-between items-start">
                                <div className="cursor-pointer" onClick={() => onCharacterClick(char)}><span className="text-base font-bold block">{char.name}</span><span className="text-[10px] text-dnd-muted uppercase">{(char.classes || []).map(c => c.name).join('/')} Lvl {char.level}</span></div>
                                <div className="text-right"><span className="text-xs font-bold text-dnd-gold block font-mono">AC {char.ac}</span><span className="text-[10px] text-dnd-muted font-mono">{char.currentHp}/{char.maxHp} HP</span></div>
                            </div>
                            <div className="w-full bg-black h-2 rounded-full overflow-hidden border border-white/5"><div className={`h-full transition-all duration-500 ${char.currentHp / char.maxHp < 0.3 ? 'bg-dnd-red' : 'bg-dnd-green'}`} style={{ width: `${(char.currentHp / char.maxHp) * 100}%` }}></div></div>
                            <div className="flex items-center justify-between gap-2 mt-1 pt-3 border-t border-dnd-border/50">
                                <div className="flex gap-1">
                                    <button onClick={() => handleQuickHp(char.id, -5)} className="w-7 h-7 flex items-center justify-center bg-dnd-red/10 text-dnd-red border border-dnd-red/20 rounded hover:bg-dnd-red/20 text-xs font-bold">-5</button>
                                    <button onClick={() => handleQuickHp(char.id, 5)} className="w-7 h-7 flex items-center justify-center bg-dnd-green/10 text-dnd-green border border-dnd-green/20 rounded hover:bg-dnd-green/20 text-xs font-bold">+5</button>
                                </div>
                                <select className="bg-dnd-surface border border-dnd-border text-[10px] rounded px-2 py-1 text-dnd-muted outline-none focus:border-dnd-gold max-w-[100px]" onChange={(e) => { if (e.target.value) { handleToggleCondition(char.id, char.conditions, e.target.value); e.target.value = ""; } }}><option value="">+ Condition</option>{QUICK_CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}</select>
                                <button onClick={() => onCharacterClick(char)} className="text-[10px] font-bold text-dnd-gold/60 hover:text-dnd-gold uppercase tracking-tighter">Sheet</button>
                            </div>
                            <div className="flex flex-wrap gap-1 min-h-[16px]">
                                {(char.conditions || []).map((c, i) => (<span key={i} onClick={() => handleToggleCondition(char.id, char.conditions, c)} className="px-1.5 py-0.5 rounded bg-dnd-red/20 border border-dnd-red/30 text-dnd-red text-[8px] font-bold uppercase cursor-pointer hover:bg-dnd-red/40">{c} ×</span>))}
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* Middle Row: VTT + Sidebars */}
            <div className="flex-1 grid grid-cols-12 gap-4 overflow-hidden">
                {/* Left Sidebar: Chronicle + Sound */}
                <div className="col-span-12 lg:col-span-3 flex flex-col gap-4 overflow-hidden">
                    <DiceRoller isDm={true} characterName="DM" />
                    <Soundboard />
                    <div className="flex-1 flex flex-col overflow-hidden bg-dnd-surface border-fantasy rounded-xl shadow-2xl">
                        <div className="p-3 border-b border-dnd-border bg-dnd-navy/30"><h4 className="text-xs font-bold uppercase tracking-widest text-dnd-muted m-0 italic">📜 Chronicle</h4></div>
                        <div className="flex-1 overflow-y-auto scrollbar-thin"><ActionLog logs={logs} party={party} approvalMode={isApprovalMode} /></div>
                    </div>
                </div>

                {/* Center: VTT Area */}
                <div className="col-span-12 lg:col-span-6 flex flex-col gap-4 overflow-hidden">
                    <div className="flex-none bg-dnd-surface border border-dnd-border p-2 rounded-lg flex justify-between items-center shadow-lg">
                        <div className="flex gap-2"><button onClick={() => setShowMapManager(true)} className="bg-dnd-navy border border-dnd-border px-4 py-1.5 rounded text-[10px] font-bold uppercase text-dnd-gold hover:bg-dnd-surface transition-all tracking-widest">🗺️ Maps</button><button onClick={() => setShowEncounterLibrary(true)} className="bg-dnd-navy border border-dnd-border px-4 py-1.5 rounded text-[10px] font-bold uppercase text-dnd-text hover:bg-dnd-surface transition-all tracking-widest">⚔️ Encounters</button></div>
                        <button onClick={() => setShowSpawner(true)} className="bg-dnd-gold/10 text-dnd-gold border border-dnd-gold/30 px-4 py-1.5 rounded text-[10px] font-bold uppercase hover:bg-dnd-gold/20 transition-all">+ Spawn</button>
                    </div>
                    <div className="flex-1 relative flex flex-col shadow-inner"><MapViewer isGm={true} /></div>
                </div>

                {/* Right Sidebar: AI Lore Master */}
                <div className="col-span-12 lg:col-span-3 flex flex-col bg-dnd-surface border-fantasy rounded-xl shadow-2xl overflow-hidden text-white">
                    <div className="p-3 border-b border-dnd-border bg-dnd-navy/30 flex justify-between items-center"><h4 className="text-xs font-bold uppercase tracking-widest text-dnd-gold m-0">🔮 AI Lore</h4>{isGenerating && <span className="text-[10px] text-dnd-blue animate-pulse font-bold">WEAVING...</span>}</div>
                    <div className="p-2 border-b border-dnd-border bg-black/20 flex gap-2 overflow-x-auto scrollbar-none">{LORE_PRESETS.map(p => (<button key={p.label} onClick={() => handleAiLore(p.prompt)} className="flex-none bg-dnd-surface border border-dnd-border px-2 py-1 rounded text-[8px] font-bold text-dnd-muted hover:text-dnd-gold hover:border-dnd-gold transition-all">{p.label}</button>))}</div>
                    <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3 bg-dnd-surface2/30 scrollbar-thin">{loreHistory.map((entry, i) => (<div key={i} className="bg-dnd-navy/40 border border-dnd-border rounded-lg overflow-hidden animate-in slide-in-from-right-4"><div className="p-2 bg-dnd-navy border-b border-dnd-border flex justify-between items-center text-[8px]"><span className="text-dnd-muted truncate max-w-[100px]">"{entry.prompt}"</span><button onClick={() => sendToNotes(entry.response)} className="text-dnd-gold uppercase font-bold hover:underline">Push to Notes</button></div><div className="p-3 text-[11px] text-dnd-text leading-relaxed font-serif whitespace-pre-wrap">{entry.response}</div></div>))}</div>
                    <div className="p-3 bg-dnd-navy border-t border-dnd-border"><input type="text" value={aiLoreInput} onChange={(e) => setAiLoreInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAiLore()} placeholder="Prompt..." className="w-full bg-dnd-surface border border-dnd-border rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-dnd-gold mb-2" /><button onClick={() => handleAiLore()} disabled={isGenerating || !aiLoreInput.trim()} className="w-full py-1.5 bg-dnd-gold/20 text-dnd-gold border border-dnd-gold/40 rounded text-[10px] font-bold uppercase tracking-widest transition-all">Generate</button></div>
                </div>
            </div>
        </div>
    );
}
