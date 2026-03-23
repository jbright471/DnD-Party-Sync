import { useState } from 'react';
import { useGame } from '../context/GameContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';
import { Sparkles, Archive, Gift, Gem } from 'lucide-react';
import { toast } from 'sonner';

interface LootItem {
  name: string;
  rarity: string;
  type: string;
  description: string;
  stats?: {
    acBonus?: number;
    damage?: string;
    statBonuses?: Record<string, number>;
  };
}

interface LootManagerProps {
  open: boolean;
  onClose: () => void;
}

const RARITY_COLORS: Record<string, string> = {
  Common: 'text-muted-foreground border-muted-foreground/30',
  Uncommon: 'text-health border-health/40',
  Rare: 'text-mana border-mana/40',
  'Very Rare': 'text-primary border-primary/40',
  Legendary: 'text-gold border-gold/40',
};

export function LootManager({ open, onClose }: LootManagerProps) {
  const { state } = useGame();
  const party = state.characters;
  const [context, setContext] = useState('');
  const [items, setItems] = useState<LootItem[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [givingTo, setGivingTo] = useState<number | null>(null);

  const handleGenerate = async () => {
    if (!context.trim()) {
      toast.error('Provide a location or source context first.');
      return;
    }
    setIsGenerating(true);
    try {
      const res = await fetch('/api/loot/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context })
      });
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Loot forge failed — Ollama unreachable.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGive = async (item: LootItem, characterId: string) => {
    const res = await fetch('/api/loot/give', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ characterId, item })
    });
    if (res.ok) {
      const char = party.find(p => p.id === characterId);
      toast.success(`${item.name} given to ${char?.name || 'character'}!`);
      setGivingTo(null);
    } else {
      toast.error('Failed to give item.');
    }
  };

  const handleArchive = async (item: LootItem) => {
    const res = await fetch('/api/loot/archive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item })
    });
    if (res.ok) toast.success(`${item.name} archived to Homebrew Library.`);
    else toast.error('Archive failed.');
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-4xl h-[80vh] p-0 flex flex-col gap-0">
        <DialogHeader className="p-4 border-b border-border shrink-0">
          <DialogTitle className="font-display text-xl flex items-center gap-2">
            <Gem className="h-5 w-5 text-gold" /> Loot Forger
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden">
          {/* Left: Input */}
          <div className="w-72 border-r border-border p-4 flex flex-col gap-4 bg-secondary/10 shrink-0">
            <div className="space-y-2">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Location / Source</Label>
              <Textarea
                placeholder="e.g. 'Inside a dusty sarcophagus in a desert tomb' or 'Goblins in a damp forest'..."
                value={context}
                onChange={e => setContext(e.target.value)}
                rows={6}
                className="text-xs resize-none"
              />
            </div>
            <Button
              onClick={handleGenerate}
              disabled={isGenerating || !context.trim()}
              className="w-full font-display"
            >
              {isGenerating
                ? <><Sparkles className="h-4 w-4 mr-2 animate-spin" /> Forging...</>
                : <><Sparkles className="h-4 w-4 mr-2" /> Forge Loot</>
              }
            </Button>
            <p className="text-[10px] text-muted-foreground italic leading-relaxed">
              Ollama will craft 1–3 unique items based on your context, including mechanical bonuses and flavor text.
            </p>
          </div>

          {/* Right: Results */}
          <ScrollArea className="flex-1">
            <div className="p-4">
              {items.length === 0 ? (
                <div className="h-[50vh] flex flex-col items-center justify-center text-muted-foreground opacity-30 italic">
                  <Gem className="h-12 w-12 mb-4" />
                  <p>Provide context and forge some treasure.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {items.map((item, idx) => (
                    <div key={idx} className="bg-secondary/20 border border-border/60 rounded-lg overflow-hidden hover:border-gold/30 transition-colors">
                      <div className="p-4 flex items-start justify-between border-b border-border/30">
                        <div>
                          <h3 className="font-display text-base text-gold">{item.name}</h3>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className={`text-[8px] h-4 ${RARITY_COLORS[item.rarity] || 'text-muted-foreground'}`}>
                              {item.rarity}
                            </Badge>
                            <span className="text-[9px] text-muted-foreground uppercase">{item.type}</span>
                          </div>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <Button size="sm" variant="outline" className="h-7 text-[9px]" onClick={() => handleArchive(item)}>
                            <Archive className="h-3 w-3 mr-1" /> Archive
                          </Button>
                          {party.length > 0 && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="sm" variant="outline" className="h-7 text-[9px] text-health border-health/30">
                                  <Gift className="h-3 w-3 mr-1" /> Give To...
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent>
                                {party.map(char => (
                                  <DropdownMenuItem key={char.id} onClick={() => handleGive(item, char.id)}>
                                    {char.name}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </div>
                      <div className="p-4">
                        <p className="text-xs text-muted-foreground italic leading-relaxed mb-3">"{item.description}"</p>
                        {item.stats && Object.keys(item.stats).length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {item.stats.acBonus && item.stats.acBonus > 0 && (
                              <Badge className="text-[9px] bg-gold/10 text-gold border-gold/30">+{item.stats.acBonus} AC</Badge>
                            )}
                            {item.stats.damage && (
                              <Badge className="text-[9px] bg-destructive/10 text-destructive border-destructive/30">⚔️ {item.stats.damage}</Badge>
                            )}
                            {Object.entries(item.stats.statBonuses || {}).map(([s, b]) => (
                              <Badge key={s} className="text-[9px] bg-mana/10 text-mana border-mana/30">+{b} {s}</Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
