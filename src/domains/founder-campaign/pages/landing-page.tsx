import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ArrowRight, Users, Heart, Sparkles } from 'lucide-react';
import { APP_CONFIG } from '@/config/app';
import { landingCopy, landingImages } from '@/config/landing-content';
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
      <span className="text-[9px] font-semibold uppercase tracking-[0.20em]">{label}</span>
      <div className="landing-scroll-circle">
        <ChevronDown className="h-4 w-4 animate-bounce-slow text-stone-600" />
      </div>
    </div>
  );
}

function HeroImage({
  src,
  alt,
  fit = 'cover',
  className,
}: {
  src: string;
  alt: string;
  fit?: 'cover' | 'natural';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'landing-hero-image group relative overflow-hidden',
        fit === 'natural' && 'inline-flex justify-center',
        className,
      )}
    >
      <img
        src={src}
        alt={alt}
        className={cn(
          'transition-transform duration-700 ease-out group-hover:scale-[1.02]',
          fit === 'natural'
            ? 'h-auto max-h-[28svh] w-auto max-w-full object-contain'
            : 'h-full w-full object-cover',
        )}
      />

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
          'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-transparent bg-white px-6 py-3 font-display text-sm font-bold uppercase tracking-[0.12em] text-stone-900 shadow-sm transition-all duration-200 hover:shadow-md active:scale-[0.98]',
          className,
        )}
        style={{
          borderImage: 'linear-gradient(135deg, #6E1F55, #0F6B50) 1',
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

function ActionCard({
  label,
  body,
  accent,
  icon: Icon,
}: {
  label: string;
  body: string;
  accent: 'plum' | 'emerald';
  icon: typeof Users;
}) {
  const isPlum = accent === 'plum';
  return (
    <div className="frame-intel flex flex-col gap-1.5 p-4 transition-all duration-300 hover:shadow-md">
      <div
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-full border',
          isPlum
            ? 'border-plum-200/50 bg-plum-50 text-plum-600'
            : 'border-emerald-200/50 bg-emerald-50 text-emerald-600',
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <h3 className="font-display text-sm font-bold uppercase tracking-[0.08em] text-stone-900">
        {label}
      </h3>
      <p className="text-xs leading-relaxed text-stone-600">{body}</p>
      <div
        className={cn(
          'mt-0.5 h-px w-8',
          isPlum ? 'bg-plum-400/60' : 'bg-emerald-400/60',
        )}
      />
    </div>
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
        style={{ top: '4svh' }}
      >
        <img
          src={LOGO}
          alt={APP_CONFIG.name}
          className="h-12 w-auto object-contain sm:h-14"
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

        <LandingCTA to={ONBOARDING_ROUTE} className="mt-4">
          {c.cta}
        </LandingCTA>

        <p className="mt-2.5 text-[11px] font-medium uppercase tracking-[0.12em] text-stone-600">
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
    <SnapSection id="screen-2" className="bg-stone-50/50 pt-4 pb-24">
      <div
        ref={ref as React.RefObject<HTMLDivElement>}
        className={cn(
          'landing-hero-sheet flex w-full max-w-2xl flex-col items-center px-6 py-6 text-center transition-all duration-700 ease-out sm:px-10 sm:py-8',
          inView ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0',
        )}
      >
        <p className="font-display text-[11px] font-semibold uppercase tracking-[0.24em] text-plum-600">
          {c.eyebrow}
        </p>

        <h2 className="mt-1.5 font-display text-xl font-bold leading-tight text-stone-900 sm:text-2xl lg:text-3xl">
          {c.headline}
        </h2>

        <p className="mt-1.5 max-w-md text-sm leading-relaxed text-stone-600">
          {c.subtext}
        </p>

        <div className="mt-4 grid w-full grid-cols-2 gap-3 lg:grid-cols-4">
          {c.categories.map((cat, i) => (
            <div key={cat.label} className="flex flex-col gap-1.5">
              <div className="landing-image-glow w-full">
                <HeroImage
                  src={cat.image}
                  alt={cat.label}
                  className="h-24 w-full rounded-xl shadow-sm sm:h-28"
                />
              </div>
              <p className="font-display text-[11px] font-bold uppercase tracking-[0.08em] text-stone-800">
                {cat.label}
              </p>
              <div className="h-px w-8 bg-plum-400/50" />
            </div>
          ))}
        </div>

        <div className="mt-4">
          <p className="font-display text-base font-bold text-stone-900 sm:text-lg">
            {c.closing}
          </p>
          <p className="font-display text-base font-bold text-stone-900 sm:text-lg">
            {c.closingAccent}
          </p>
          <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-stone-500">
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
    <SnapSection id="screen-3" className="pt-4 pb-24">
      <div
        ref={ref as React.RefObject<HTMLDivElement>}
        className={cn(
          'landing-hero-sheet flex w-full max-w-2xl flex-col items-center px-6 py-6 text-center transition-all duration-700 ease-out sm:px-10 sm:py-8 lg:max-w-4xl',
          inView ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0',
        )}
      >
        <p className="font-display text-[11px] font-semibold uppercase tracking-[0.24em] text-plum-600">
          {c.eyebrow}
        </p>

        <h2 className="mt-1.5 font-display text-xl font-bold leading-tight text-stone-900 sm:text-2xl lg:text-3xl">
          {c.headline}
        </h2>

        <p className="mt-1.5 max-w-md text-sm leading-relaxed text-stone-600">
          {c.subtext}
        </p>

        <div className="landing-image-glow mt-4 w-full">
          <HeroImage
            src={landingImages.screen3Community}
            alt="Community members organizing together"
            className="h-[28svh] w-full rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.08)]"
          />
        </div>

        <div className="mt-3 grid w-full grid-cols-2 gap-3">
          <ActionCard
            body={c.cards[0].body}
            accent="plum"
            icon={Users}
          />
          <ActionCard
            body={c.cards[1].body}
            accent="emerald"
            icon={Heart}
          />
        </div>
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
          'relative z-10 flex w-full max-w-2xl flex-col items-center px-6 text-center transition-all duration-700 ease-out sm:px-10',
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
