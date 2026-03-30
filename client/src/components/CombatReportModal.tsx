import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { Badge } from './ui/badge';
import { toast } from 'sonner';
import {
  BookOpen, Save, Scroll, Swords, Trophy, Shield,
  Sparkles, AlertTriangle, Loader2, Copy,
} from 'lucide-react';
import { cn } from '../lib/utils';

interface CombatReportData {
  report: string | null;
  events: Array<{ round: number; actor: string; action: string; target: string; detail: string }>;
  survivors: Array<{ name: string; type: string; hp: number; maxHp: number; conditions: string[] }>;
  totalRounds: number;
}

interface CombatReportModalProps {
  open: boolean;
  onClose: () => void;
  data: CombatReportData | null;
}

export function CombatReportModal({ open, onClose, data }: CombatReportModalProps) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [worldDate, setWorldDate] = useState<string | null>(null);

  // Fetch in-game date for archive tagging
  useEffect(() => {
    if (!open) return;
    setSaved(false);
    fetch('/api/world/state')
      .then(res => res.json())
      .then(({ time }) => {
        if (time?.day) {
          setWorldDate(`Day ${time.day}, Month ${time.month}, Year ${time.year}`);
        }
      })
      .catch(() => {});
  }, [open]);

  if (!data) return null;

  const handleSave = async () => {
    if (!data.report || saved) return;
    setSaving(true);
    try {
      const res = await fetch('/api/recaps/combat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recapText: data.report,
          rawLog: JSON.stringify(data.events),
          sessionDate: worldDate || new Date().toISOString(),
        }),
      });
      if (!res.ok) throw new Error('Save failed');
      setSaved(true);
      toast.success('Combat report saved to the Session Archive!');
    } catch {
      toast.error('Failed to save combat report.');
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = () => {
    if (data.report) {
      navigator.clipboard.writeText(data.report);
      toast.success('Copied to clipboard');
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-3xl h-[85vh] p-0 flex flex-col gap-0 border-primary/30">
        {/* Header */}
        <DialogHeader className="p-5 border-b border-border shrink-0 bg-card">
          <DialogTitle className="font-display text-xl flex items-center gap-3">
            <Swords className="h-6 w-6 text-destructive" />
            Combat Report
            {data.totalRounds > 0 && (
              <Badge variant="outline" className="ml-2 font-display text-xs border-primary/40 text-primary">
                {data.totalRounds} {data.totalRounds === 1 ? 'Round' : 'Rounds'}
              </Badge>
            )}
          </DialogTitle>
          {worldDate && (
            <p className="text-[10px] text-muted-foreground font-display tracking-wider uppercase mt-1">
              {worldDate}
            </p>
          )}
        </DialogHeader>

        {/* Content */}
        <ScrollArea className="flex-1">
          <div className="p-6 space-y-6">
            {data.report ? (
              <ReportRenderer markdown={data.report} />
            ) : (
              <div className="space-y-4">
                <div className="text-center py-8 text-muted-foreground">
                  <AlertTriangle className="h-8 w-8 mx-auto mb-3 text-amber-400" />
                  <p className="font-display">AI report unavailable</p>
                  <p className="text-sm mt-1">The combat log is shown below instead.</p>
                </div>
                <FallbackLog events={data.events} />
              </div>
            )}

            {/* Survivor snapshot */}
            {data.survivors.length > 0 && !data.report && (
              <div className="border-t border-border/30 pt-4">
                <h4 className="font-display text-sm text-muted-foreground mb-2 flex items-center gap-2">
                  <Shield className="h-4 w-4" /> Survivors
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {data.survivors.map((s, i) => (
                    <div key={i} className="bg-secondary/20 border border-border/40 rounded-md px-3 py-2 text-sm">
                      <span className="font-display">{s.name}</span>
                      <span className={cn(
                        'ml-2 text-xs tabular-nums',
                        s.hp / s.maxHp <= 0.25 ? 'text-destructive' :
                        s.hp / s.maxHp <= 0.5 ? 'text-amber-400' : 'text-health',
                      )}>
                        {s.hp}/{s.maxHp}
                      </span>
                      {s.conditions.length > 0 && (
                        <div className="mt-1 flex gap-1 flex-wrap">
                          {s.conditions.map((c, j) => (
                            <Badge key={j} variant="outline" className="text-[9px] px-1 py-0 border-amber-600/40 text-amber-400">
                              {c}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Footer actions */}
        <div className="p-4 border-t border-border shrink-0 flex items-center justify-between bg-card">
          <Button variant="ghost" size="sm" onClick={handleCopy} disabled={!data.report}>
            <Copy className="h-4 w-4 mr-1.5" />
            Copy
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Dismiss
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!data.report || saving || saved}
              className="font-display"
            >
              {saving ? (
                <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Saving...</>
              ) : saved ? (
                <><BookOpen className="h-4 w-4 mr-1.5" /> Saved</>
              ) : (
                <><Save className="h-4 w-4 mr-1.5" /> Save to Archive</>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Simple markdown renderer for the 3-section report ───────────────────────

function ReportRenderer({ markdown }: { markdown: string }) {
  const sections = parseReportSections(markdown);

  return (
    <div className="space-y-6">
      {sections.map((section, i) => (
        <div key={i} className="animate-in fade-in slide-in-from-bottom-2 duration-500" style={{ animationDelay: `${i * 150}ms` }}>
          <div className="flex items-center gap-2 mb-3">
            {section.icon}
            <h3 className="font-display text-lg tracking-wide">{section.heading}</h3>
          </div>
          <div className="text-sm text-foreground/80 leading-relaxed space-y-2 pl-1">
            {section.lines.map((line, j) => {
              // Bullet points
              if (line.startsWith('- ')) {
                return (
                  <div key={j} className="flex gap-2 items-start">
                    <span className="text-primary mt-1 shrink-0">&#x2022;</span>
                    <span dangerouslySetInnerHTML={{ __html: boldify(line.slice(2)) }} />
                  </div>
                );
              }
              // Regular paragraphs
              if (line.trim()) {
                return <p key={j} className="font-serif italic" dangerouslySetInnerHTML={{ __html: boldify(line) }} />;
              }
              return null;
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

interface ReportSection {
  heading: string;
  icon: React.ReactNode;
  lines: string[];
}

function parseReportSections(markdown: string): ReportSection[] {
  const headingMeta: Record<string, React.ReactNode> = {
    'The Narrative': <Scroll className="h-5 w-5 text-primary" />,
    'The Stats': <Trophy className="h-5 w-5 text-amber-400" />,
    'The Aftermath': <Sparkles className="h-5 w-5 text-violet-400" />,
  };

  const sections: ReportSection[] = [];
  let current: ReportSection | null = null;

  for (const raw of markdown.split('\n')) {
    const line = raw.trim();
    const headingMatch = line.match(/^##\s+(.+)$/);
    if (headingMatch) {
      if (current) sections.push(current);
      const heading = headingMatch[1];
      current = {
        heading,
        icon: headingMeta[heading] || <Scroll className="h-5 w-5 text-muted-foreground" />,
        lines: [],
      };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) sections.push(current);

  // If the LLM didn't use sections, treat it as a single narrative
  if (sections.length === 0) {
    return [{
      heading: 'Combat Summary',
      icon: <Scroll className="h-5 w-5 text-primary" />,
      lines: markdown.split('\n').map(l => l.trim()),
    }];
  }

  return sections;
}

/** Convert **bold** markdown to <strong> tags */
function boldify(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, '<strong class="text-foreground font-semibold">$1</strong>');
}

// ── Fallback: raw event log when AI is unavailable ──────────────────────────

function FallbackLog({ events }: { events: CombatReportData['events'] }) {
  return (
    <div className="space-y-1 text-xs font-mono">
      {events.map((e, i) => (
        <div key={i} className="flex gap-2 px-2 py-1 rounded bg-secondary/10 border border-border/20">
          <span className="text-muted-foreground shrink-0 w-8 text-right">R{e.round}</span>
          <span className="text-primary shrink-0 w-20 truncate">{e.actor}</span>
          <span className="text-muted-foreground">{e.detail}</span>
          {e.target && <span className="text-foreground/60 ml-auto shrink-0">→ {e.target}</span>}
        </div>
      ))}
    </div>
  );
}
