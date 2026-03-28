import { useState } from 'react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Wand2, Sparkles, AlertTriangle, ClipboardPaste, X } from 'lucide-react';
import { ManualItemFormData } from '../types/character';

interface QuickEquipParserProps {
  onParsed: (values: Partial<ManualItemFormData>) => void;
}

export function QuickEquipParser({ onParsed }: QuickEquipParserProps) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleParse = async () => {
    if (!text.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/homebrew/parse-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `Server error ${res.status}`);
      }

      onParsed(data);
      setText('');
    } catch (err: any) {
      setError(err.message || 'Failed to parse item. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const handlePaste = async () => {
    try {
      const clip = await navigator.clipboard.readText();
      setText(clip);
    } catch {
      // clipboard permission denied — user can paste manually
    }
  };

  return (
    <Card className="border-primary/20 bg-secondary/5">
      <CardHeader className="pb-3">
        <CardTitle className="font-display flex items-center gap-2 text-base">
          <Wand2 className="h-4 w-4 text-primary" />
          AI Item Parser
        </CardTitle>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Paste any item text — a PDF excerpt, wiki entry, or homebrew writeup. The AI will extract
          the stats and pre-fill the Create Item form for you to review and save.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative">
          <Textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={`Paste item text here…\n\nExample:\n+1 Longsword\nWeapon (longsword), uncommon\n\nYou have a +1 bonus to attack and damage rolls made with this magic weapon. Damage: 1d8 slashing (1d10 versatile). Properties: Versatile.`}
            rows={10}
            className="bg-background/50 text-xs font-mono resize-none pr-8"
            disabled={loading}
          />
          {text && (
            <button
              type="button"
              onClick={() => { setText(''); setError(null); }}
              className="absolute top-2 right-2 text-muted-foreground/50 hover:text-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {error && (
          <div className="flex items-start gap-2 px-3 py-2 rounded border border-destructive/30 bg-destructive/10 text-xs text-destructive">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePaste}
            disabled={loading}
            className="text-xs"
          >
            <ClipboardPaste className="h-3.5 w-3.5 mr-1.5" />
            Paste
          </Button>

          <Button
            onClick={handleParse}
            disabled={loading || !text.trim()}
            className="flex-1 font-display"
          >
            {loading ? (
              <>
                <Sparkles className="h-4 w-4 mr-2 animate-spin" />
                Parsing with AI…
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4 mr-2" />
                Parse Item
              </>
            )}
          </Button>
        </div>

        {loading && (
          <div className="space-y-2 animate-pulse pt-1">
            <div className="h-2 bg-primary/10 rounded-full w-3/4" />
            <div className="h-2 bg-primary/10 rounded-full w-1/2" />
            <div className="h-2 bg-primary/10 rounded-full w-2/3" />
            <p className="text-[10px] text-center text-muted-foreground/60 pt-1">
              Querying Ollama — this may take 15–30 seconds…
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
