/**
 * LootDropModal — DM interface for dropping items into the shared party loot pool.
 *
 * Two tabs:
 *  1. Library — browse existing homebrew_entities and drop them into the pool
 *  2. Create New — ManualItemForm in pool-drop mode
 *
 * Also shows the current pool with remove buttons.
 */

import { useState, useEffect } from 'react';
import { Gem, Search, Trash2, Plus, Package, Sparkles } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { ManualItemForm } from './ManualItemForm';
import { toast } from 'sonner';
import socket from '../socket';
import { useGame } from '../context/GameContext';
import { ManualItemFormData } from '../types/character';

const RARITY_COLORS: Record<string, string> = {
  Common:      'text-foreground/60 border-border/40',
  Uncommon:    'text-green-400 border-green-800/40',
  Rare:        'text-blue-400 border-blue-800/40',
  'Very Rare': 'text-purple-400 border-purple-800/40',
  Legendary:   'text-amber-400 border-amber-700/40',
  Artifact:    'text-red-400 border-red-700/40',
};

interface LibraryItem {
  id: number;
  entity_type: string;
  name: string;
  description: string;
  stats_json: string;
}

interface LootDropModalProps {
  open: boolean;
  onClose: () => void;
}

export function LootDropModal({ open, onClose }: LootDropModalProps) {
  const { state } = useGame();
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [search, setSearch] = useState('');
  const [formKey, setFormKey] = useState(0);

  // Fetch homebrew library
  useEffect(() => {
    if (!open) return;
    fetch('/api/homebrew')
      .then(r => r.ok ? r.json() : [])
      .then(data => setLibrary(Array.isArray(data) ? data.filter((e: LibraryItem) => e.entity_type === 'item') : []))
      .catch(() => {});
  }, [open]);

  if (!open) return null;

  const filtered = library.filter(item =>
    item.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleDropFromLibrary = (item: LibraryItem) => {
    const stats = JSON.parse(item.stats_json || '{}');
    socket.emit('drop_loot', {
      name: item.name,
      description: item.description,
      category: stats.category || 'Gear',
      rarity: stats.rarity || 'Common',
      stats,
      droppedBy: 'DM',
    });
    toast.success(`${item.name} dropped into the loot pool.`);
  };

  const handleDropFromForm = (data: ManualItemFormData) => {
    const stats: Record<string, unknown> = { ...data };
    socket.emit('drop_loot', {
      name: data.name.trim(),
      description: data.description,
      category: data.category,
      rarity: data.rarity,
      stats,
      droppedBy: 'DM',
    });
    toast.success(`${data.name} dropped into the loot pool.`);
    setFormKey(k => k + 1);
  };

  const handleRemove = (lootId: number) => {
    socket.emit('remove_loot', { lootId });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Gem className="h-5 w-5 text-gold" />
            <h2 className="font-display text-xl text-gold">Drop Loot</h2>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="text-muted-foreground">
            Close
          </Button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <Tabs defaultValue="library">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="library" className="font-display text-xs">
                <Package className="h-3 w-3 mr-1.5" /> Homebrew Library
              </TabsTrigger>
              <TabsTrigger value="create" className="font-display text-xs">
                <Plus className="h-3 w-3 mr-1.5" /> Create New
              </TabsTrigger>
            </TabsList>

            {/* Library Tab */}
            <TabsContent value="library" className="space-y-3 mt-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search homebrew items..."
                  className="pl-9 h-8 text-xs bg-background/50"
                />
              </div>
              <ScrollArea style={{ maxHeight: 260 }}>
                {filtered.length === 0 ? (
                  <p className="text-center text-muted-foreground/40 text-xs italic py-8">
                    {library.length === 0
                      ? 'No homebrew items in the library yet.'
                      : 'No items match your search.'}
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {filtered.map(item => {
                      const stats = JSON.parse(item.stats_json || '{}');
                      const rarity = stats.rarity || 'Common';
                      return (
                        <div key={item.id} className="flex items-center gap-2 p-2 rounded border border-border/40 bg-secondary/10 hover:bg-secondary/20 transition-colors">
                          <div className="flex-1 min-w-0">
                            <span className={`text-xs font-display font-bold ${RARITY_COLORS[rarity]?.split(' ')[0] || ''}`}>
                              {item.name}
                            </span>
                            <p className="text-[9px] text-muted-foreground truncate">{item.description || stats.category || 'Item'}</p>
                          </div>
                          <Badge variant="outline" className="text-[8px] shrink-0">{rarity}</Badge>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-[10px] text-gold border-gold/30 hover:bg-gold/10 shrink-0"
                            onClick={() => handleDropFromLibrary(item)}
                          >
                            <Gem className="h-2.5 w-2.5 mr-1" /> Drop
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            {/* Create Tab */}
            <TabsContent value="create" className="mt-3">
              <ManualItemForm
                key={formKey}
                onPoolDrop={handleDropFromForm}
              />
            </TabsContent>
          </Tabs>

          {/* Current Pool */}
          {state.sharedLoot.length > 0 && (
            <div className="space-y-2 pt-3 border-t border-border/40">
              <h3 className="text-[10px] font-display text-gold uppercase tracking-widest flex items-center gap-1.5">
                <Sparkles className="h-3 w-3" />
                Current Pool ({state.sharedLoot.length})
              </h3>
              <div className="space-y-1">
                {state.sharedLoot.map(item => (
                  <div key={item.id} className="flex items-center gap-2 px-3 py-1.5 rounded border border-gold/20 bg-gold/5 text-xs">
                    <span className={`font-display font-bold flex-1 truncate ${RARITY_COLORS[item.rarity]?.split(' ')[0] || 'text-foreground'}`}>
                      {item.name}
                    </span>
                    <Badge variant="outline" className="text-[8px] shrink-0">{item.rarity}</Badge>
                    <button
                      onClick={() => handleRemove(item.id)}
                      className="text-muted-foreground/30 hover:text-destructive/70 transition-colors shrink-0"
                      title="Remove from pool"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
