import { useState, useEffect, useRef } from 'react';
import { useGame } from '../context/GameContext';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { ScrollText, Check, X } from 'lucide-react';
import socket from '../socket';

type LogFilter = 'all' | 'mechanical' | 'lore';

export function ActionLog() {
  const { state } = useGame();
  const [filter, setFilter] = useState<LogFilter>('all');
  const scrollRef = useRef<HTMLDivElement>(null);
  const logs = state.actionLog;
  const approvalMode = state.isApprovalMode;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, filter]);

  const handleResolve = (logId: string | number, approved: boolean) => {
    socket.emit('resolve_pending_action', { logId, approved });
  };

  const filteredLogs = logs.filter(log => {
    if (filter === 'all') return true;
    const isLore = log.actor === 'DM' && (
      (log.action_description || '').includes('AI Generated') ||
      (log.action_description || '').length > 100
    );
    if (filter === 'lore') return isLore;
    if (filter === 'mechanical') return !isLore;
    return true;
  });

  return (
    <Card className="flex flex-col h-full border-primary/20 bg-secondary/5">
      <CardHeader className="pb-2 shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="font-display flex items-center gap-2 text-sm">
            <ScrollText className="h-4 w-4 text-muted-foreground" />
            Chronicle
          </CardTitle>
          <div className="flex gap-1">
            {(['all', 'mechanical', 'lore'] as LogFilter[]).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-widest transition-all ${
                  filter === f
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary/50 text-muted-foreground hover:bg-secondary'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0">
        <div ref={scrollRef} className="h-full overflow-y-auto p-3 space-y-2">
          {filteredLogs.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-xs italic opacity-50">
              No entries in this chronicle.
            </div>
          ) : (
            filteredLogs.map((log: any) => {
              const isPending = log.status === 'pending';
              const isRejected = log.status === 'rejected';

              return (
                <div
                  key={log.id}
                  className={`p-2.5 rounded-lg border text-xs leading-relaxed animate-in slide-in-from-left-2 duration-300 ${
                    isPending
                      ? 'bg-gold/5 border-gold/30 border-dashed'
                      : isRejected
                      ? 'bg-destructive/5 border-destructive/20 opacity-50'
                      : 'bg-secondary/20 border-border/40'
                  }`}
                >
                  <div className="flex justify-between items-start mb-0.5">
                    <span className={`text-[10px] font-bold uppercase tracking-tight ${isPending ? 'text-gold' : 'text-primary'}`}>
                      {log.actor}
                    </span>
                    <span className="text-[8px] text-muted-foreground/50 font-mono italic">
                      {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className={`text-[11px] ${isRejected ? 'line-through text-muted-foreground' : 'text-foreground/80'}`}>
                    {log.action_description}
                  </p>
                  {isPending && approvalMode && (
                    <div className="mt-2 flex gap-2 border-t border-gold/20 pt-2">
                      <Button
                        size="sm"
                        className="flex-1 h-6 text-[9px] bg-health/20 text-health hover:bg-health hover:text-white border-none"
                        onClick={() => handleResolve(log.id, true)}
                      >
                        <Check className="h-3 w-3 mr-1" /> Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="flex-1 h-6 text-[9px]"
                        onClick={() => handleResolve(log.id, false)}
                      >
                        <X className="h-3 w-3 mr-1" /> Deny
                      </Button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}
