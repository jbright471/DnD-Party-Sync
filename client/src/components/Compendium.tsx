import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  CompendiumEntity, EntityType, MonsterStats, SpellStats, ItemStats,
  getAbilityMod, MONSTER_DEFAULTS, SPELL_DEFAULTS, ITEM_DEFAULTS,
} from '../types/compendium';
import { searchSrd, type SrdSearchResult } from '../lib/open5e';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import socket from '../socket';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from './ui/sheet';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from './ui/resizable';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import {
  Search, Plus, Sparkles, Swords, BookOpen, Gem, Trash2,
  Pencil, Save, X, Loader2, Shield, Heart, Zap, Eye,
  Copy, Globe, Database, ChevronDown,
} from 'lucide-react';

// ── API helpers ────────────────────────────────────────────────────────────

async function fetchEntities(): Promise<CompendiumEntity[]> {
  const res = await fetch('/api/homebrew');
  if (!res.ok) throw new Error('Failed to fetch');
  return res.json();
}

async function saveEntity(data: { entity_type: EntityType; name: string; description: string; stats_json: any }): Promise<CompendiumEntity> {
  const res = await fetch('/api/homebrew', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to save');
  return res.json();
}

async function updateEntity(id: number, data: { name?: string; description?: string; stats_json?: any }): Promise<CompendiumEntity> {
  const res = await fetch(`/api/homebrew/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update');
  return res.json();
}

async function deleteEntity(id: number): Promise<void> {
  const res = await fetch(`/api/homebrew/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete');
}

async function generateStats(entityType: EntityType, name: string, description: string): Promise<any> {
  const res = await fetch('/api/homebrew/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entity_type: entityType, name, description }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Generation failed' }));
    throw new Error(err.error || 'Generation failed');
  }
  return res.json();
}

// ── Entity type config ─────────────────────────────────────────────────────

const TYPE_META: Record<EntityType, { icon: typeof Swords; color: string; label: string }> = {
  monster: { icon: Swords, color: 'text-red-400', label: 'Monsters' },
  spell:   { icon: Sparkles, color: 'text-violet-400', label: 'Spells' },
  item:    { icon: Gem, color: 'text-amber-400', label: 'Items' },
};

type SourceTab = 'official' | 'homebrew';

// ── Main Component ─────────────────────────────────────────────────────────

interface CompendiumProps {
  open: boolean;
  onClose: () => void;
}

