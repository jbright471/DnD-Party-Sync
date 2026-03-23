import { useGame } from '../context/GameContext';
import { CharacterCard } from '../components/CharacterCard';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { UserPlus, Users, Package, Swords, Scroll, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Index = () => {
  const { state } = useGame();
  const navigate = useNavigate();

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Hero */}
      <div className="relative text-center space-y-4 py-10 px-6 rounded-xl overflow-hidden border border-primary/10 bg-gradient-to-b from-card/80 to-background/0 animate-fade-in">
        {/* Decorative background glow */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,hsl(45_80%_55%/0.06),transparent_70%)] pointer-events-none" />
        <div className="relative flex justify-center">
          <div className="p-3 rounded-full border border-primary/20 bg-primary/5">
            <Swords className="h-12 w-12 text-primary animate-pulse-glow" />
          </div>
        </div>
        <div className="relative space-y-2">
          <h1 className="text-4xl md:text-5xl font-display font-bold tracking-wider text-foreground">
            Arcane Ally
          </h1>
          <div className="h-px w-24 mx-auto bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
          <p className="text-base text-muted-foreground max-w-md mx-auto leading-relaxed">
            Real-time party sync for D&amp;D 5e. Track HP, spells, conditions, and combat — all at the table.
          </p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            icon: UserPlus, color: 'text-primary', label: 'New Character',
            desc: 'Build a hero from scratch', route: '/character/new',
          },
          {
            icon: Users, color: 'text-health', label: 'Party Lobby',
            desc: 'View and manage the party', route: '/party',
          },
          {
            icon: Package, color: 'text-mana', label: 'Equipment',
            desc: 'Gear, weapons & magic items', route: '/equipment',
          },
          {
            icon: Sparkles, color: 'text-gold', label: 'Compendium',
            desc: 'Spells, rules & references', route: '/compendium',
          },
        ].map(({ icon: Icon, color, label, desc, route }) => (
          <Card
            key={label}
            className="cursor-pointer hover:border-primary/60 hover:-translate-y-0.5 transition-all duration-200 group"
            onClick={() => navigate(route)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(route); } }}
          >
            <CardContent className="p-6 text-center space-y-1">
              <Icon className={`h-8 w-8 mx-auto mb-3 ${color} group-hover:scale-110 transition-transform duration-200`} />
              <h3 className="font-display text-sm tracking-wider">{label}</h3>
              <p className="text-[11px] text-muted-foreground leading-snug">{desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Characters */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-display tracking-wider flex items-center gap-2">
            <Scroll className="h-5 w-5 text-primary" />
            Your Characters
          </h2>
          <Button variant="outline" size="sm" onClick={() => navigate('/character/new')}>
            <UserPlus className="h-4 w-4 mr-1" /> Create
          </Button>
        </div>

        {state.characters.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              <p className="text-lg mb-2">No characters yet</p>
              <p className="text-sm">Create your first character to begin your adventure.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {state.characters.map(c => (
              <CharacterCard key={c.id} character={c} />
            ))}
          </div>
        )}
      </div>

      {/* Party Status */}
      {state.party && (
        <div>
          <h2 className="text-2xl font-display tracking-wider flex items-center gap-2 mb-4">
            <Users className="h-5 w-5 text-health" />
            Active Party — {state.party.name}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {state.party.members.map(m => (
              <CharacterCard key={m.id} character={m} compact />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Index;
