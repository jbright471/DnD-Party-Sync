import { useEffect } from "react";
import { Toaster } from "./components/ui/toaster";
import { Toaster as Sonner } from "./components/ui/sonner";
import { TooltipProvider } from "./components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { GameProvider } from "./context/GameContext";
import { Layout } from "./components/Layout";
import { RulesAssistant } from "./components/RulesAssistant";
import { VoiceChat } from "./components/VoiceChat";
import { EffectStream } from "./components/EffectStream";
import { toast } from "sonner";
import socket from "./socket";
import Index from "./pages/Index";
import CharacterCreate from "./pages/CharacterCreate";
import CharacterImport from "./pages/CharacterImport";
import CharacterSheet from "./pages/CharacterSheet";
import PartyLobby from "./pages/PartyLobby";
import EquipmentManager from "./pages/EquipmentManager";
import Compendium from "./pages/Compendium";
import DmDashboard from "./pages/DmDashboard";
import PartyNotesPage from "./pages/PartyNotesPage";
import SessionArchive from "./pages/SessionArchive";
import WorldMap from "./pages/WorldMap";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

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

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <GameProvider>
        <Toaster />
        <Sonner />
        <ConcentrationAlerts />
        <BrowserRouter>
          <Layout>
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
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Layout>
          <RulesAssistant />
          <VoiceChat />
          <EffectStream />
        </BrowserRouter>
      </GameProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
