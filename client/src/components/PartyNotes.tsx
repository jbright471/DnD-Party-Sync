import { useState, useEffect, useRef } from 'react';
import { useGame } from '../context/GameContext';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import { ClipboardList, Plus, Trash2 } from 'lucide-react';
import socket from '../socket';

const CATEGORIES = [
  { id: 'quest', label: 'Quests' },
  { id: 'npc', label: 'NPCs' },
  { id: 'loot', label: 'Loot' },
  { id: 'general', label: 'General' },
];

interface Note {
  id: number;
  category: string;
  title: string;
  content: string;
  updated_by: string;
  updated_at: string;
}

function NoteCard({ note, onUpdate, onDelete }: { note: Note; onUpdate: (id: number, content: string) => void; onDelete: (id: number) => void }) {
  const [content, setContent] = useState(note.content || '');
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (!isEditing) setContent(note.content || '');
  }, [note.content, isEditing]);

  return (
    <div className="bg-secondary/20 border border-border/40 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-display font-semibold text-foreground">{note.title}</span>
        <div className="flex items-center gap-2">
          {note.updated_by && (
            <span className="text-[10px] text-muted-foreground">by {note.updated_by}</span>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-destructive"
            onClick={() => onDelete(note.id)}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
      <Textarea
        value={content}
        onChange={e => { setContent(e.target.value); onUpdate(note.id, e.target.value); }}
        onFocus={() => setIsEditing(true)}
        onBlur={() => setIsEditing(false)}
        placeholder="Write your notes here... Changes sync in real-time."
        rows={3}
        className="text-xs resize-y bg-secondary/10"
      />
    </div>
  );
}

export function PartyNotes() {
  const { state } = useGame();
  const notes = state.notes;
  const [activeCategory, setActiveCategory] = useState('quest');
  const [newTitle, setNewTitle] = useState('');
  const [showNewNote, setShowNewNote] = useState(false);
  const debounceRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  const filteredNotes = notes.filter(n => n.category === activeCategory);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    socket.emit('create_note', {
      category: activeCategory,
      title: newTitle.trim(),
      content: '',
      updated_by: 'Player',
    });
    setNewTitle('');
    setShowNewNote(false);
  };

  const handleUpdate = (noteId: number, content: string) => {
    clearTimeout(debounceRef.current[noteId]);
    debounceRef.current[noteId] = setTimeout(() => {
      socket.emit('update_note', { noteId, content, updated_by: 'Player' });
    }, 500);
  };

  const handleDelete = (noteId: number) => {
    socket.emit('delete_note', { noteId });
  };

  return (
    <Card className="flex flex-col h-full border-primary/20 bg-secondary/5">
      <CardHeader className="pb-2 shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="font-display flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            Party Notes
          </CardTitle>
          <Button size="sm" variant="outline" onClick={() => setShowNewNote(!showNewNote)} className="h-7 text-xs">
            <Plus className="h-3 w-3 mr-1" /> New
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col overflow-hidden gap-3 pb-3">
        <Tabs value={activeCategory} onValueChange={setActiveCategory}>
          <TabsList className="w-full h-7 text-xs">
            {CATEGORIES.map(cat => (
              <TabsTrigger key={cat.id} value={cat.id} className="text-xs flex-1">
                {cat.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {showNewNote && (
          <form onSubmit={handleCreate} className="flex gap-2">
            <Input
              placeholder={`New ${activeCategory} note title...`}
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              autoFocus
              className="h-8 text-xs flex-1"
            />
            <Button type="submit" size="sm" disabled={!newTitle.trim()} className="h-8">Add</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowNewNote(false)} className="h-8">✕</Button>
          </form>
        )}

        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {filteredNotes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground opacity-30">
              <ClipboardList className="h-8 w-8 mb-2" />
              <p className="text-sm italic">No {activeCategory} notes yet.</p>
            </div>
          ) : (
            filteredNotes.map(note => (
              <NoteCard key={note.id} note={note} onUpdate={handleUpdate} onDelete={handleDelete} />
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
