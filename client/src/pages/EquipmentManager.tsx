import { useState } from 'react';
import { useGame } from '../context/GameContext';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Card, CardContent } from '../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Badge } from '../components/ui/badge';
import { Shield, Sparkles, Trash2, Swords, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import socket from '../socket';
import { ManualItemForm } from '../components/ManualItemForm';
import { QuickEquipParser } from '../components/QuickEquipParser';
import { WeaponAttack, ManualItemFormData } from '../types/character';

export default function EquipmentManager() {
  const { state } = useGame();

  const [characterId, setCharacterId] = useState('');
  const [activeTab, setActiveTab] = useState('quick');

  // Pre-filled values from AI parse — formKey forces ManualItemForm to remount
  const [parsedValues, setParsedValues] = useState<Partial<ManualItemFormData> | undefined>();
  const [formKey, setFormKey] = useState(0);

  // Weapon delete state
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const selectedChar = state.characters.find(c => c.id === characterId);
  const weapons: WeaponAttack[] = selectedChar?.attacks ?? [];

  const handleParsed = (values: Partial<ManualItemFormData>) => {
    setParsedValues(values);
    setFormKey(k => k + 1); // force ManualItemForm to remount with fresh state
    setActiveTab('create');
    toast.success('Item parsed — review and save below.', {
      description: values.name ? `"${values.name}" pre-filled in Create Item` : undefined,
    });
  };

  const handleDeleteWeapon = async (weaponId: string, weaponName: string) => {
    if (!characterId) return;
    setDeletingId(weaponId);
    try {
      const res = await fetch(`/api/characters/${characterId}/weapons/${weaponId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      socket.emit('refresh_party');
      toast.success(`'${weaponName}' removed`);
    } catch {
      toast.error('Failed to remove weapon');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-20">
      <div className="flex items-center gap-3">
        <Shield className="h-7 w-7 text-mana" />
        <h1 className="text-3xl font-display tracking-wider">Equipment Manager</h1>
      </div>

      {/* Shared character selector */}
      <div className="space-y-1">
        <Label className="text-xs uppercase tracking-widest">Adventurer</Label>
        <Select value={characterId} onValueChange={setCharacterId}>
          <SelectTrigger className="bg-secondary/20 max-w-xs">
            <SelectValue placeholder="Select character..." />
          </SelectTrigger>
          <SelectContent>
            {state.characters.map(c => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Weapon list for selected character */}
      {selectedChar && weapons.length > 0 && (
        <Card className="border-primary/20 bg-secondary/5">
          <CardContent className="pt-4 space-y-2">
            <p className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <Swords className="h-3.5 w-3.5 text-primary" />
              {selectedChar.name}'s Weapons
            </p>
            {weapons.map(w => (
              <div key={w.id} className="flex items-center justify-between rounded-md border border-primary/10 bg-secondary/10 px-3 py-2">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-medium text-sm truncate">{w.name}</span>
                  <Badge variant="outline" className="text-xs shrink-0">
                    {w.attackBonus >= 0 ? '+' : ''}{w.attackBonus} atk
                  </Badge>
                  <span className="text-xs text-foreground/60 shrink-0">
                    {w.damageCount}{w.damageDice}{w.damageBonus > 0 ? `+${w.damageBonus}` : w.damageBonus < 0 ? w.damageBonus : ''} {w.damageType}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive/60 hover:text-destructive hover:bg-destructive/10 shrink-0"
                  disabled={deletingId === w.id}
                  onClick={() => handleDeleteWeapon(w.id, w.name)}
                >
                  {deletingId === w.id
                    ? <Sparkles className="h-3 w-3 animate-spin" />
                    : <Trash2 className="h-3 w-3" />}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="quick" className="font-display">Quick Equip</TabsTrigger>
          <TabsTrigger value="create" className="font-display flex items-center gap-1.5">
            Create Item
            {parsedValues && (
              <CheckCircle2 className="h-3 w-3 text-green-400" />
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Tab 1: AI-Powered Quick Parser ── */}
        <TabsContent value="quick">
          {characterId ? (
            <QuickEquipParser onParsed={handleParsed} />
          ) : (
            <Card className="border-primary/20 bg-secondary/5">
              <CardContent className="py-10 text-center text-foreground/40 text-sm">
                Select a character above to begin.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Tab 2: Manual Form (also review target for AI parse) ── */}
        <TabsContent value="create">
          {characterId && selectedChar ? (
            <ManualItemForm
              key={formKey}
              characterId={characterId}
              characterName={selectedChar.name}
              initialValues={parsedValues}
              onSaved={() => {
                setParsedValues(undefined);
                setFormKey(k => k + 1);
              }}
            />
          ) : (
            <Card className="border-primary/20 bg-secondary/5">
              <CardContent className="py-10 text-center text-foreground/40 text-sm">
                Select a character above to create and assign items.
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
