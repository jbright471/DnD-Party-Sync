import { PartyNotes } from '../components/PartyNotes';
import { ClipboardList } from 'lucide-react';

export default function PartyNotesPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-4 pb-6">
      <div className="flex items-center gap-3">
        <ClipboardList className="h-7 w-7 text-primary" />
        <h1 className="text-3xl font-display tracking-wider">Party Notes</h1>
        <p className="text-muted-foreground text-sm ml-2">Collaborative notes — synced across all devices</p>
      </div>
      <div className="h-[calc(100vh-12rem)]">
        <PartyNotes />
      </div>
    </div>
  );
}
