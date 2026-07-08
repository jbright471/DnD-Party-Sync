import { lazy, Suspense, useEffect } from "react";
import { Toaster } from "./components/ui/toaster";
import { Toaster as Sonner } from "./components/ui/sonner";
import { TooltipProvider } from "./components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { GameProvider, useGame } from "./context/GameContext";
import { Layout } from "./components/Layout";
import { toast } from "sonner";
import socket from "./socket";

const queryClient = new QueryClient();

const RulesAssistant = lazy(() =>
  import("./components/RulesAssistant").then(({ RulesAssistant }) => ({ default: RulesAssistant })),
);
const VoiceChat = lazy(() =>
  import("./components/VoiceChat").then(({ VoiceChat }) => ({ default: VoiceChat })),
);
const EffectStream = lazy(() =>
  import("./components/EffectStream").then(({ EffectStream }) => ({ default: EffectStream })),
);

const Index = lazy(() => import("./pages/Index"));
const CharacterCreate = lazy(() => import("./pages/CharacterCreate"));
const CharacterImport = lazy(() => import("./pages/CharacterImport"));
const CharacterSheet = lazy(() => import("./pages/CharacterSheet"));
const PartyLobby = lazy(() => import("./pages/PartyLobby"));
const EquipmentManager = lazy(() => import("./pages/EquipmentManager"));
const Compendium = lazy(() => import("./pages/Compendium"));
const DmDashboard = lazy(() => import("./pages/DmDashboard"));
const PartyNotesPage = lazy(() => import("./pages/PartyNotesPage"));
const SessionArchive = lazy(() => import("./pages/SessionArchive"));
const WorldMap = lazy(() => import("./pages/WorldMap"));
const AppGuidebook = lazy(() => import("./pages/AppGuidebook"));
const BattleMap = lazy(() => import("./pages/BattleMap"));
const CompanionPage = lazy(() => import("./pages/CompanionPage"));
const EncounterCastView = lazy(() => import("./pages/EncounterCastView"));
const NotFound = lazy(() => import("./pages/NotFound"));

function ConcentrationAlerts() {
  useEffect(() => {
    const onBroken = ({ characterName, spellName, roll, total, dc }: { characterName: string; spellName: string; roll: number; total: number; dc: number }) => {
      toast.error(`${characterName} lost concentration on ${spellName}!`, {
        description: `Rolled ${roll} → ${total} vs DC ${dc}`,
        duration: 8000,
      });
    };

    const onMaintained = ({ characterName, spellName, roll, total, dc }: { characterName: string; spellName: string; roll: number; total: number; dc: number }) => {
      toast.success(`${characterName} maintained concentration on ${spellName}`, {
        description: `Rolled ${roll} → ${total} vs DC ${dc}`,
        duration: 5000,
      });
    };

    const onCheckRequired = ({ characterId, spellName, dc }: { characterId: number; spellName: string; dc: number }) => {
      toast.warning(`Concentration check required — ${spellName} (DC ${dc})`, {
        description: 'DM: roll a d20 + CON modifier and resolve below.',
        duration: Infinity,
        action: {
          label: 'Pass',
          onClick: () => socket.emit('concentration_check_result', { characterId, spellName, passed: true, dc }),
        },
        cancel: {
          label: 'Fail',
          onClick: () => socket.emit('concentration_check_result', { characterId, spellName, passed: false, dc }),
        },
      });
    };

    socket.on('concentration_broken', onBroken);
    socket.on('concentration_maintained', onMaintained);
    socket.on('concentration_check_required', onCheckRequired);
    return () => {
      socket.off('concentration_broken', onBroken);
      socket.off('concentration_maintained', onMaintained);
      socket.off('concentration_check_required', onCheckRequired);
    };
  }, []);
  return null;
}

