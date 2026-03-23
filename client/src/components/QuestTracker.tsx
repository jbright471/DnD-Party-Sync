import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Checkbox } from './ui/checkbox';
import { ScrollText, Plus, X, CheckCircle2, XCircle, RotateCcw } from 'lucide-react';
import socket from '../socket';

interface Quest {
  id: number;
  title: string;
  description: string;
  dm_secrets?: string;
  rewards?: string;
  status: 'active' | 'completed' | 'failed';
  is_public: number;
}

interface QuestTrackerProps {
  isDm?: boolean;
}

export function QuestTracker({ isDm = false }: QuestTrackerProps) {
  const [quests, setQuests] = useState<Quest[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newQuest, setNewQuest] = useState({
    title: '', description: '', dm_secrets: '', rewards: '', is_public: 1
  });

  useEffect(() => {
    fetchQuests();
    socket.on('refresh_quests', fetchQuests);
    return () => { socket.off('refresh_quests', fetchQuests); };
  }, [isDm]);

  const fetchQuests = async () => {
    try {
      const res = await fetch(`/api/quests?isDm=${isDm}`);
      const data = await res.json();
      setQuests(data);
    } catch (e) {}
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/quests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newQuest)
    });
    if (res.ok) {
      setIsCreating(false);
      setNewQuest({ title: '', description: '', dm_secrets: '', rewards: '', is_public: 1 });
      fetchQuests();
      socket.emit('refresh_quests_global');
    }
  };

  const updateStatus = async (id: number, status: Quest['status']) => {
    await fetch(`/api/quests/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    fetchQuests();
    socket.emit('refresh_quests_global');
  };

  const statusColor: Record<Quest['status'], string> = {
    active: 'text-gold border-gold/30 bg-gold/10',
    completed: 'text-health border-health/30 bg-health/10',
    failed: 'text-destructive border-destructive/30 bg-destructive/10',
  };

  return (
    <Card className="flex flex-col h-full border-primary/20 bg-secondary/5">
      <CardHeader className="pb-2 shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="font-display flex items-center gap-2">
            <ScrollText className="h-5 w-5 text-primary" />
            Quest Log
          </CardTitle>
          {isDm && (
            <Button size="sm" variant="outline" onClick={() => setIsCreating(true)} className="h-7 text-xs">
              <Plus className="h-3 w-3 mr-1" /> New
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto space-y-3 pr-2">
        {isCreating && (
          <form onSubmit={handleCreate} className="bg-secondary/30 border border-primary/20 rounded-lg p-3 space-y-2 animate-in slide-in-from-top-2">
            <Input
              required
              placeholder="Quest title..."
              value={newQuest.title}
              onChange={e => setNewQuest({ ...newQuest, title: e.target.value })}
              className="h-7 text-xs"
            />
            <Textarea
              placeholder="Public description..."
              value={newQuest.description}
              onChange={e => setNewQuest({ ...newQuest, description: e.target.value })}
              rows={2}
              className="text-xs"
            />
            <Textarea
              placeholder="DM secrets (hidden from players)..."
              value={newQuest.dm_secrets}
              onChange={e => setNewQuest({ ...newQuest, dm_secrets: e.target.value })}
              rows={2}
              className="text-xs bg-destructive/5 border-destructive/20"
            />
            <Input
              placeholder="Rewards..."
              value={newQuest.rewards}
              onChange={e => setNewQuest({ ...newQuest, rewards: e.target.value })}
              className="h-7 text-xs"
            />
            <div className="flex items-center gap-2">
              <Checkbox
                checked={!!newQuest.is_public}
                onCheckedChange={v => setNewQuest({ ...newQuest, is_public: v ? 1 : 0 })}
              />
              <span className="text-[10px] text-muted-foreground uppercase font-bold">Publicly Visible</span>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setIsCreating(false)} className="flex-1 h-7 text-xs">
                Cancel
              </Button>
              <Button type="submit" size="sm" className="flex-1 h-7 text-xs">
                Create
              </Button>
            </div>
          </form>
        )}

        {quests.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground opacity-30">
            <ScrollText className="h-10 w-10 mb-2" />
            <p className="text-sm italic">The log is empty.</p>
          </div>
        ) : (
          quests.map(quest => (
            <div
              key={quest.id}
              className={`border rounded-lg p-3 transition-all ${
                quest.status === 'completed' ? 'opacity-70 border-health/20' :
                quest.status === 'failed' ? 'opacity-70 border-destructive/20' :
                'border-border/50 bg-secondary/10'
              }`}
            >
              <div className="flex items-start justify-between mb-1">
                <div>
                  <h4 className={`text-sm font-display font-bold ${
                    quest.status === 'completed' ? 'line-through text-health' :
                    quest.status === 'failed' ? 'line-through text-destructive' : 'text-gold'
                  }`}>{quest.title}</h4>
                  <Badge variant="outline" className={`text-[8px] h-4 px-1 ${statusColor[quest.status]}`}>
                    {quest.status}
                  </Badge>
                </div>
                {isDm && (
                  <div className="flex gap-1 shrink-0">
                    {quest.status === 'active' && (
                      <>
                        <Button size="icon" variant="ghost" className="h-6 w-6 text-health hover:bg-health/10" onClick={() => updateStatus(quest.id, 'completed')}>
                          <CheckCircle2 className="h-3 w-3" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:bg-destructive/10" onClick={() => updateStatus(quest.id, 'failed')}>
                          <XCircle className="h-3 w-3" />
                        </Button>
                      </>
                    )}
                    {quest.status !== 'active' && (
                      <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground" onClick={() => updateStatus(quest.id, 'active')}>
                        <RotateCcw className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                )}
              </div>
              {quest.description && (
                <p className="text-xs text-muted-foreground leading-relaxed mb-2">{quest.description}</p>
              )}
              {quest.rewards && (
                <div className="text-[10px] text-gold/70 italic">💎 {quest.rewards}</div>
              )}
              {isDm && quest.dm_secrets && (
                <div className="mt-2 p-2 bg-destructive/5 border-l-2 border-destructive/40 rounded text-[10px] text-muted-foreground italic">
                  <span className="text-destructive font-bold uppercase block mb-1 not-italic">Secrets</span>
                  {quest.dm_secrets}
                </div>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
