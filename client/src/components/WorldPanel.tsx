import { useState, useEffect } from 'react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Clock, Cloud, RefreshCw } from 'lucide-react';
import socket from '../socket';

const CLIMATES = ['Temperate', 'Arctic', 'Desert', 'Coastal', 'Underdark', 'Jungle'];

interface WorldState {
  time: { hour: number; minute: number; day: number; month: number; year: number };
  weather: { condition?: string; flavor?: string; impact?: string };
}

interface WorldPanelProps {
  isDm?: boolean;
}

export function WorldPanel({ isDm = false }: WorldPanelProps) {
  const [worldState, setWorldState] = useState<WorldState | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedClimate, setSelectedClimate] = useState('Temperate');

  useEffect(() => {
    fetch('/api/world/state')
      .then(res => res.json())
      .then(data => setWorldState(data))
      .catch(() => {});

    const handleUpdate = (data: WorldState) => setWorldState(data);
    socket.on('world_state', handleUpdate);
    return () => { socket.off('world_state', handleUpdate); };
  }, []);

  const advanceTime = async (minutes: number) => {
    await fetch('/api/world/advance-time', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ minutes })
    }).catch(() => {});
    socket.emit('advance_time', { minutes });
  };

  const generateWeather = async () => {
    setIsGenerating(true);
    try {
      await fetch('/api/world/weather', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ climate: selectedClimate })
      });
      socket.emit('advance_time', { minutes: 0 });
    } finally {
      setIsGenerating(false);
    }
  };

  if (!worldState) return null;

  const { time, weather } = worldState;
  const timeStr = `${(time.hour ?? 0).toString().padStart(2, '0')}:${(time.minute ?? 0).toString().padStart(2, '0')}`;
  const dateStr = `Day ${time.day}, Month ${time.month}, Year ${time.year}`;

  return (
    <Card className="border-primary/20 bg-secondary/5">
      <CardContent className="p-4 space-y-4">
        {/* Time */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <Clock className="h-3 w-3 text-primary" />
              <span className="text-[10px] font-bold text-primary uppercase tracking-[0.2em]">World Chronos</span>
            </div>
            <div className="text-2xl font-display font-bold text-foreground leading-none">{timeStr}</div>
            <div className="text-[9px] text-muted-foreground uppercase font-bold tracking-tight mt-0.5">{dateStr}</div>
          </div>
          {isDm && (
            <div className="flex flex-wrap gap-1 justify-end max-w-[120px]">
              {[{ label: '+10m', mins: 10 }, { label: '+1h', mins: 60 }, { label: '+8h', mins: 480 }].map(t => (
                <button
                  key={t.label}
                  onClick={() => advanceTime(t.mins)}
                  className="bg-secondary/50 border border-border px-2 py-0.5 rounded text-[8px] font-bold hover:bg-secondary transition-colors"
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Weather */}
        <div className="border-t border-border/40 pt-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Cloud className="h-3 w-3 text-mana" />
              <span className="text-[10px] font-bold text-mana uppercase tracking-[0.2em]">Weather</span>
            </div>
            {isDm && (
              <Select value={selectedClimate} onValueChange={setSelectedClimate}>
                <SelectTrigger className="h-5 text-[8px] w-24 px-1 bg-secondary/20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CLIMATES.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="bg-secondary/30 border border-border/40 rounded p-2 relative group">
            <div className="text-xs font-bold text-foreground">{weather.condition || 'Clear Skies'}</div>
            <div className="text-[9px] text-muted-foreground italic mb-1">"{weather.flavor || 'The air is calm and the sky is open.'}"</div>
            {weather.impact && weather.impact !== 'None' && (
              <span className="text-[8px] bg-mana/10 text-mana border border-mana/20 inline-block px-1.5 py-0.5 rounded font-bold uppercase">
                {weather.impact}
              </span>
            )}
            {isDm && (
              <Button
                size="sm"
                variant="ghost"
                onClick={generateWeather}
                disabled={isGenerating}
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-secondary/80 backdrop-blur-sm h-full w-full rounded text-[8px] font-bold uppercase tracking-widest"
              >
                <RefreshCw className={`h-3 w-3 mr-1 ${isGenerating ? 'animate-spin' : ''}`} />
                {isGenerating ? 'Weaving...' : 'Regenerate'}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
