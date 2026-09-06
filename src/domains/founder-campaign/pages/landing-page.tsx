import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ArrowRight } from 'lucide-react';
import { APP_CONFIG } from '@/config/app';
import { landingCopy } from '@/config/landing-content';
import { cn } from '@/shared/cn';

const ONBOARDING_ROUTE = '/onboarding/city';
const AUTH_ROUTE = '/auth/sign-in';
const LOGO = '/the_underground_black_empire_logo.png';

type SnapSectionProps = {
  children: React.ReactNode;
  className?: string;
  id?: string;
};

function SnapSection({ children, className, id }: SnapSectionProps) {
  return (
    <section
      id={id}
      className={cn(
        'landing-snap-section relative flex min-h-[100svh] w-full snap-start snap-always flex-col items-center justify-center px-5 py-8 sm:px-8 lg:px-12',
        className,
      )}
    >
      {children}
    </section>
  );
}

function ScrollIndicator({ label = 'Scroll' }: { label?: string }) {
  return (
    <div className="landing-scroll-indicator absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 text-stone-400">
      <span className="text-[9px] font-semibold uppercase tracking-[0.20em] text-white">{label}</span>
      <div className="landing-scroll-circle">
        <ChevronDown className="h-4 w-4 animate-bounce-slow text-stone-600" />
      </div>
    </div>
  );
}

function LandingCTA({
  to,
  children,
  variant = 'primary',
  className,
}: {
  to: string;
  children: React.ReactNode;
  variant?: 'primary' | 'secondary';
  className?: string;
}) {
  if (variant === 'secondary') {
    return (
      <Link
        to={to}
        className={cn(
          'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-2xl border border-white/55 bg-white/20 px-6 py-3 font-display text-sm font-bold uppercase tracking-[0.12em] text-white shadow-[0_8px_24px_rgba(0,0,0,0.18)] backdrop-blur-md transition-all duration-200 hover:bg-white/30 hover:shadow-[0_12px_32px_rgba(0,0,0,0.24)] active:scale-[0.98]',
          className,
        )}
      >
        {children}
      </Link>
    );
  }
  return (
    <Link
      to={to}
      className={cn(
        'inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl border border-white/45 bg-black/25 px-8 py-3 font-display text-sm font-bold uppercase tracking-[0.12em] text-white shadow-[0_10px_28px_rgba(0,0,0,0.24)] backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:bg-black/35 hover:shadow-[0_14px_36px_rgba(0,0,0,0.30)] active:translate-y-0 active:scale-[0.98] sm:min-h-[52px]',
        className,
      )}
    >
      {children}
      <ArrowRight className="h-4 w-4" />
    </Link>
  );
}

function useInView<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.35 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, inView };
}

type ScreenContentProps = {
  eyebrow: string;
  headline?: string;
  body: string;
  showLogo?: boolean;
  cta: string;
  secondaryCta: string;
};

function ScreenContent({
  eyebrow,
  headline,
  body,
  showLogo,
  cta,
  secondaryCta,
}: ScreenContentProps) {
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <div
      ref={ref as React.RefObject<HTMLDivElement>}
      className={cn(
        'relative z-10 mx-auto flex w-full max-w-xl flex-col items-center px-6 text-center transition-all duration-700 ease-out sm:px-8',
        inView ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0',
      )}
    >
      {showLogo && (
        <div className="landing-glass-card landing-logo-card rounded-3xl px-5 py-4">
          <img
            src={LOGO}
            alt={APP_CONFIG.name}
            className="h-14 w-auto object-contain sm:h-16"
          />
        </div>
      )}

      <div className={cn('landing-glass-card landing-text-card rounded-3xl px-6 py-6 sm:px-10 sm:py-8', showLogo && 'mt-4')}>
        {eyebrow && (
          <p className="font-display text-[11px] font-semibold uppercase tracking-[0.24em] text-plum-600">
            {eyebrow}
          </p>
        )}

        {headline && (
          <h2 className="mt-2 font-display text-2xl font-bold leading-tight text-stone-900 sm:text-3xl lg:text-4xl">
            {headline}
          </h2>
        )}

        <p className="mt-3 max-w-lg text-sm leading-relaxed text-stone-700 sm:text-base">
          {body}
        </p>
      </div>

      <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <LandingCTA to={ONBOARDING_ROUTE}>{cta}</LandingCTA>
        <LandingCTA to={AUTH_ROUTE} variant="secondary">
          {secondaryCta}
        </LandingCTA>
      </div>
    </div>
  );
}

function Screen1() {
  const c = landingCopy.screen1;
  return (
    <SnapSection id="screen-1" className="px-0 py-0 overflow-hidden">
      <div className="landing-bg-wrapper screen-1-bg">
        <div className="screen-1-overlay" aria-hidden />
      </div>
      <ScreenContent
        eyebrow={c.eyebrow}
        headline={c.headline}
        body={c.body}
        showLogo
        cta={c.cta}
        secondaryCta={c.secondaryCta}
      />
      <ScrollIndicator />
    </SnapSection>
  );
}

function Screen2() {
  const c = landingCopy.screen2;
  return (
    <SnapSection id="screen-2" className="px-0 py-0 overflow-hidden">
      <div className="landing-bg-wrapper screen-2-bg" />
      <ScreenContent
        eyebrow={c.eyebrow}
        headline={c.headline}
        body={c.body}
        cta={c.cta}
        secondaryCta={c.secondaryCta}
      />
      <ScrollIndicator />
    </SnapSection>
  );
}

function Screen3() {
  const c = landingCopy.screen3;
  return (
    <SnapSection id="screen-3" className="px-0 py-0 overflow-hidden">
      <div className="landing-bg-wrapper screen-3-bg" />
      <ScreenContent
        eyebrow={c.eyebrow}
        headline={c.headline}
        body={c.body}
        cta={c.cta}
        secondaryCta={c.secondaryCta}
      />
      <ScrollIndicator />
    </SnapSection>
  );
}

function Screen4() {
  const c = landingCopy.screen4;
  return (
    <SnapSection id="screen-4" className="px-0 py-0 overflow-hidden">
      <div className="landing-bg-wrapper screen-4-bg" />
      <ScreenContent
        eyebrow={c.eyebrow}
        headline={c.headline}
        body={c.body}
        cta={c.cta}
        secondaryCta={c.secondaryCta}
      />
    </SnapSection>
  );
}

export function LandingPage() {
  return (
    <main className="landing-snap-container h-[100svh] w-full overflow-y-auto bg-white text-stone-900">
      <div className="landing-ambient" aria-hidden />
      <div className="landing-grain" aria-hidden />
      <Screen1 />
      <Screen2 />
      <Screen3 />
      <Screen4 />
    </main>
  );
}

export default LandingPage;