function SavingThrowAlerts() {
  useEffect(() => {
    const onPendingSave = ({ dc, ability, source, rollVisibility }: { dc: number; ability: string; source: string; rollVisibility?: string }) => {
      const hidden = rollVisibility === 'secret' || rollVisibility === 'super_secret';
      toast.warning(`${source} requests a DC ${dc} ${ability.toUpperCase()} saving throw!`, {
        description: hidden
          ? `Roll your ${ability.toUpperCase()} save — the result will be sealed for the DM.`
          : `Roll your ${ability.toUpperCase()} save — the result will auto-apply.`,
        duration: 30000,
      });
    };

    const onSaveResolved = ({ charName, ability, dc, roll, passed }: { charName: string; ability: string; dc: number; roll: number; passed: boolean }) => {
      if (passed) {
        toast.success(`${charName} passed the DC ${dc} ${ability.toUpperCase()} save! (rolled ${roll})`, { duration: 6000 });
      } else {
        toast.error(`${charName} failed the DC ${dc} ${ability.toUpperCase()} save! (rolled ${roll}) — effects applied.`, { duration: 8000 });
      }
    };

    const onSecretRollAck = ({ message, label }: { message?: string; label?: string }) => {
      toast.message(message || 'Fate sealed', {
        description: label ? `${label} result sent to the DM.` : 'The DM has the result.',
        duration: 4000,
      });
    };

    socket.on('pending_save_request', onPendingSave);
    socket.on('save_resolved', onSaveResolved);
    socket.on('secret_roll_ack', onSecretRollAck);
    return () => {
      socket.off('pending_save_request', onPendingSave);
      socket.off('save_resolved', onSaveResolved);
      socket.off('secret_roll_ack', onSecretRollAck);
    };
  }, []);
  return null;
}

function EffectConsentAlerts() {
  const { state } = useGame();

  useEffect(() => {
    const onIncomingPreview = ({ pendingId, actor, records }: { pendingId: string; actor: string; records: any[] }) => {
      const summary = records.map(r => `${r.targetName}: ${r.logMessage}`).join(' | ');

      toast.message(`Incoming Effect from ${actor}`, {
        id: pendingId,
        description: summary,
        duration: 60000,
        action: {
          label: 'Accept',
          onClick: () => socket.emit('resolve_pending_effect', { pendingId, action: 'accept' }),
        },
        cancel: {
          label: 'Reject',
          onClick: () => socket.emit('resolve_pending_effect', { pendingId, action: 'reject' }),
        },
      });
    };

    const onPreviewResolved = ({ pendingId, action }: { pendingId: string, action: string }) => {
      toast.dismiss(pendingId);
      if (action === 'reject') {
        toast.error('Effect was rejected.');
      }
    };

    const onPreviewExpired = ({ pendingId }: { pendingId: string }) => {
      toast.dismiss(pendingId);
      toast.error('Effect request expired.');
    };

    socket.on('incoming_effect_preview', onIncomingPreview);
    socket.on('effect_preview_resolved', onPreviewResolved);
    socket.on('effect_preview_expired', onPreviewExpired);

    return () => {
      socket.off('incoming_effect_preview', onIncomingPreview);
      socket.off('effect_preview_resolved', onPreviewResolved);
      socket.off('effect_preview_expired', onPreviewExpired);
    };
  }, [state.isDm]);
  return null;
}

function RouteLoading({ fullScreen = false }: { fullScreen?: boolean }) {
  const containerClassName = fullScreen
    ? "min-h-screen flex items-center justify-center bg-background"
    : "min-h-[320px] flex items-center justify-center";

  return (
    <div className={containerClassName}>
      <div className="text-center" role="status" aria-live="polite">
        <div className="mx-auto mb-3 h-10 w-10 rounded-full border border-primary/30 bg-primary/10 shadow-sm shadow-primary/10 animate-pulse" />
        <p className="font-display text-xs uppercase tracking-[0.25em] text-primary/70">Loading</p>
      </div>
    </div>
  );
}

function MainAppShell() {
  return (
    <>
      <Layout>
        <Suspense fallback={<RouteLoading />}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/character/new" element={<CharacterCreate />} />
            <Route path="/character/import" element={<CharacterImport />} />
            <Route path="/character/:id" element={<CharacterSheet />} />
            <Route path="/party" element={<PartyLobby />} />
            <Route path="/equipment" element={<EquipmentManager />} />
            <Route path="/compendium" element={<Compendium />} />
            <Route path="/dm" element={<DmDashboard />} />
            <Route path="/notes" element={<PartyNotesPage />} />
            <Route path="/archive" element={<SessionArchive />} />
            <Route path="/worldmap" element={<WorldMap />} />
            <Route path="/battlemap" element={<BattleMap />} />
            <Route path="/guide" element={<AppGuidebook />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </Layout>
      <Suspense fallback={null}>
        <RulesAssistant />
        <VoiceChat />
        <EffectStream />
      </Suspense>
    </>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <GameProvider>
        <Toaster />
        <Sonner />
        <ConcentrationAlerts />
        <SavingThrowAlerts />
        <EffectConsentAlerts />
        <BrowserRouter>
          <Suspense fallback={<RouteLoading fullScreen />}>
            <Routes>
              <Route path="/companion/:characterId" element={<CompanionPage />} />
              <Route path="/encounter/:id/cast" element={<EncounterCastView />} />
              <Route path="/*" element={<MainAppShell />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </GameProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
