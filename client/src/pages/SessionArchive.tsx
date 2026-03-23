import { useState, useEffect } from 'react';
import { BookOpen, ScrollText } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { ScrollArea } from '../components/ui/scroll-area';

interface Recap {
  id: number;
  recap_text: string;
  session_date: string;
  created_at: string;
}

export default function SessionArchive() {
  const [recaps, setRecaps] = useState<Recap[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Recap | null>(null);

  useEffect(() => {
    fetch('/api/recaps')
      .then(res => res.json())
      .then(data => { setRecaps(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString(undefined, {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
      });
    } catch { return dateStr; }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-4 pb-6">
      <div className="flex items-center gap-3">
        <BookOpen className="h-7 w-7 text-primary" />
        <h1 className="text-3xl font-display tracking-wider">The Grand Archive</h1>
        <p className="text-muted-foreground text-sm ml-2">AI-generated session recaps</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-[calc(100vh-12rem)]">
        {/* Sidebar */}
        <Card className="lg:col-span-4 flex flex-col border-primary/20 bg-secondary/5">
          <div className="p-3 border-b border-border shrink-0">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Session Chronicles</span>
          </div>
          <ScrollArea className="flex-1">
            {loading ? (
              <div className="p-6 text-center text-muted-foreground text-sm italic animate-pulse">
                Consulting the scribes...
              </div>
            ) : recaps.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground text-sm italic opacity-30">
                <ScrollText className="h-10 w-10 mx-auto mb-2 opacity-50" />
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
        </Card>

        {/* Main Content */}
        <Card className="lg:col-span-8 flex flex-col border-primary/20 bg-secondary/5">
          <ScrollArea className="flex-1">
            {selected ? (
              <div className="p-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="text-center mb-10">
                  <div className="text-primary text-[10px] font-bold uppercase tracking-[0.5em] mb-2">Chronicle Entry</div>
                  <h3 className="font-display text-3xl text-foreground">Adventure #{selected.id}</h3>
                  <div className="text-sm text-muted-foreground mt-2">{formatDate(selected.session_date || selected.created_at)}</div>
                </div>
                <div className="text-base text-foreground/80 leading-relaxed font-serif italic whitespace-pre-wrap max-w-2xl mx-auto">
                  {selected.recap_text}
                </div>
                <div className="mt-12 flex justify-center opacity-20">
                  <div className="w-32 h-px bg-gradient-to-r from-transparent via-primary to-transparent" />
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-20 italic p-12">
                <BookOpen className="h-16 w-16 mb-4" />
                <p className="text-xl font-display text-center">Select a chronicle to read</p>
              </div>
            )}
          </ScrollArea>
        </Card>
      </div>
    </div>
  );
}
