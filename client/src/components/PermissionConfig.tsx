import { Shield } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { useGame, ResourcePermissions } from '../context/GameContext';
import socket from '../socket';

const PERMISSION_OPTIONS = [
  { value: 'open', label: 'Open', desc: 'Anyone can act freely' },
  { value: 'dm_approval', label: 'DM Approval', desc: 'Requires DM approval' },
  { value: 'owner_only', label: 'Owner Only', desc: 'Only the owner can act' },
] as const;

const PERMISSION_FIELDS: { key: keyof ResourcePermissions; label: string; options: readonly string[] }[] = [
  { key: 'loot_claim', label: 'Loot Claims', options: ['open', 'dm_approval', 'owner_only'] },
  { key: 'cross_player_effects', label: 'Cross-Player Effects', options: ['open', 'dm_approval'] },
  { key: 'inventory_transfer', label: 'Inventory Transfer', options: ['open', 'dm_approval'] },
];

export function PermissionConfig() {
  const { state } = useGame();
  const { permissions } = state;

  const handleChange = (key: keyof ResourcePermissions, value: string) => {
    socket.emit('update_permissions', { permissions: { ...permissions, [key]: value } });
  };

  return (
    <Card className="border-primary/20 bg-secondary/5">
      <CardHeader className="pb-2">
        <CardTitle className="font-display flex items-center gap-2 text-sm">
          <Shield className="h-4 w-4 text-primary" />
          Resource Permissions
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {PERMISSION_FIELDS.map(field => (
          <div key={field.key} className="space-y-1">
            <label className="text-[11px] font-semibold text-foreground/70">{field.label}</label>
            <div className="flex gap-1.5">
              {field.options.map(opt => {
                const meta = PERMISSION_OPTIONS.find(o => o.value === opt)!;
                const isActive = permissions[field.key] === opt;
                return (
                  <button
                    key={opt}
                    onClick={() => handleChange(field.key, opt)}
                    title={meta.desc}
                    className={`flex-1 text-[9px] font-semibold py-1.5 px-2 rounded border transition-all
                      ${isActive
                        ? 'bg-primary/20 border-primary/40 text-primary ring-1 ring-primary/30'
                        : 'bg-secondary/20 border-border/40 text-muted-foreground hover:text-foreground hover:border-border'
                      }`}
                  >
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        <p className="text-[9px] text-muted-foreground/50 italic">
          DM actions always bypass permissions.
        </p>
      </CardContent>
    </Card>
  );
}
