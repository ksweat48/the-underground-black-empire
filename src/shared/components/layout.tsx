import { type ReactNode, useEffect, useState } from 'react';
import { Header } from './header';
import { EmpireBackground } from './empire-background';
import { HudTopBar, HudBottomBar } from './hud-navigation';
import { useAuth } from '@/domains/identity/auth-context';
import {
  fetchEmpireProgress,
  type EmpireProgressData,
} from '@/domains/founder-campaign/services';
import { getEmpireCivilizationLevel } from '@/config/progression-rules';

interface LayoutProps {
  children: ReactNode;
  fullWidth?: boolean;
  showTopBar?: boolean;
}

export function Layout({ children, fullWidth = false, showTopBar = false }: LayoutProps) {
  const { session } = useAuth();

  if (session) {
    return <EmpireLayout fullWidth={fullWidth} showTopBar={showTopBar}>{children}</EmpireLayout>;
  }

  return (
    <div className="relative min-h-screen flex flex-col">
      <EmpireBackground />
      <Header />
      <main className={`relative z-10 min-w-0 ${fullWidth ? 'flex-1' : 'flex-1 container-empire py-8'}`}>
        {children}
      </main>
    </div>
  );
}

function EmpireLayout({
  children,
  fullWidth,
  showTopBar,
}: {
  children: ReactNode;
  fullWidth: boolean;
  showTopBar: boolean;
}) {
  const [empire, setEmpire] = useState<EmpireProgressData>({
    tribe_city_count: 0,
    total_population: 0,
    total_cities: 0,
    total_states: 0,
  });
  useEffect(() => {
    fetchEmpireProgress()
      .then(setEmpire)
      .catch(() => {});
  }, []);

  const civLevel = getEmpireCivilizationLevel(
    empire.tribe_city_count,
    empire.total_population,
  );

  return (
    <div className="relative h-screen flex flex-col overflow-hidden">
      <EmpireBackground />
      {showTopBar && <HudTopBar empire={empire} civLevel={civLevel} />}
      <main
        className={`relative z-10 flex-1 min-w-0 empire-layout-main overflow-y-auto scrollbar-thin ${showTopBar ? '' : 'empire-layout-main--no-topbar'} ${fullWidth ? 'flex flex-col' : 'container-empire'}`}
      >
        {children}
      </main>
      <HudBottomBar />
    </div>
  );
}
