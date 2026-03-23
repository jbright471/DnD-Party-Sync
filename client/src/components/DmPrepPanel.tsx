import { useState, useEffect, useCallback } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from './ui/sheet';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { BookOpen, Plus, Search, Tag, Trash2, ChevronLeft, Save, X } from 'lucide-react';
import { useGame } from '../context/GameContext';
import socket from '../socket';

interface DmPrepNote {
  id: number;
  linked_type: string;
  linked_id: number | null;
  title: string;
  content: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

interface ContextFilter {
  type: 'encounter' | 'npc' | 'effect_event' | 'quest' | 'general';
  id?: number;
  label?: string;
}

interface DmPrepPanelProps {
  isOpen: boolean;
  onClose: () => void;
  contextFilter?: ContextFilter;
}

const LINKED_TYPE_COLORS: Record<string, string> = {
  general:      'border-border text-muted-foreground',
  encounter:    'border-red-800/50 text-red-400',
  npc:          'border-amber-800/50 text-amber-400',
  effect_event: 'border-blue-800/50 text-blue-400',
  quest:        'border-green-800/50 text-green-400',
};

function renderMarkdownLite(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^# (.+)$/gm, '<h3 class="text-sm font-display font-bold mt-2 mb-1 text-primary">$1</h3>')
    .replace(/^- (.+)$/gm, '<span class="block pl-3 before:content-[\'•\'] before:mr-1.5 before:text-primary/50">$1</span>')
    .replace(/\n/g, '<br/>');
}

export function DmPrepPanel({ isOpen, onClose, contextFilter }: DmPrepPanelProps) {
  const { state } = useGame();
  const { dmToken } = state;

  const [notes, setNotes] = useState<DmPrepNote[]>([]);
  const [search, setSearch] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [selectedNote, setSelectedNote] = useState<DmPrepNote | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editTags, setEditTags] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const dmHeaders = useCallback(() => ({
    'Content-Type': 'application/json',
    ...(dmToken ? { 'x-dm-token': dmToken } : { 'x-dm-pin': process.env.DM_PIN || '1234' }),
  }), [dmToken]);

