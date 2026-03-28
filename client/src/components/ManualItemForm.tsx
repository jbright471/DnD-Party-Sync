/**
 * ManualItemForm — comprehensive D&D item creation form
 *
 * Produces either:
 *  - A WeaponAttack (saved to data_json.attacks via POST /api/characters/:id/weapons)
 *  - A homebrew inventory item (saved via POST /api/homebrew + /api/homebrew/assign)
 *
 * Sections are conditionally shown based on the selected item category.
 */

import { useState } from 'react';
import { Swords, Shield, Sparkles, ChevronDown, ChevronUp, Plus, X, Check, Gem } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Switch } from './ui/switch';
import { Badge } from './ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { toast } from 'sonner';
import socket from '../socket';
import {
  ManualItemFormData,
  MANUAL_ITEM_DEFAULTS,
  ITEM_CATEGORIES,
  ITEM_RARITIES,
  WEAPON_PROPERTIES,
  WEAPON_MASTERIES,
  WeaponAttack,
  WeaponProperty,
  DieType,
  DamageType,
} from '../types/character';

const DAMAGE_TYPES: DamageType[] = [
  'Slashing', 'Piercing', 'Bludgeoning',
  'Fire', 'Cold', 'Lightning', 'Thunder',
  'Acid', 'Poison', 'Necrotic', 'Radiant',
  'Psychic', 'Force',
];

const DIE_TYPES: DieType[] = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'];

const ARMOR_CATEGORIES = ['Light', 'Medium', 'Heavy', 'Shield'] as const;

const RARITY_COLORS: Record<string, string> = {
  Common:    'text-foreground/60',
  Uncommon:  'text-green-400',
  Rare:      'text-blue-400',
  'Very Rare': 'text-purple-400',
  Legendary: 'text-amber-400',
  Artifact:  'text-red-400',
};

// ── Accordion section wrapper ─────────────────────────────────────────────────

