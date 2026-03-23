import { ReactNode } from 'react';
import { SidebarProvider, SidebarTrigger } from './ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { Swords, WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export function Layout({ children }: { children: ReactNode }) {
  const { isOnline } = useOnlineStatus();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-h-screen">
          <header className="h-14 flex items-center border-b border-border px-4 bg-card/60 backdrop-blur-sm sticky top-0 z-10 shadow-sm shadow-black/30">
            <SidebarTrigger className="mr-4" />
            <div className="flex items-center gap-2">
              <Swords className="h-5 w-5 text-primary animate-pulse-glow" />
              <span className="font-display text-sm font-semibold text-primary/80 tracking-widest uppercase">
                Arcane Ally
              </span>
            </div>

            {/* Offline indicator */}
            {!isOnline && (
              <div className="ml-auto flex items-center gap-1.5 mr-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500" />
                </span>
                <WifiOff className="h-3.5 w-3.5 text-orange-400" />
                <span className="text-[10px] text-orange-400 font-semibold uppercase tracking-wider">Offline</span>
              </div>
            )}

            {/* Decorative gold rule at the bottom of the header */}
            <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
          </header>
          <main className="flex-1 p-6 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