  const loadNotes = useCallback(async () => {
    if (!isOpen) return;
    const params = new URLSearchParams();
    if (contextFilter?.type && contextFilter.type !== 'general') {
      params.set('linked_type', contextFilter.type);
      if (contextFilter.id !== undefined) params.set('linked_id', String(contextFilter.id));
    }
    try {
      const res = await fetch(`/api/dm-notes${params.toString() ? `?${params}` : ''}`, {
        headers: dmHeaders(),
      });
      if (res.ok) setNotes(await res.json());
    } catch {}
  }, [isOpen, contextFilter, dmHeaders]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  // Listen for DM room note events to stay in sync across tabs
  useEffect(() => {
    const onCreate = (note: DmPrepNote) => setNotes(prev => [note, ...prev]);
    const onUpdate = (note: DmPrepNote) => setNotes(prev => prev.map(n => n.id === note.id ? note : n));
    const onDelete = ({ id }: { id: number }) => setNotes(prev => prev.filter(n => n.id !== id));

    socket.on('dm_note_created', onCreate);
    socket.on('dm_note_updated', onUpdate);
    socket.on('dm_note_deleted', onDelete);
    return () => {
      socket.off('dm_note_created', onCreate);
      socket.off('dm_note_updated', onUpdate);
      socket.off('dm_note_deleted', onDelete);
    };
  }, []);

  const allTags = [...new Set(notes.flatMap(n => n.tags))].sort();

  const filtered = notes.filter(note => {
    const matchesSearch = !search.trim() ||
      note.title.toLowerCase().includes(search.toLowerCase()) ||
      note.content.toLowerCase().includes(search.toLowerCase());
    const matchesTag = !activeTag || note.tags.includes(activeTag);
    return matchesSearch && matchesTag;
  });

  const startCreate = () => {
    setIsCreating(true);
    setSelectedNote(null);
    setEditTitle('');
    setEditContent('');
    setEditTags('');
  };

  const startEdit = (note: DmPrepNote) => {
    setSelectedNote(note);
    setIsCreating(false);
    setEditTitle(note.title);
    setEditContent(note.content);
    setEditTags(note.tags.join(', '));
  };

  const handleSave = async () => {
    setIsSaving(true);
    const tags = editTags.split(',').map(t => t.trim()).filter(Boolean);
    try {
      if (isCreating) {
        const res = await fetch('/api/dm-notes', {
          method: 'POST',
          headers: dmHeaders(),
          body: JSON.stringify({
            title: editTitle || 'Untitled',
            content: editContent,
            tags,
            linked_type: contextFilter?.type || 'general',
            linked_id: contextFilter?.id ?? null,
          }),
        });
        if (res.ok) {
          const note = await res.json();
          setNotes(prev => [note, ...prev]);
          socket.emit('relay_dm_note', { event: 'dm_note_created', data: note });
          setIsCreating(false);
        }
      } else if (selectedNote) {
        const res = await fetch(`/api/dm-notes/${selectedNote.id}`, {
          method: 'PATCH',
          headers: dmHeaders(),
          body: JSON.stringify({ title: editTitle, content: editContent, tags }),
        });
        if (res.ok) {
          const updated = await res.json();
          setNotes(prev => prev.map(n => n.id === updated.id ? updated : n));
          setSelectedNote(updated);
          socket.emit('relay_dm_note', { event: 'dm_note_updated', data: updated });
        }
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    await fetch(`/api/dm-notes/${id}`, { method: 'DELETE', headers: dmHeaders() });
    setNotes(prev => prev.filter(n => n.id !== id));
    if (selectedNote?.id === id) setSelectedNote(null);
    socket.emit('relay_dm_note', { event: 'dm_note_deleted', data: { id } });
  };

  const isEditing = isCreating || selectedNote !== null;

  return (
    <Sheet open={isOpen} onOpenChange={open => !open && onClose()}>
      <SheetContent side="right" className="w-[360px] sm:w-[420px] p-0 flex flex-col bg-card border-l border-border">
        <SheetHeader className="px-4 py-3 border-b border-border bg-secondary/20 shrink-0">
          <SheetTitle className="font-display flex items-center gap-2 text-sm">
            <BookOpen className="h-4 w-4 text-primary" />
            DM Prep Notes
            {contextFilter?.label && (
              <Badge variant="outline" className="text-[9px] ml-1 font-normal">
                {contextFilter.label}
              </Badge>
            )}
          </SheetTitle>
        </SheetHeader>

        {isEditing ? (
          /* ── Editor View ── */
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50 bg-secondary/10 shrink-0">
              <Button
                variant="ghost" size="icon" className="h-6 w-6"
                onClick={() => { setIsCreating(false); setSelectedNote(null); }}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs text-muted-foreground">{isCreating ? 'New Note' : 'Edit Note'}</span>
              <div className="flex-1" />
              <Button size="sm" className="h-6 text-xs px-2" onClick={handleSave} disabled={isSaving}>
                <Save className="h-3 w-3 mr-1" />
                {isSaving ? 'Saving…' : 'Save'}
              </Button>
            </div>
            <div className="flex flex-col gap-2 p-3 flex-1 overflow-auto">
              <Input
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                placeholder="Note title…"
                className="h-8 text-sm font-display bg-background/50"
              />
              <textarea
                value={editContent}
                onChange={e => setEditContent(e.target.value)}
                placeholder={"Use **bold**, *italic*, # headings, - bullets\n\nWrite your prep notes here…"}
                className="flex-1 min-h-[200px] rounded-md border border-input bg-background/50 px-3 py-2 text-sm leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/40"
              />
              <Input
                value={editTags}
                onChange={e => setEditTags(e.target.value)}
                placeholder="Tags (comma-separated: combat, boss, secret)"
                className="h-7 text-xs bg-background/50"
              />
            </div>
          </div>
        ) : (
          /* ── List View ── */
          <>
            <div className="px-3 py-2 space-y-2 border-b border-border/50 shrink-0">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/50" />
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search notes…"
                  className="h-7 pl-6 text-xs bg-background/50"
                />
                {search && (
                  <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                    <X className="h-3 w-3 text-muted-foreground/50" />
                  </button>
                )}
              </div>
              {allTags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {allTags.map(tag => (
                    <button
                      key={tag}
                      onClick={() => setActiveTag(t => t === tag ? null : tag)}
                      className={`flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded border transition-all ${
                        activeTag === tag
                          ? 'border-primary/60 text-primary bg-primary/10'
                          : 'border-border/50 text-muted-foreground/60 hover:border-border hover:text-muted-foreground'
                      }`}
                    >
                      <Tag className="h-2 w-2" />{tag}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <ScrollArea className="flex-1">
              {filtered.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground/30 italic text-xs flex flex-col items-center gap-2">
                  <BookOpen className="h-8 w-8 opacity-20" />
                  {notes.length === 0 ? 'No prep notes yet.' : 'No notes match the filter.'}
                </div>
              ) : (
                <div className="p-2 space-y-1.5">
                  {filtered.map(note => (
                    <div
                      key={note.id}
                      className="group rounded-lg border border-border/50 bg-secondary/10 hover:bg-secondary/20 hover:border-border transition-all cursor-pointer overflow-hidden"
                      onClick={() => startEdit(note)}
                    >
                      <div className="px-3 py-2">
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-xs font-semibold leading-tight truncate">{note.title}</span>
                          <button
                            className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground/40 hover:text-destructive"
                            onClick={e => { e.stopPropagation(); handleDelete(note.id); }}
                            aria-label="Delete note"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                        {note.content && (
                          <p className="text-[10px] text-muted-foreground/60 mt-0.5 leading-relaxed line-clamp-2">
                            {note.content.replace(/[#*-]/g, '').trim()}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className={`text-[8px] px-1 py-0.5 rounded border font-semibold uppercase tracking-wider ${LINKED_TYPE_COLORS[note.linked_type] || LINKED_TYPE_COLORS.general}`}>
                            {note.linked_type}
                          </span>
                          {note.tags.slice(0, 3).map(tag => (
                            <span key={tag} className="text-[8px] text-muted-foreground/40">#{tag}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>

            <div className="px-3 py-2 border-t border-border/50 shrink-0">
              <Button size="sm" className="w-full h-8 text-xs" onClick={startCreate}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                New Note
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