export function Compendium({ open, onClose }: CompendiumProps) {
  // Data
  const [homebrewEntities, setHomebrewEntities] = useState<CompendiumEntity[]>([]);
  const [srdResults, setSrdResults] = useState<CompendiumEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [srdLoading, setSrdLoading] = useState(false);

  // UI state
  const [selected, setSelected] = useState<CompendiumEntity | null>(null);
  const [selectedSource, setSelectedSource] = useState<SourceTab>('homebrew');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<EntityType | 'all'>('all');
  const [sourceTab, setSourceTab] = useState<SourceTab>('homebrew');
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Draft state for AI generation / new creation
  const [draft, setDraft] = useState<{
    entity_type: EntityType;
    name: string;
    description: string;
    stats: any;
    isAiGenerated: boolean;
  } | null>(null);

  const [isGenerating, setIsGenerating] = useState(false);

  // Debounced SRD search
  const srdTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const loadEntities = useCallback(async () => {
    try {
      const data = await fetchEntities();
      setHomebrewEntities(data);
    } catch {
      toast.error('Failed to load compendium');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) loadEntities();
  }, [open, loadEntities]);

  // SRD search with debounce
  useEffect(() => {
    if (sourceTab !== 'official') return;
    if (!search.trim()) { setSrdResults([]); return; }

    clearTimeout(srdTimerRef.current);
    srdTimerRef.current = setTimeout(async () => {
      setSrdLoading(true);
      try {
        const result = await searchSrd(search, typeFilter, 20);
        setSrdResults(result.entities);
      } catch {
        setSrdResults([]);
      } finally {
        setSrdLoading(false);
      }
    }, 400);

    return () => clearTimeout(srdTimerRef.current);
  }, [search, typeFilter, sourceTab]);

  // Filtered homebrew list
  const filteredHomebrew = useMemo(() => {
    let list = homebrewEntities;
    if (typeFilter !== 'all') list = list.filter(e => e.entity_type === typeFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(e => e.name.toLowerCase().includes(q) || e.description?.toLowerCase().includes(q));
    }
    return list;
  }, [homebrewEntities, typeFilter, search]);

  const displayList = sourceTab === 'official' ? srdResults : filteredHomebrew;
  const isListLoading = sourceTab === 'official' ? srdLoading : loading;

  // ── Handlers ─────────────────────────────────────────────────────────

  const handleSelectEntity = (entity: CompendiumEntity, source: SourceTab) => {
    setSelected(entity);
    setSelectedSource(source);
    setIsCreating(false);
    setDraft(null);
    setIsEditing(false);
  };

  const handleStartCreate = (type: EntityType) => {
    const defaults = type === 'monster' ? MONSTER_DEFAULTS : type === 'spell' ? SPELL_DEFAULTS : ITEM_DEFAULTS;
    setDraft({ entity_type: type, name: '', description: '', stats: { ...defaults }, isAiGenerated: false });
    setSelected(null);
    setIsCreating(true);
    setIsEditing(false);
  };

  const handleAiGenerate = async () => {
    if (!draft || !draft.name.trim() || !draft.description.trim()) {
      toast.error('Name and description are required for AI generation');
      return;
    }
    setIsGenerating(true);
    try {
      const result = await generateStats(draft.entity_type, draft.name, draft.description);
      setDraft(prev => prev ? { ...prev, stats: result.stats, isAiGenerated: true } : null);
      toast.success('AI draft generated — review and tweak before saving');
    } catch (err: any) {
      toast.error(err.message || 'AI generation failed');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!draft || !draft.name.trim()) { toast.error('Name is required'); return; }
    try {
      const saved = await saveEntity({
        entity_type: draft.entity_type,
        name: draft.name,
        description: draft.description,
        stats_json: draft.stats,
      });
      setHomebrewEntities(prev => [saved, ...prev]);
      setSelected(saved);
      setSelectedSource('homebrew');
      setDraft(null);
      setIsCreating(false);
      toast.success(`${draft.name} saved to compendium`);
    } catch {
      toast.error('Failed to save entity');
    }
  };

  const handleCloneToHomebrew = async (entity: CompendiumEntity) => {
    try {
      const saved = await saveEntity({
        entity_type: entity.entity_type,
        name: entity.name,
        description: entity.description,
        stats_json: entity.stats_json,
      });
      setHomebrewEntities(prev => [saved, ...prev]);
      setSelected(saved);
      setSelectedSource('homebrew');
      setSourceTab('homebrew');
      toast.success(`Cloned "${entity.name}" to homebrew — you can now edit it`);
    } catch {
      toast.error('Failed to clone entity');
    }
  };

  const handleUpdateEntity = async (entity: CompendiumEntity, updates: { name?: string; description?: string; stats_json?: any }) => {
    try {
      const updated = await updateEntity(entity.id, updates);
      setHomebrewEntities(prev => prev.map(e => e.id === entity.id ? updated : e));
      setSelected(updated);
      setIsEditing(false);
      toast.success(`${updated.name} updated`);
    } catch {
      toast.error('Failed to update');
    }
  };

  const handleDelete = async (entity: CompendiumEntity) => {
    if (!confirm(`Delete "${entity.name}" permanently?`)) return;
    try {
      await deleteEntity(entity.id);
      setHomebrewEntities(prev => prev.filter(e => e.id !== entity.id));
      if (selected?.id === entity.id) setSelected(null);
      toast.success(`${entity.name} deleted`);
    } catch {
      toast.error('Failed to delete');
    }
  };

  const handleSpawnMonster = (entity: CompendiumEntity) => {
    const stats = entity.stats_json as MonsterStats;
    const dexMod = Math.floor(((stats.DEX || 10) - 10) / 2);
    socket.emit('spawn_monster', {
      name: entity.name,
      hp: stats.hp || 10,
      ac: stats.ac || 10,
      initiative_mod: dexMod,
      is_hidden: false,
      stats: stats,
    });
    toast.success(`${entity.name} spawned — initiative rolled (d20 + ${dexMod >= 0 ? '+' : ''}${dexMod})`);
  };

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <SheetContent side="right" className="!w-[90vw] !max-w-[1100px] p-0 border-border/50 bg-card">
        <div className="flex flex-col h-full">
          {/* Header */}
          <SheetHeader className="px-4 py-3 border-b border-border/40 shrink-0">
            <div className="flex items-center justify-between">
              <SheetTitle className="font-display tracking-wider flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-primary" />
                Compendium & Homebrew
              </SheetTitle>
              <div className="flex gap-1.5">
                {(['monster', 'spell', 'item'] as EntityType[]).map(type => {
                  const meta = TYPE_META[type];
                  return (
                    <Button
                      key={type}
                      size="sm"
                      variant="outline"
                      className={cn('h-7 text-[10px] font-display', meta.color)}
                      onClick={() => handleStartCreate(type)}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </Button>
                  );
                })}
              </div>
            </div>
          </SheetHeader>

          {/* Split Pane */}
          <div className="flex-1 min-h-0">
            <ResizablePanelGroup direction="horizontal">
              {/* ── LEFT: Index ──────────────────────────────── */}
              <ResizablePanel defaultSize={35} minSize={25}>
                <div className="flex flex-col h-full">
                  {/* Source tabs: Official / Homebrew */}
                  <div className="flex border-b border-border/30">
                    {([
                      { key: 'official' as SourceTab, label: 'Official SRD', icon: Globe },
                      { key: 'homebrew' as SourceTab, label: 'Homebrew', icon: Database },
                    ]).map(({ key, label, icon: TabIcon }) => (
                      <button
                        key={key}
                        onClick={() => { setSourceTab(key); setSelected(null); setIsCreating(false); setDraft(null); }}
                        className={cn(
                          'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-[10px] font-display tracking-wider transition-all border-b-2',
                          sourceTab === key
                            ? 'text-primary border-primary bg-primary/5'
                            : 'text-muted-foreground/40 border-transparent hover:text-muted-foreground/70 hover:bg-secondary/20',
                        )}
                      >
                        <TabIcon className="h-3 w-3" />
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* Search */}
                  <div className="px-3 py-2 border-b border-border/30 space-y-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40" />
                      <Input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder={sourceTab === 'official' ? 'Search 5e SRD...' : 'Search homebrew...'}
                        className="pl-8 h-8 text-sm"
                      />
                    </div>
                    {/* Type filter tabs */}
                    <div className="flex gap-1">
                      {(['all', 'monster', 'spell', 'item'] as const).map(t => (
                        <button
                          key={t}
                          onClick={() => setTypeFilter(t)}
                          className={cn(
                            'px-2 py-1 rounded text-[10px] font-display tracking-wide transition-all',
                            typeFilter === t
                              ? 'bg-primary/15 text-primary border border-primary/30'
                              : 'text-muted-foreground/50 hover:text-muted-foreground hover:bg-secondary/40',
                          )}
                        >
                          {t === 'all' ? 'All' : TYPE_META[t].label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Entity List */}
                  <div className="flex-1 overflow-y-auto px-2 py-1.5 space-y-0.5">
                    {isListLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/40" />
                      </div>
                    ) : sourceTab === 'official' && !search.trim() ? (
                      <div className="flex flex-col items-center py-10 text-muted-foreground/30 space-y-2">
                        <Globe className="h-8 w-8" />
                        <p className="text-xs italic text-center px-4">Type to search the 5e SRD for monsters, spells, and magic items</p>
                      </div>
                    ) : displayList.length === 0 ? (
                      <p className="text-xs text-muted-foreground/30 italic text-center py-8">
                        {search ? 'No matches found' : 'No entities yet — create one above'}
                      </p>
                    ) : (
                      displayList.map(entity => {
                        const meta = TYPE_META[entity.entity_type];
                        const Icon = meta.icon;
                        const isActive = selected?.id === entity.id && selectedSource === sourceTab;
                        return (
                          <button
                            key={`${sourceTab}-${entity.id}`}
                            onClick={() => handleSelectEntity(entity, sourceTab)}
                            className={cn(
                              'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left transition-all',
                              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary',
                              isActive
                                ? 'bg-primary/10 border border-primary/30'
                                : 'hover:bg-secondary/30 border border-transparent',
                            )}
                          >
                            <Icon className={cn('h-3.5 w-3.5 shrink-0', meta.color)} />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-display truncate">{entity.name}</div>
                              <div className="text-[10px] text-muted-foreground/50 truncate">
                                {entity.entity_type === 'monster' && `CR ${(entity.stats_json as MonsterStats).challenge_rating || '?'}`}
                                {entity.entity_type === 'spell' && `Level ${(entity.stats_json as SpellStats).level}`}
                                {entity.entity_type === 'item' && (entity.stats_json as ItemStats).rarity}
                              </div>
                            </div>
                            {sourceTab === 'official' && (
                              <Badge variant="outline" className="text-[7px] border-blue-700/30 text-blue-400/60 shrink-0">SRD</Badge>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>

                  {/* Footer count */}
                  <div className="px-3 py-1.5 border-t border-border/20 text-[9px] text-muted-foreground/30 font-display tracking-wider text-center">
                    {displayList.length} ENTIT{displayList.length === 1 ? 'Y' : 'IES'}
                    {sourceTab === 'official' && !search.trim() && ' — SEARCH TO BROWSE'}
                  </div>
                </div>
              </ResizablePanel>

              <ResizableHandle withHandle />

              {/* ── RIGHT: Inspector/Editor ──────────────────── */}
              <ResizablePanel defaultSize={65} minSize={40}>
                <div className="h-full overflow-y-auto">
                  {/* Creating new / AI Draft */}
                  {isCreating && draft && (
                    <EntityCreator
                      draft={draft}
                      setDraft={setDraft}
                      isGenerating={isGenerating}
                      onAiGenerate={handleAiGenerate}
                      onSave={handleSaveDraft}
                      onCancel={() => { setIsCreating(false); setDraft(null); }}
                    />
                  )}

                  {/* Viewing/Editing existing entity */}
                  {!isCreating && selected && (
                    <EntityInspector
                      entity={selected}
                      isOfficial={selectedSource === 'official'}
                      isEditing={isEditing}
                      onToggleEdit={() => setIsEditing(!isEditing)}
                      onUpdate={(updates) => handleUpdateEntity(selected, updates)}
                      onDelete={() => handleDelete(selected)}
                      onSpawn={() => handleSpawnMonster(selected)}
                      onClone={() => handleCloneToHomebrew(selected)}
                    />
                  )}

                  {/* Empty state */}
                  {!isCreating && !selected && (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground/20">
                      <BookOpen className="h-12 w-12 mb-3" />
                      <p className="font-display text-sm tracking-wide">Select or create an entity</p>
                    </div>
                  )}
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Entity Creator (New + AI Generate) ─────────────────────────────────────

interface EntityCreatorProps {
  draft: { entity_type: EntityType; name: string; description: string; stats: any; isAiGenerated: boolean };
  setDraft: (fn: (prev: any) => any) => void;
  isGenerating: boolean;
  onAiGenerate: () => void;
  onSave: () => void;
  onCancel: () => void;
}

function EntityCreator({ draft, setDraft, isGenerating, onAiGenerate, onSave, onCancel }: EntityCreatorProps) {
  const meta = TYPE_META[draft.entity_type];
  const Icon = meta.icon;

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={cn('h-5 w-5', meta.color)} />
          <h2 className="font-display text-lg tracking-wide">
            New {draft.entity_type.charAt(0).toUpperCase() + draft.entity_type.slice(1)}
          </h2>
          {draft.isAiGenerated && (
            <Badge className="bg-violet-950/50 text-violet-300 border-violet-700/50 text-[9px]">
              AI DRAFT
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={onCancel}>
            <X className="h-3.5 w-3.5 mr-1" /> Cancel
          </Button>
          <Button size="sm" onClick={onSave} className="font-display bg-primary/80 hover:bg-primary">
            <Save className="h-3.5 w-3.5 mr-1" /> Save to Compendium
          </Button>
        </div>
      </div>

      {/* Name + Description */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wider">Name</Label>
          <Input
            value={draft.name}
            onChange={e => setDraft((p: any) => ({ ...p, name: e.target.value }))}
            placeholder="e.g. Shadowfang Worg"
          />
        </div>
        <div className="space-y-1 col-span-2">
          <Label className="text-[10px] uppercase tracking-wider">Description / Prompt</Label>
          <Textarea
            value={draft.description}
            onChange={e => setDraft((p: any) => ({ ...p, description: e.target.value }))}
            placeholder="Describe this entity for the AI, or write a short description..."
            rows={3}
            className="text-sm resize-none"
          />
        </div>
      </div>

      {/* AI Generate Button */}
      <Button
        variant="outline"
        onClick={onAiGenerate}
        disabled={isGenerating || !draft.name.trim() || !draft.description.trim()}
        className="w-full border-violet-700/40 text-violet-300 hover:bg-violet-950/30 hover:border-violet-500/50 font-display"
      >
        {isGenerating ? (
          <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating...</>
        ) : (
          <><Sparkles className="h-4 w-4 mr-2" /> Generate with AI</>
        )}
      </Button>

      {/* Stats Editor — only shown after AI generates or for manual input */}
      {draft.stats && (
        <div className="border border-border/30 rounded-lg p-3 space-y-3">
          <span className="text-[9px] font-display tracking-widest uppercase text-muted-foreground/40">
            {draft.isAiGenerated ? 'AI GENERATED STATS — REVIEW & TWEAK' : 'STAT BLOCK'}
          </span>
          <StatsEditor
            entityType={draft.entity_type}
            stats={draft.stats}
            onChange={stats => setDraft((p: any) => ({ ...p, stats }))}
          />
        </div>
      )}
    </div>
  );
}

// ── Entity Inspector (View / Edit) ─────────────────────────────────────────

interface EntityInspectorProps {
  entity: CompendiumEntity;
  isOfficial: boolean;
  isEditing: boolean;
  onToggleEdit: () => void;
  onUpdate: (updates: { name?: string; description?: string; stats_json?: any }) => void;
  onDelete: () => void;
  onSpawn: () => void;
  onClone: () => void;
}

function EntityInspector({ entity, isOfficial, isEditing, onToggleEdit, onUpdate, onDelete, onSpawn, onClone }: EntityInspectorProps) {
  const [editName, setEditName] = useState(entity.name);
  const [editDesc, setEditDesc] = useState(entity.description);
  const [editStats, setEditStats] = useState<any>(entity.stats_json);
  const meta = TYPE_META[entity.entity_type];
  const Icon = meta.icon;

  // Reset edit state when entity changes
  useEffect(() => {
    setEditName(entity.name);
    setEditDesc(entity.description);
    setEditStats(entity.stats_json);
  }, [entity]);

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className={cn('h-5 w-5 shrink-0', meta.color)} />
          {isEditing ? (
            <Input
              value={editName}
              onChange={e => setEditName(e.target.value)}
              className="font-display text-lg h-8"
            />
          ) : (
            <h2 className="font-display text-lg tracking-wide truncate">{entity.name}</h2>
          )}
          {isOfficial && (
            <Badge variant="outline" className="text-[8px] border-blue-700/30 text-blue-400/70 shrink-0">
              SRD
            </Badge>
          )}
        </div>
        <div className="flex gap-1.5 shrink-0">
          {/* Spawn — monsters only, always available */}
          {entity.entity_type === 'monster' && !isEditing && (
            <Button size="sm" onClick={onSpawn} className="font-display bg-red-800/60 hover:bg-red-700/70 text-red-100">
              <Swords className="h-3.5 w-3.5 mr-1" /> Add to Combat
            </Button>
          )}

          {/* Official entities: clone to homebrew */}
          {isOfficial && (
            <Button size="sm" variant="outline" onClick={onClone} className="text-blue-300 border-blue-700/40 hover:bg-blue-950/30">
              <Copy className="h-3.5 w-3.5 mr-1" /> Clone to Homebrew
            </Button>
          )}

          {/* Homebrew entities: edit / delete */}
          {!isOfficial && (
            <>
              <Button size="sm" variant="outline" onClick={onToggleEdit}>
                {isEditing ? <X className="h-3.5 w-3.5 mr-1" /> : <Pencil className="h-3.5 w-3.5 mr-1" />}
                {isEditing ? 'Cancel' : 'Edit'}
              </Button>
              {isEditing && (
                <Button size="sm" onClick={() => onUpdate({ name: editName, description: editDesc, stats_json: editStats })} className="font-display">
                  <Save className="h-3.5 w-3.5 mr-1" /> Save
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={onDelete} className="text-destructive hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Description */}
      {isEditing ? (
        <Textarea
          value={editDesc}
          onChange={e => setEditDesc(e.target.value)}
          rows={2}
          className="text-sm resize-none"
        />
      ) : entity.description ? (
        <p className="text-sm text-muted-foreground/70 italic leading-relaxed">{entity.description}</p>
      ) : null}

      {/* Stat Block */}
      {isEditing ? (
        <StatsEditor entityType={entity.entity_type} stats={editStats} onChange={setEditStats} />
      ) : (
        <StatBlockViewer entityType={entity.entity_type} stats={entity.stats_json} />
      )}
    </div>
  );
}

// ── Stat Block Viewer ──────────────────────────────────────────────────────

function StatBlockViewer({ entityType, stats }: { entityType: EntityType; stats: any }) {
  if (entityType === 'monster') return <MonsterStatBlock stats={stats as MonsterStats} />;
  if (entityType === 'spell') return <SpellStatBlock stats={stats as SpellStats} />;
  return <ItemStatBlock stats={stats as ItemStats} />;
}

function MonsterStatBlock({ stats }: { stats: MonsterStats }) {
  const abilities: [string, number][] = [
    ['STR', stats.STR], ['DEX', stats.DEX], ['CON', stats.CON],
    ['INT', stats.INT], ['WIS', stats.WIS], ['CHA', stats.CHA],
  ];

  return (
    <div className="space-y-3 border border-red-800/30 rounded-lg overflow-hidden">
      {/* Header stripe */}
      <div className="bg-red-950/40 px-4 py-2.5 border-b border-red-800/30">
        <div className="flex items-center justify-between">
          <div className="text-[10px] text-red-300/60 font-display tracking-wider uppercase">
            {stats.size} {stats.type} &middot; CR {stats.challenge_rating}
          </div>
        </div>
      </div>

      <div className="px-4 pb-4 space-y-3">
        {/* Core stats */}
        <div className="flex gap-4 text-sm">
          <div className="flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5 text-mana" />
            <span className="font-display font-bold">{stats.ac}</span>
            <span className="text-[10px] text-muted-foreground">AC</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Heart className="h-3.5 w-3.5 text-destructive" />
            <span className="font-display font-bold">{stats.hp}</span>
            <span className="text-[10px] text-muted-foreground">HP</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs">{stats.speed}</span>
          </div>
        </div>

        {/* Ability scores */}
        <div className="grid grid-cols-6 gap-1 text-center">
          {abilities.map(([name, score]) => (
            <div key={name} className="bg-secondary/30 rounded p-1.5">
              <div className="text-[9px] text-muted-foreground font-display">{name}</div>
              <div className="text-sm font-bold">{score}</div>
              <div className="text-[10px] text-primary">{getAbilityMod(score)}</div>
            </div>
          ))}
        </div>

        {/* Meta fields */}
        {stats.saving_throws && <MetaLine label="Saving Throws" value={stats.saving_throws} />}
        {stats.skills && <MetaLine label="Skills" value={stats.skills} />}
        {stats.damage_resistances && <MetaLine label="Resistances" value={stats.damage_resistances} />}
        {stats.damage_immunities && <MetaLine label="Immunities" value={stats.damage_immunities} />}
        {stats.condition_immunities && <MetaLine label="Condition Immunities" value={stats.condition_immunities} />}
        {stats.senses && <MetaLine label="Senses" value={stats.senses} />}
        {stats.languages && <MetaLine label="Languages" value={stats.languages} />}

        {/* Abilities */}
        {stats.abilities?.length > 0 && (
          <ActionSection title="Abilities" items={stats.abilities} />
        )}

        {/* Actions */}
        {stats.actions?.length > 0 && (
          <ActionSection title="Actions" items={stats.actions} color="text-red-400" />
        )}

        {/* Legendary Actions */}
        {stats.legendary_actions && stats.legendary_actions.length > 0 && (
          <ActionSection title="Legendary Actions" items={stats.legendary_actions} color="text-amber-400" />
        )}
      </div>
    </div>
  );
}

function SpellStatBlock({ stats }: { stats: SpellStats }) {
  return (
    <div className="space-y-3 border border-violet-800/30 rounded-lg overflow-hidden">
      <div className="bg-violet-950/40 px-4 py-2.5 border-b border-violet-800/30">
        <div className="text-[10px] text-violet-300/60 font-display tracking-wider uppercase">
          {stats.level === 0 ? 'Cantrip' : `Level ${stats.level}`} &middot; {stats.school}
          {stats.concentration && ' · Concentration'}
        </div>
      </div>
      <div className="px-4 pb-4 space-y-2">
        <MetaLine label="Casting Time" value={stats.casting_time} />
        <MetaLine label="Range" value={stats.range} />
        <MetaLine label="Components" value={stats.components} />
        <MetaLine label="Duration" value={stats.duration} />
        <div className="border-t border-border/20 pt-2">
          <p className="text-sm text-muted-foreground/80 leading-relaxed whitespace-pre-wrap">{stats.description}</p>
        </div>
        {stats.higher_levels && (
          <div className="text-xs text-muted-foreground/60 italic">
            <span className="font-display text-primary/70">At Higher Levels. </span>
            {stats.higher_levels}
          </div>
        )}
      </div>
    </div>
  );
}

function ItemStatBlock({ stats }: { stats: ItemStats }) {
  return (
    <div className="space-y-3 border border-amber-800/30 rounded-lg overflow-hidden">
      <div className="bg-amber-950/40 px-4 py-2.5 border-b border-amber-800/30">
        <div className="text-[10px] text-amber-300/60 font-display tracking-wider uppercase">
          {stats.type} &middot; {stats.rarity}
          {stats.attunement && ' · Requires Attunement'}
        </div>
      </div>
      <div className="px-4 pb-4 space-y-2">
        {stats.acBonus > 0 && <MetaLine label="AC Bonus" value={`+${stats.acBonus}`} />}
        {stats.damage && <MetaLine label="Damage" value={stats.damage} />}
        {Object.keys(stats.statBonuses || {}).length > 0 && (
          <MetaLine
            label="Stat Bonuses"
            value={Object.entries(stats.statBonuses).map(([k, v]) => `${k} +${v}`).join(', ')}
          />
        )}
        <div className="border-t border-border/20 pt-2">
          <p className="text-sm text-muted-foreground/80 leading-relaxed whitespace-pre-wrap">{stats.description}</p>
        </div>
      </div>
    </div>
  );
}

function MetaLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-xs">
      <span className="font-display text-muted-foreground/50 shrink-0">{label}</span>
      <span className="text-foreground/80">{value}</span>
    </div>
  );
}

function ActionSection({ title, items, color = 'text-primary' }: { title: string; items: { name: string; description: string }[]; color?: string }) {
  return (
    <div className="space-y-1.5 border-t border-border/20 pt-2">
      <span className={cn('text-[10px] font-display tracking-widest uppercase', color)}>{title}</span>
      {items.map((action, i) => (
        <div key={i} className="text-xs leading-relaxed">
          <span className="font-display font-bold text-foreground/90">{action.name}. </span>
          <span className="text-muted-foreground/70">{action.description}</span>
        </div>
      ))}
    </div>
  );
}

// ── Stats Editor (Form) ────────────────────────────────────────────────────

function StatsEditor({ entityType, stats, onChange }: { entityType: EntityType; stats: any; onChange: (s: any) => void }) {
  const update = (key: string, value: any) => onChange({ ...stats, [key]: value });

  if (entityType === 'monster') {
    const s = stats as MonsterStats;
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-4 gap-2">
          <NumField label="HP" value={s.hp} onChange={v => update('hp', v)} />
          <NumField label="AC" value={s.ac} onChange={v => update('ac', v)} />
          <StrField label="Speed" value={s.speed} onChange={v => update('speed', v)} />
          <StrField label="CR" value={s.challenge_rating} onChange={v => update('challenge_rating', v)} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <StrField label="Size" value={s.size} onChange={v => update('size', v)} />
          <StrField label="Type" value={s.type} onChange={v => update('type', v)} />
          <StrField label="Languages" value={s.languages || ''} onChange={v => update('languages', v)} />
        </div>
        <div className="grid grid-cols-6 gap-2">
          {(['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const).map(ab => (
            <NumField key={ab} label={ab} value={(s as any)[ab]} onChange={v => update(ab, v)} />
          ))}
        </div>
        <StrField label="Saving Throws" value={s.saving_throws || ''} onChange={v => update('saving_throws', v)} />
        <StrField label="Senses" value={s.senses || ''} onChange={v => update('senses', v)} />
        <StrField label="Damage Resistances" value={s.damage_resistances || ''} onChange={v => update('damage_resistances', v)} />
        <StrField label="Damage Immunities" value={s.damage_immunities || ''} onChange={v => update('damage_immunities', v)} />
        <StrField label="Condition Immunities" value={s.condition_immunities || ''} onChange={v => update('condition_immunities', v)} />
        <ActionListEditor label="Abilities" items={s.abilities || []} onChange={v => update('abilities', v)} />
        <ActionListEditor label="Actions" items={s.actions || []} onChange={v => update('actions', v)} />
        <ActionListEditor label="Legendary Actions" items={s.legendary_actions || []} onChange={v => update('legendary_actions', v)} />
      </div>
    );
  }

  if (entityType === 'spell') {
    const s = stats as SpellStats;
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <NumField label="Level" value={s.level} onChange={v => update('level', v)} />
          <StrField label="School" value={s.school} onChange={v => update('school', v)} />
          <StrField label="Casting Time" value={s.casting_time} onChange={v => update('casting_time', v)} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <StrField label="Range" value={s.range} onChange={v => update('range', v)} />
          <StrField label="Components" value={s.components} onChange={v => update('components', v)} />
          <StrField label="Duration" value={s.duration} onChange={v => update('duration', v)} />
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={s.concentration} onCheckedChange={v => update('concentration', v)} />
          <Label className="text-xs">Concentration</Label>
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wider">Description</Label>
          <Textarea value={s.description} onChange={e => update('description', e.target.value)} rows={4} className="text-sm resize-none" />
        </div>
        <StrField label="At Higher Levels" value={s.higher_levels || ''} onChange={v => update('higher_levels', v)} />
      </div>
    );
  }

  // Item
  const s = stats as ItemStats;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <StrField label="Type" value={s.type} onChange={v => update('type', v)} />
        <StrField label="Rarity" value={s.rarity} onChange={v => update('rarity', v)} />
        <NumField label="AC Bonus" value={s.acBonus} onChange={v => update('acBonus', v)} />
      </div>
      <div className="flex items-center gap-2">
        <Switch checked={s.attunement} onCheckedChange={v => update('attunement', v)} />
        <Label className="text-xs">Requires Attunement</Label>
      </div>
      <StrField label="Damage" value={s.damage || ''} onChange={v => update('damage', v || null)} />
      <div className="space-y-1">
        <Label className="text-[10px] uppercase tracking-wider">Description</Label>
        <Textarea value={s.description} onChange={e => update('description', e.target.value)} rows={4} className="text-sm resize-none" />
      </div>
    </div>
  );
}

// ── Tiny form helpers ──────────────────────────────────────────────────────

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-[9px] uppercase tracking-wider text-muted-foreground/50">{label}</Label>
      <Input type="number" value={value} onChange={e => onChange(parseInt(e.target.value) || 0)} className="h-7 text-xs" />
    </div>
  );
}

function StrField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-[9px] uppercase tracking-wider text-muted-foreground/50">{label}</Label>
      <Input value={value} onChange={e => onChange(e.target.value)} className="h-7 text-xs" />
    </div>
  );
}

function ActionListEditor({ label, items, onChange }: { label: string; items: { name: string; description: string }[]; onChange: (v: any[]) => void }) {
  const add = () => onChange([...items, { name: '', description: '' }]);
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));
  const update = (i: number, key: string, val: string) => onChange(items.map((item, idx) => idx === i ? { ...item, [key]: val } : item));

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-[9px] uppercase tracking-wider text-muted-foreground/50">{label}</Label>
        <button onClick={add} className="text-[10px] text-primary/60 hover:text-primary font-display">
          + Add
        </button>
      </div>
      {items.map((item, i) => (
        <div key={i} className="flex gap-1.5 items-start">
          <Input
            value={item.name}
            onChange={e => update(i, 'name', e.target.value)}
            placeholder="Name"
            className="h-7 text-xs w-1/3"
          />
          <Input
            value={item.description}
            onChange={e => update(i, 'description', e.target.value)}
            placeholder="Description"
            className="h-7 text-xs flex-1"
          />
          <button onClick={() => remove(i)} className="text-destructive/50 hover:text-destructive shrink-0 mt-1">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
