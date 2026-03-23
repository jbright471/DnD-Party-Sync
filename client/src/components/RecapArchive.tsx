import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { ScrollArea } from './ui/scroll-area';
import { BookOpen } from 'lucide-react';

interface Recap {
  id: number;
  recap_text: string;
  session_date: string;
  created_at: string;
}

interface RecapArchiveProps {
  open: boolean;
  onClose: () => void;
}

export function RecapArchive({ open, onClose }: RecapArchiveProps) {
  const [recaps, setRecaps] = useState<Recap[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Recap | null>(null);

  useEffect(() => {
    if (open) {
      setLoading(true);
      fetch('/api/recaps')
        .then(res => res.json())
        .then(data => { setRecaps(data); setLoading(false); })
        .catch(() => setLoading(false));
    }
  }, [open]);

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString(undefined, {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
      });
    } catch { return dateStr; }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-5xl h-[90vh] p-0 flex flex-col gap-0">
        <DialogHeader className="p-4 border-b border-border shrink-0">
          <DialogTitle className="font-display text-xl flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" /> The Grand Archive
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden">
          {/* Left: List */}
          <div className="w-64 border-r border-border flex flex-col shrink-0 bg-secondary/10">
            <div className="p-3 border-b border-border">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Session Chronicles</span>
            </div>
            <ScrollArea className="flex-1">
              {loading ? (
                <div className="p-6 text-center text-muted-foreground text-sm italic animate-pulse">
                  Consulting the scribes...
                </div>
              ) : recaps.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground text-sm italic opacity-30">
                  The scrolls are empty.
                </div>
              ) : (
                recaps.map(recap => (
                  <button
                    key={recap.id}
                    onClick={() => setSelected(recap)}
                    className={`w-full p-4 text-left border-b border-border/30 transition-all hover:bg-secondary/20 group ${
                      selected?.id === recap.id ? 'bg-primary/10 border-l-2 border-l-primary' : ''
                    }`}
                  >
                    <div className={`text-xs font-bold mb-1 group-hover:text-primary transition-colors ${
                      selected?.id === recap.id ? 'text-primary' : 'text-foreground'
                    }`}>
                      {formatDate(recap.session_date || recap.created_at)}
                    </div>
                    <div className="text-[9px] text-muted-foreground uppercase tracking-widest">
                      Adventure #{recap.id}
                    </div>
                  </button>
                ))
              )}
            </ScrollArea>
          </div>

          {/* Right: Detail */}
          <ScrollArea className="flex-1">
            {selected ? (
              <div className="p-10 flex flex-col items-center animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="w-full max-w-2xl">
                  <div className="text-center mb-10">
                    <div className="text-primary text-[10px] font-bold uppercase tracking-[0.5em] mb-2">Chronicle Entry</div>
                    <h3 className="font-display text-3xl text-foreground">Adventure #{selected.id}</h3>
                    <div className="text-sm text-muted-foreground mt-2">{formatDate(selected.session_date || selected.created_at)}</div>
                  </div>
                  <div className="text-base text-foreground/80 leading-relaxed font-serif italic whitespace-pre-wrap px-4">
                    {selected.recap_text}
                  </div>
                  <div className="mt-12 flex justify-center opacity-20">
                    <div className="w-32 h-px bg-gradient-to-r from-transparent via-primary to-transparent" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-20 italic">
                <BookOpen className="h-16 w-16 mb-4" />
                <p className="text-xl font-display text-center">Select a chronicle to read</p>
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
