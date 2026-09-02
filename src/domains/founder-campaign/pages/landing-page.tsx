import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ArrowRight, Sparkles } from 'lucide-react';
import { APP_CONFIG } from '@/config/app';
import { landingCopy } from '@/config/landing-content';
import { cn } from '@/shared/cn';

const ONBOARDING_ROUTE = '/onboarding/city';
const AUTH_ROUTE = '/auth/sign-in';
const LOGO = '/the_underground_black_empire_logo.png';

function LogoDivider() {
  return (
    <div className="landing-logo-divider" aria-hidden>
      <div className="landing-logo-divider-line landing-logo-divider-line--plum" />
      <svg width="8" height="8" viewBox="0 0 8 8" className="shrink-0">
        <path d="M4 0L5 3L8 4L5 5L4 8L3 5L0 4L3 3Z" fill="#111111" />
      </svg>
      <div className="landing-logo-divider-line landing-logo-divider-line--emerald" />
    </div>
  );
}

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
          'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-2xl border-2 border-transparent bg-white px-6 py-3 font-display text-sm font-bold uppercase tracking-[0.12em] text-stone-900 shadow-sm transition-all duration-200 hover:shadow-md active:scale-[0.98]',
          className,
        )}
        style={{
          background:
            'linear-gradient(#fff, #fff) padding-box, linear-gradient(135deg, #6E1F55, #0F6B50) border-box',
        }}
      >
        {children}
      </Link>
    );
  }
  return (
    <Link
      to={to}
      className={cn(
        'inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-[#0A0A0A] px-8 py-3 font-display text-sm font-bold uppercase tracking-[0.12em] text-white shadow-[0_10px_24px_rgba(0,0,0,0.16),inset_0_1px_0_rgba(255,255,255,0.10)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_32px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.12)] active:translate-y-0 active:scale-[0.98] sm:min-h-[52px]',
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

function Screen1() {
  const { ref, inView } = useInView<HTMLElement>();
  const c = landingCopy.screen1;
  return (
    <SnapSection id="screen-1" className="screen-1-bg px-0 py-0">
      <div className="screen-1-overlay" aria-hidden />
      <div
        ref={ref as React.RefObject<HTMLDivElement>}
        className={cn(
          'absolute inset-x-0 top-0 z-10 mx-auto flex w-full max-w-2xl flex-col items-center px-6 text-center transition-all duration-700 ease-out sm:px-10',
          inView ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0',
        )}
        style={{ top: '9svh' }}
      >
        <img
          src={LOGO}
          alt={APP_CONFIG.name}
          className="h-20 w-auto object-contain sm:h-24"
        />

        <LogoDivider />

        <h1 className="mt-4 font-display text-[26px] font-bold leading-[1.05] text-stone-900 sm:text-[32px] lg:text-[36px]">
          {c.headline}
        </h1>

        <p className="mt-2 max-w-[500px] text-sm leading-[1.5] text-stone-700">
          {c.body}
        </p>

        <div className="landing-voice-pill mt-3.5">
          <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
          <p className="font-display text-[13px] font-semibold tracking-wide text-emerald-600">
            {c.voice}
          </p>
        </div>

        <LandingCTA to={ONBOARDING_ROUTE} className="mt-8">
          {c.cta}
        </LandingCTA>

        <p className="mt-4 text-[11px] font-medium uppercase tracking-[0.12em] text-stone-600">
          {c.support}
        </p>
      </div>

      <ScrollIndicator />
    </SnapSection>
  );
}

function Screen2() {
  const { ref, inView } = useInView<HTMLElement>();
  const c = landingCopy.screen2;
  return (
    <SnapSection id="screen-2" className="screen-2-bg px-0 py-0">
      <div className="screen-2-overlay" aria-hidden />
      <div
        ref={ref as React.RefObject<HTMLDivElement>}
        className={cn(
          'absolute inset-x-0 top-0 z-10 flex h-[70svh] w-full max-w-3xl flex-col items-center justify-start px-6 pt-[14svh] text-center transition-all duration-700 ease-out sm:px-10',
          inView ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0',
        )}
      >
        <p className="font-display text-[11px] font-semibold uppercase tracking-[0.24em] text-plum-600">
          {c.eyebrow}
        </p>

        <h2 className="mt-2 max-w-2xl font-display text-3xl font-bold leading-tight text-stone-900 sm:text-4xl lg:text-5xl">
          {c.headline}
        </h2>

        <p className="mt-3 max-w-2xl text-base leading-relaxed text-stone-600 sm:text-lg">
          {c.subtext}
        </p>

        <div className="mt-6">
          <p className="font-display text-xl font-bold text-stone-900 sm:text-2xl">
            {c.closing}
          </p>
          <p className="font-display text-xl font-bold text-plum-600 sm:text-2xl">
            {c.closingAccent}
          </p>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-stone-500 sm:text-base">
            {c.closingSub}
          </p>
        </div>
      </div>

      <ScrollIndicator />
    </SnapSection>
  );
}

function Screen3() {
  const { ref, inView } = useInView<HTMLElement>();
  const c = landingCopy.screen3;
  return (
    <SnapSection id="screen-3" className="screen-3-bg px-0 py-0">
      <div className="screen-3-overlay" aria-hidden />
      <div
        ref={ref as React.RefObject<HTMLDivElement>}
        className={cn(
          'absolute inset-x-0 top-0 z-10 flex h-[70svh] w-full max-w-3xl flex-col items-center justify-start px-6 pt-[14svh] text-center transition-all duration-700 ease-out sm:px-10',
          inView ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0',
        )}
      >
        <p className="font-display text-[11px] font-semibold uppercase tracking-[0.24em] text-plum-600">
          {c.eyebrow}
        </p>

        <h2 className="mt-2 max-w-2xl font-display text-3xl font-bold leading-tight text-stone-900 sm:text-4xl lg:text-5xl">
          {c.headline}
        </h2>

        <p className="mt-3 max-w-2xl text-base leading-relaxed text-stone-600 sm:text-lg">
          {c.subtext}
        </p>

        <p className="mt-4 max-w-xl font-display text-lg font-bold leading-relaxed text-emerald-600 sm:text-xl">
          {c.closing}
        </p>
      </div>

      <ScrollIndicator />
    </SnapSection>
  );
}

function Screen4() {
  const { ref, inView } = useInView<HTMLElement>();
  const c = landingCopy.screen4;
  return (
    <SnapSection id="screen-4" className="screen-4-bg px-0 py-0">
      <div className="screen-4-overlay" aria-hidden />
      <div
        ref={ref as React.RefObject<HTMLDivElement>}
        className={cn(
          'absolute inset-x-0 top-0 z-10 flex h-[70svh] w-full max-w-3xl flex-col items-center justify-start px-6 pt-[14svh] text-center transition-all duration-700 ease-out sm:px-10',
          inView ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0',
        )}
      >
        <p className="font-display text-[11px] font-semibold uppercase tracking-[0.24em] text-plum-600">
          {c.eyebrow}
        </p>

        <h2 className="mt-2 font-display text-2xl font-bold leading-tight text-stone-900 sm:text-3xl lg:text-4xl">
          {c.headline[0]}
          <br />
          <span className="text-plum-600">{c.headline[1]}</span>
        </h2>

        <p className="mt-3 text-sm font-medium text-stone-700">{c.line1}</p>
        <p className="mt-1 text-sm text-stone-600">{c.line2}</p>
        <p className="mt-2 text-[11px] font-medium uppercase tracking-[0.14em] text-stone-500">
          {c.support}
        </p>

        <div className="mt-4 flex flex-col items-center gap-3 sm:flex-row">
          <LandingCTA to={ONBOARDING_ROUTE}>{c.primaryCta}</LandingCTA>
          <LandingCTA to={AUTH_ROUTE} variant="secondary">
            {c.secondaryCta}
          </LandingCTA>
        </div>
      </div>
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
