import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Music2, Volume2, VolumeX } from 'lucide-react';
import socket from '../socket';

const ATMOSPHERES = [
  { name: 'Rainy Night', emoji: '🌧️', url: 'https://www.soundjay.com/nature/rain-01.mp3' },
  { name: 'Dungeon Depths', emoji: '🕳️', url: 'https://www.soundjay.com/free-music/iron-man-01.mp3' },
  { name: 'Tavern Brawl', emoji: '🍺', url: 'https://www.soundjay.com/human/fist-punch-01.mp3' },
  { name: 'Mystic Forest', emoji: '🌲', url: 'https://www.soundjay.com/nature/wind-01.mp3' },
  { name: 'Battle Drums', emoji: '⚔️', url: 'https://www.soundjay.com/misc/drum-01.mp3' },
  { name: 'Ocean Waves', emoji: '🌊', url: 'https://www.soundjay.com/nature/waves-01.mp3' },
];

export function Soundboard() {
  const [activeSound, setActiveSound] = useState<string | null>(null);

  const toggleSound = (sound: { name: string; url: string }) => {
    const action = activeSound === sound.name ? 'stop' : 'play';
    socket.emit('play_sound', { soundName: sound.name, url: sound.url, action });
    setActiveSound(action === 'play' ? sound.name : null);
  };

  return (
    <Card className="border-primary/20 bg-secondary/5">
      <CardHeader className="pb-2">
        <CardTitle className="font-display flex items-center gap-2 text-sm">
          <Music2 className="h-4 w-4 text-primary" />
          Soundboard
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2">
          {ATMOSPHERES.map(s => {
            const isActive = activeSound === s.name;
            return (
              <button
                key={s.name}
                onClick={() => toggleSound(s)}
                className={`p-2.5 text-[11px] font-bold rounded-lg border transition-all duration-300 flex items-center justify-center gap-1.5 ${
                  isActive
                    ? 'bg-gold text-background border-gold shadow-[0_0_12px_rgba(var(--gold),0.3)] scale-[1.02]'
                    : 'bg-secondary/20 text-muted-foreground border-border hover:border-primary/50 hover:text-foreground'
                }`}
              >
                {isActive
                  ? <Volume2 className="h-3 w-3 shrink-0" />
                  : <VolumeX className="h-3 w-3 shrink-0" />
                }
                <span className="truncate">{s.name}</span>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