function Section({
  title,
  icon,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border/40 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-4 py-3 text-sm font-semibold font-display hover:bg-secondary/20 transition-colors text-left"
      >
        <span className="text-primary/70">{icon}</span>
        {title}
        <span className="ml-auto text-muted-foreground/50">
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 space-y-3 border-t border-border/30 bg-secondary/5">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Property multi-select chip grid ──────────────────────────────────────────

function PropertyChips({
  selected,
  onChange,
}: {
  selected: WeaponProperty[];
  onChange: (val: WeaponProperty[]) => void;
}) {
  const toggle = (prop: WeaponProperty) => {
    onChange(
      selected.includes(prop)
        ? selected.filter(p => p !== prop)
        : [...selected, prop]
    );
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      {WEAPON_PROPERTIES.map(prop => {
        const active = selected.includes(prop);
        return (
          <button
            key={prop}
            type="button"
            onClick={() => toggle(prop)}
            className={`px-2.5 py-1 rounded-full border text-xs font-semibold transition-all ${
              active
                ? 'bg-primary/20 border-primary text-primary'
                : 'border-border/50 text-muted-foreground hover:border-primary/40 hover:text-foreground'
            }`}
          >
            {active && <Check className="inline h-2.5 w-2.5 mr-1" />}
            {prop}
          </button>
        );
      })}
    </div>
  );
}

// ── Row helpers ───────────────────────────────────────────────────────────────

function FieldRow({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
      {hint && <p className="text-[10px] text-muted-foreground/50 italic">{hint}</p>}
    </div>
  );
}

function TwoCol({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>;
}

function ThreeCol({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-3 gap-3">{children}</div>;
}

// ── Attack bonus preview ──────────────────────────────────────────────────────

function AttackBonusPreview({ form, computedBonus }: { form: ManualItemFormData; computedBonus: number }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded border border-primary/20 bg-primary/5 text-xs">
      <span className="text-muted-foreground">
        {form.isProficient ? `${form.proficiencyBonus >= 0 ? '+' : ''}${form.proficiencyBonus} prof` : 'no prof'}
        {' + '}
        {form.abilityMod >= 0 ? '+' : ''}{form.abilityMod} mod
        {form.magicBonus !== 0 ? ` + ${form.magicBonus >= 0 ? '+' : ''}${form.magicBonus} magic` : ''}
      </span>
      <span className="font-bold text-primary ml-auto">
        = {computedBonus >= 0 ? '+' : ''}{computedBonus} to hit
      </span>
    </div>
  );
}

// ── Main Form ─────────────────────────────────────────────────────────────────

interface ManualItemFormProps {
  characterId?: string;
  characterName?: string;
  onSaved?: () => void;
  /** Pre-fill the form with AI-parsed values. Change the parent `key` to reset. */
  initialValues?: Partial<ManualItemFormData>;
  /** When provided, submit drops the item into the shared loot pool instead of assigning to a character. */
  onPoolDrop?: (data: ManualItemFormData) => void;
}

export function ManualItemForm({ characterId, characterName, onSaved, initialValues, onPoolDrop }: ManualItemFormProps) {
  const [form, setForm] = useState<ManualItemFormData>({ ...MANUAL_ITEM_DEFAULTS, ...initialValues });
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof ManualItemFormData>(key: K, value: ManualItemFormData[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const isWeapon = form.category === 'Weapon';
  const isArmor  = form.category === 'Armor';
  const isMagic  = form.category === 'Magic Item' || form.requiresAttunement;

  const computedAttackBonus = (form.isProficient ? form.proficiencyBonus : 0) + form.abilityMod + form.magicBonus;
  const finalAttackBonus = form.attackBonusOverride !== null ? form.attackBonusOverride : computedAttackBonus;

  // Build the notes string from properties + mastery
  const buildNotes = () => {
    const parts: string[] = [];
    if (form.attackType) parts.push(form.attackType);
    parts.push(...form.properties);
    if (form.mastery) parts.push(`${form.mastery} (Mastery)`);
    return parts.join(' · ');
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Item name is required.');
      return;
    }

    // Pool-drop mode: hand data back to caller, skip API save
    if (onPoolDrop) {
      onPoolDrop(form);
      setForm({ ...MANUAL_ITEM_DEFAULTS });
      return;
    }

    setSaving(true);
    try {
      if (isWeapon) {
        // Build WeaponAttack payload aligned with WeaponRow expectations
        const weapon: WeaponAttack = {
          id: `manual-${Date.now()}`,
          name: form.name.trim(),
          attackBonus: finalAttackBonus,
          damageDice: form.damageDice,
          damageCount: form.damageCount,
          damageBonus: form.damageBonus,
          damageType: form.damageType,
          range: form.range || (form.attackType === 'Melee' ? '5 ft reach' : ''),
          notes: buildNotes() || undefined,
          isMelee: form.attackType === 'Melee',
        };

        const res = await fetch(`/api/characters/${characterId}/weapons`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(weapon),
        });
        if (!res.ok) throw new Error('Failed to save weapon');

        socket.emit('refresh_party');
        toast.success(`${weapon.name} added to ${characterName}'s Actions tab.`, {
          description: `${finalAttackBonus >= 0 ? '+' : ''}${finalAttackBonus} to hit · ${weapon.damageCount}${weapon.damageDice}${weapon.damageBonus > 0 ? '+' + weapon.damageBonus : weapon.damageBonus < 0 ? weapon.damageBonus : ''} ${weapon.damageType}`,
        });
      } else {
        // Non-weapon: save as homebrew inventory item
        const stats: Record<string, unknown> = {
          category: form.category,
          rarity: form.rarity,
          requiresAttunement: form.requiresAttunement,
          attunementNote: form.attunementNote,
          weight: form.weight,
          cost: form.cost,
        };
        if (isArmor) {
          stats.armorCategory = form.armorCategory;
          stats.baseAc = form.baseAc;
          stats.plusBonus = form.plusBonus;
          stats.maxDexMod = form.maxDexMod;
          stats.stealthDisadvantage = form.stealthDisadvantage;
          stats.strengthRequirement = form.strengthRequirement;
        }
        if (isMagic) {
          stats.charges = form.charges;
          stats.rechargeOn = form.rechargeOn;
        }

        const createRes = await fetch('/api/homebrew', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            entity_type: 'item',
            name: form.name.trim(),
            description: form.description,
            stats_json: stats,
          }),
        });
        if (!createRes.ok) throw new Error('Failed to create item');
        const entity = await createRes.json();

        const assignRes = await fetch('/api/homebrew/assign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ characterId: parseInt(characterId), entityId: entity.id }),
        });
        if (!assignRes.ok) throw new Error('Failed to assign item');

        socket.emit('refresh_party');
        toast.success(`${form.name} added to ${characterName}'s inventory.`);
      }

      setForm({ ...MANUAL_ITEM_DEFAULTS });
      onSaved();
    } catch (err) {
      toast.error('Failed to save item. Check the server.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* ── Section 1: Basic Info ── */}
      <Section title="Basic Info" icon={<Sparkles className="h-4 w-4" />} defaultOpen>
        <FieldRow label="Item Name">
          <Input
            value={form.name}
            onChange={e => set('name', e.target.value)}
            placeholder="e.g. +1 Longsword of Flames"
            className="bg-background/50"
          />
        </FieldRow>

        <TwoCol>
          <FieldRow label="Category">
            <Select value={form.category} onValueChange={v => set('category', v as typeof form.category)}>
              <SelectTrigger className="bg-background/50 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ITEM_CATEGORIES.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </FieldRow>

          <FieldRow label="Rarity">
            <Select value={form.rarity} onValueChange={v => set('rarity', v as typeof form.rarity)}>
              <SelectTrigger className="bg-background/50 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ITEM_RARITIES.map(r => (
                  <SelectItem key={r} value={r} className={`text-xs ${RARITY_COLORS[r] ?? ''}`}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldRow>
        </TwoCol>

        <TwoCol>
          <FieldRow label="Weight">
            <Input value={form.weight} onChange={e => set('weight', e.target.value)}
              placeholder="e.g. 3 lb" className="bg-background/50 h-8 text-xs" />
          </FieldRow>
          <FieldRow label="Cost">
            <Input value={form.cost} onChange={e => set('cost', e.target.value)}
              placeholder="e.g. 50 gp" className="bg-background/50 h-8 text-xs" />
          </FieldRow>
        </TwoCol>

        <div className="flex items-center gap-3">
          <Switch
            id="attunement"
            checked={form.requiresAttunement}
            onCheckedChange={v => set('requiresAttunement', v)}
          />
          <Label htmlFor="attunement" className="text-xs cursor-pointer">Requires Attunement</Label>
          {form.requiresAttunement && (
            <Input
              value={form.attunementNote}
              onChange={e => set('attunementNote', e.target.value)}
              placeholder="by a wizard…"
              className="bg-background/50 h-7 text-xs flex-1"
            />
          )}
        </div>

        <FieldRow label="Description / Flavor Text">
          <Textarea
            value={form.description}
            onChange={e => set('description', e.target.value)}
            placeholder="Describe the item's appearance, lore, and any special properties…"
            rows={3}
            className="bg-background/50 text-xs resize-none"
          />
        </FieldRow>
      </Section>

      {/* ── Section 2: Combat Stats (Weapon only) ── */}
      {isWeapon && (
        <Section title="Combat Stats" icon={<Swords className="h-4 w-4" />} defaultOpen>
          <TwoCol>
            <FieldRow label="Attack Type">
              <Select value={form.attackType} onValueChange={v => {
                set('attackType', v as 'Melee' | 'Ranged');
                if (v === 'Melee' && !form.range) set('range', '5 ft reach');
              }}>
                <SelectTrigger className="bg-background/50 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Melee" className="text-xs">Melee</SelectItem>
                  <SelectItem value="Ranged" className="text-xs">Ranged</SelectItem>
                </SelectContent>
              </Select>
            </FieldRow>
            <FieldRow label="Range">
              <Input value={form.range} onChange={e => set('range', e.target.value)}
                placeholder={form.attackType === 'Melee' ? '5 ft reach' : '80/320 ft'}
                className="bg-background/50 h-8 text-xs" />
            </FieldRow>
          </TwoCol>

          {/* Damage */}
          <ThreeCol>
            <FieldRow label="Dice Count">
              <Input type="number" min={1} max={20} value={form.damageCount}
                onChange={e => set('damageCount', parseInt(e.target.value) || 1)}
                className="bg-background/50 h-8 text-xs" />
            </FieldRow>
            <FieldRow label="Die Type">
              <Select value={form.damageDice} onValueChange={v => set('damageDice', v as DieType)}>
                <SelectTrigger className="bg-background/50 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DIE_TYPES.map(d => <SelectItem key={d} value={d} className="text-xs">{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </FieldRow>
            <FieldRow label="Flat Bonus">
              <Input type="number" value={form.damageBonus}
                onChange={e => set('damageBonus', parseInt(e.target.value) || 0)}
                className="bg-background/50 h-8 text-xs"
                placeholder="0" />
            </FieldRow>
          </ThreeCol>

          <FieldRow label="Damage Type">
            <Select value={form.damageType} onValueChange={v => set('damageType', v as DamageType)}>
              <SelectTrigger className="bg-background/50 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DAMAGE_TYPES.map(t => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </FieldRow>

          {/* Attack Bonus */}
          <div className="space-y-2 pt-1 border-t border-border/30">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Attack Bonus</Label>
            <div className="grid grid-cols-3 gap-3">
              <FieldRow label="Prof. Bonus">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={form.isProficient}
                    onCheckedChange={v => set('isProficient', v)}
                    className="scale-75"
                  />
                  <Input type="number" value={form.proficiencyBonus}
                    onChange={e => set('proficiencyBonus', parseInt(e.target.value) || 0)}
                    className="bg-background/50 h-8 text-xs" disabled={!form.isProficient} />
                </div>
              </FieldRow>
              <FieldRow label="Ability Mod">
                <Input type="number" value={form.abilityMod}
                  onChange={e => set('abilityMod', parseInt(e.target.value) || 0)}
                  className="bg-background/50 h-8 text-xs" />
              </FieldRow>
              <FieldRow label="Magic Bonus">
                <Input type="number" min={0} max={3} value={form.magicBonus}
                  onChange={e => set('magicBonus', parseInt(e.target.value) || 0)}
                  className="bg-background/50 h-8 text-xs" placeholder="+1, +2…" />
              </FieldRow>
            </div>
            <AttackBonusPreview form={form} computedBonus={computedAttackBonus} />
            <div className="flex items-center gap-2">
              <Switch
                checked={form.attackBonusOverride !== null}
                onCheckedChange={v => set('attackBonusOverride', v ? computedAttackBonus : null)}
                className="scale-75"
              />
              <Label className="text-[10px] text-muted-foreground cursor-pointer">
                Override total
              </Label>
              {form.attackBonusOverride !== null && (
                <Input type="number" value={form.attackBonusOverride}
                  onChange={e => set('attackBonusOverride', parseInt(e.target.value) || 0)}
                  className="bg-background/50 h-7 text-xs w-20" />
              )}
            </div>
          </div>
        </Section>
      )}

      {/* ── Section 3: Properties & Mastery (Weapon only) ── */}
      {isWeapon && (
        <Section title="Properties & Mastery" icon={<Badge className="h-3.5 w-3.5 bg-transparent p-0 text-primary/70"><X className="h-3 w-3" /></Badge>} defaultOpen>
          <FieldRow label="Weapon Properties">
            <PropertyChips selected={form.properties} onChange={v => set('properties', v)} />
          </FieldRow>

          <FieldRow
            label="Weapon Mastery (2024)"
            hint="Weapon Mastery is a 2024 D&D feature. Only characters with the Mastery feature can apply this."
          >
            <Select
              value={form.mastery || 'none'}
              onValueChange={v => set('mastery', (v === 'none' ? '' : v) as typeof form.mastery)}
            >
              <SelectTrigger className="bg-background/50 h-8 text-xs"><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                {WEAPON_MASTERIES.map(m => (
                  <SelectItem key={m.value || 'none'} value={m.value || 'none'} className="text-xs">
                    <span>{m.value || 'None'}</span>
                    {m.value && <span className="text-muted-foreground ml-2 text-[10px]">{m.description.split('—')[1]?.trim()}</span>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldRow>

          {form.mastery && (
            <div className="flex items-center gap-2 px-3 py-2 rounded border border-amber-800/30 bg-amber-950/20 text-[11px] text-amber-300">
              <Sparkles className="h-3 w-3 shrink-0" />
              {WEAPON_MASTERIES.find(m => m.value === form.mastery)?.description}
            </div>
          )}
        </Section>
      )}

      {/* ── Section 4: Armor Details (Armor only) ── */}
      {isArmor && (
        <Section title="Armor Details" icon={<Shield className="h-4 w-4" />} defaultOpen>
          <TwoCol>
            <FieldRow label="Armor Type">
              <Select value={form.armorCategory} onValueChange={v => set('armorCategory', v as typeof form.armorCategory)}>
                <SelectTrigger className="bg-background/50 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ARMOR_CATEGORIES.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </FieldRow>
            <FieldRow label="Base AC">
              <Input type="number" min={10} max={20} value={form.baseAc}
                onChange={e => set('baseAc', parseInt(e.target.value) || 10)}
                className="bg-background/50 h-8 text-xs" />
            </FieldRow>
          </TwoCol>

          <ThreeCol>
            <FieldRow label="Magic Bonus">
              <Select value={form.plusBonus.toString()} onValueChange={v => set('plusBonus', parseInt(v))}>
                <SelectTrigger className="bg-background/50 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[0, 1, 2, 3].map(n => <SelectItem key={n} value={n.toString()} className="text-xs">{n === 0 ? 'None' : `+${n}`}</SelectItem>)}
                </SelectContent>
              </Select>
            </FieldRow>
            <FieldRow label="Max Dex Mod" hint="Blank = no cap">
              <Input type="number" min={0} max={10}
                value={form.maxDexMod ?? ''}
                onChange={e => set('maxDexMod', e.target.value === '' ? null : parseInt(e.target.value))}
                placeholder="∞"
                className="bg-background/50 h-8 text-xs" />
            </FieldRow>
            <FieldRow label="Str. Req.">
              <Input type="number" min={0} max={20} value={form.strengthRequirement}
                onChange={e => set('strengthRequirement', parseInt(e.target.value) || 0)}
                className="bg-background/50 h-8 text-xs" placeholder="0" />
            </FieldRow>
          </ThreeCol>

          <div className="flex items-center gap-2">
            <Switch
              id="stealth"
              checked={form.stealthDisadvantage}
              onCheckedChange={v => set('stealthDisadvantage', v)}
            />
            <Label htmlFor="stealth" className="text-xs cursor-pointer text-muted-foreground">
              Stealth Disadvantage
            </Label>
          </div>

          {(form.baseAc > 0 || form.plusBonus > 0) && (
            <div className="flex items-center gap-2 px-3 py-2 rounded border border-mana/20 bg-mana/5 text-xs text-mana">
              <Shield className="h-3.5 w-3.5 shrink-0" />
              AC {form.baseAc}{form.plusBonus > 0 ? ` + ${form.plusBonus}` : ''}
              {form.armorCategory === 'Medium' && form.maxDexMod !== null ? ` + DEX (max ${form.maxDexMod})` : ''}
              {form.armorCategory === 'Light' ? ' + DEX (full)' : ''}
              {form.stealthDisadvantage && <span className="ml-2 text-amber-400">· Stealth Disadv.</span>}
            </div>
          )}
        </Section>
      )}

      {/* ── Section 5: Magic Item Properties ── */}
      {isMagic && (
        <Section title="Magic Properties" icon={<Sparkles className="h-4 w-4" />}>
          <TwoCol>
            <FieldRow label="Charges" hint="Leave blank if no charges">
              <Input type="number" min={0}
                value={form.charges ?? ''}
                onChange={e => set('charges', e.target.value === '' ? null : parseInt(e.target.value))}
                placeholder="e.g. 3"
                className="bg-background/50 h-8 text-xs" />
            </FieldRow>
            <FieldRow label="Recharge On">
              <Select
                value={form.rechargeOn || 'none'}
                onValueChange={v => set('rechargeOn', (v === 'none' ? '' : v) as typeof form.rechargeOn)}
              >
                <SelectTrigger className="bg-background/50 h-8 text-xs"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="text-xs">None / N/A</SelectItem>
                  <SelectItem value="Dawn" className="text-xs">Dawn</SelectItem>
                  <SelectItem value="Dusk" className="text-xs">Dusk</SelectItem>
                  <SelectItem value="Short Rest" className="text-xs">Short Rest</SelectItem>
                  <SelectItem value="Long Rest" className="text-xs">Long Rest</SelectItem>
                </SelectContent>
              </Select>
            </FieldRow>
          </TwoCol>
        </Section>
      )}

      {/* ── Preview & Save ── */}
      <div className="flex items-center gap-3 pt-1 border-t border-border/30">
        {/* Mini preview badge */}
        <div className="flex-1 min-w-0">
          {form.name && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs font-bold font-display ${RARITY_COLORS[form.rarity]}`}>
                {form.rarity !== 'Common' ? `[${form.rarity}] ` : ''}
              </span>
              <span className="text-xs truncate">{form.name}</span>
              {isWeapon && (
                <Badge variant="outline" className="text-[9px] text-primary border-primary/30">
                  {finalAttackBonus >= 0 ? '+' : ''}{finalAttackBonus} / {form.damageCount}{form.damageDice}{form.damageBonus > 0 ? `+${form.damageBonus}` : form.damageBonus < 0 ? form.damageBonus : ''} {form.damageType.slice(0, 5)}
                </Badge>
              )}
              {isArmor && (
                <Badge variant="outline" className="text-[9px] text-mana border-mana/30">
                  AC {form.baseAc}{form.plusBonus > 0 ? `+${form.plusBonus}` : ''}
                </Badge>
              )}
            </div>
          )}
        </div>

        <Button
          type="button"
          onClick={handleSave}
          disabled={saving || !form.name.trim()}
          className={`font-display shrink-0 ${onPoolDrop ? 'bg-gold text-primary-foreground hover:bg-gold/90' : ''}`}
        >
          {saving
            ? <><Sparkles className="h-4 w-4 mr-2 animate-spin" /> Forging…</>
            : onPoolDrop
              ? <><Gem className="h-4 w-4 mr-2" /> Drop to Pool</>
              : <><Plus className="h-4 w-4 mr-2" /> Add Item</>
          }
        </Button>
      </div>
    </div>
  );
}
