import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ArrowRight, Users, Heart, Sparkles } from 'lucide-react';
import { APP_CONFIG } from '@/config/app';
import { landingCopy, landingImages } from '@/config/landing-content';
import { cn } from '@/shared/cn';

const ONBOARDING_ROUTE = '/onboarding/city';
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
    <div className="landing-scroll-indicator absolute bottom-5 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 text-stone-400">
      <span className="text-[9px] font-semibold uppercase tracking-[0.20em]">{label}</span>
      <ChevronDown className="h-4 w-4 animate-bounce-slow" />
    </div>
  );
}

function HeroImage({
  src,
  alt,
  label,
  fit = 'cover',
  className,
}: {
  src: string;
  alt: string;
  label?: string;
  fit?: 'cover' | 'natural';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'landing-hero-image group relative overflow-hidden',
        fit === 'natural' && 'flex justify-center',
        className,
      )}
    >
      <img
        src={src}
        alt={alt}
        className={cn(
          'transition-transform duration-700 ease-out group-hover:scale-[1.02]',
          fit === 'natural'
            ? 'h-auto max-h-[34svh] w-auto max-w-full object-contain'
            : 'h-full w-full object-cover',
        )}
      />
      {label && (
        <span className="absolute left-3 top-3 rounded-md bg-white/80 px-2 py-1 font-mono text-[9px] font-medium uppercase tracking-wider text-stone-500 backdrop-blur-sm">
          {label}
        </span>
      )}
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
        'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-black px-6 py-3 font-display text-sm font-bold uppercase tracking-[0.12em] text-white shadow-md transition-all duration-200 hover:bg-neutral-800 active:scale-[0.98]',
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
    <SnapSection id="screen-1">
      <div
        ref={ref as React.RefObject<HTMLDivElement>}
        className={cn(
          'flex w-full max-w-2xl flex-col items-center text-center transition-all duration-700 ease-out',
          inView ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0',
        )}
      >
        <img
          src={LOGO}
          alt={APP_CONFIG.name}
          className="mb-5 h-16 w-auto object-contain sm:h-20"
        />

        <HeroImage
          src={landingImages.screen1Hero}
          alt="Community members building together"
          fit="natural"
          className="mb-5 w-full rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.08)]"
        />

        <h1 className="font-display text-xl font-bold leading-tight text-stone-900 sm:text-2xl lg:text-3xl">
          {c.headline}
        </h1>

        <p className="mt-3 max-w-md text-sm leading-relaxed text-stone-600">
          {c.body}
        </p>

        <div className="mt-4 flex items-center gap-2 text-stone-700">
          <Sparkles className="h-4 w-4 text-plum-500" />
          <p className="font-display text-sm font-semibold tracking-wide">
            {c.voice}
          </p>
        </div>

        <LandingCTA to={ONBOARDING_ROUTE} className="mt-5">
          {c.cta}
        </LandingCTA>

        <p className="mt-3 text-[11px] font-medium uppercase tracking-[0.14em] text-stone-400">
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
    <SnapSection id="screen-2" className="bg-stone-50/50">
      <div
        ref={ref as React.RefObject<HTMLDivElement>}
        className={cn(
          'flex w-full max-w-2xl flex-col items-center text-center transition-all duration-700 ease-out',
          inView ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0',
        )}
      >
        <p className="font-display text-[11px] font-semibold uppercase tracking-[0.24em] text-plum-600">
          {c.eyebrow}
        </p>

        <h2 className="mt-2 font-display text-xl font-bold leading-tight text-stone-900 sm:text-2xl lg:text-3xl">
          {c.headline}
        </h2>

        <p className="mt-2 max-w-md text-sm leading-relaxed text-stone-600">
          {c.subtext}
        </p>

        <div className="mt-5 grid w-full grid-cols-2 gap-3 lg:grid-cols-4">
          {c.categories.map((cat, i) => (
            <div key={cat.label} className="flex flex-col gap-1.5">
              <HeroImage
                src={cat.image}
                alt={cat.label}
                label={`SCREEN_2_REALITY_IMAGE_${i + 1}`}
                className="h-24 w-full rounded-xl shadow-sm sm:h-28"
              />
              <p className="font-display text-[11px] font-bold uppercase tracking-[0.08em] text-stone-800">
                {cat.label}
              </p>
              <div className="h-px w-8 bg-plum-400/50" />
            </div>
          ))}
        </div>

        <div className="mt-5">
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
    <SnapSection id="screen-3">
      <div
        ref={ref as React.RefObject<HTMLDivElement>}
        className={cn(
          'flex w-full max-w-2xl flex-col items-center text-center transition-all duration-700 ease-out lg:max-w-4xl',
          inView ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0',
        )}
      >
        <p className="font-display text-[11px] font-semibold uppercase tracking-[0.24em] text-plum-600">
          {c.eyebrow}
        </p>

        <h2 className="mt-2 font-display text-xl font-bold leading-tight text-stone-900 sm:text-2xl lg:text-3xl">
          {c.headline}
        </h2>

        <p className="mt-2 max-w-md text-sm leading-relaxed text-stone-600">
          {c.subtext}
        </p>

        <HeroImage
          src={landingImages.screen3Community}
          alt="Community members organizing together"
          label="SCREEN_3_COMMUNITY_IMAGE"
          className="mt-5 h-[22svh] w-full rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.08)]"
        />

        <div className="mt-4 grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
          <ActionCard
            label={c.cards[0].label}
            body={c.cards[0].body}
            accent="plum"
            icon={Users}
          />
          <ActionCard
            label={c.cards[1].label}
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
    <SnapSection id="screen-4">
      <div
        ref={ref as React.RefObject<HTMLDivElement>}
        className={cn(
          'flex w-full max-w-2xl flex-col items-center text-center transition-all duration-700 ease-out',
          inView ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0',
        )}
      >
        <p className="font-display text-[11px] font-semibold uppercase tracking-[0.24em] text-plum-600">
          {c.eyebrow}
        </p>

        <h2 className="mt-4 font-display text-2xl font-bold leading-tight text-stone-900 sm:text-3xl lg:text-4xl">
          {c.headline[0]}
          <br />
          {c.headline[1]}
          <br />
          <span className="text-plum-600">{c.headline[2]}</span>
        </h2>

        <p className="mt-4 text-sm font-medium text-stone-700">{c.line1}</p>
        <p className="mt-1 text-sm text-stone-600">{c.line2}</p>
        <p className="mt-2 text-[11px] font-medium uppercase tracking-[0.14em] text-stone-400">
          {c.support}
        </p>

        <div className="mt-5 flex flex-col items-center gap-3 sm:flex-row">
          <LandingCTA to={ONBOARDING_ROUTE}>{c.primaryCta}</LandingCTA>
          <LandingCTA to={ONBOARDING_ROUTE} variant="secondary">
            {c.secondaryCta}
          </LandingCTA>
        </div>

        <HeroImage
          src={landingImages.screen4Join}
          alt="Community moving toward a city skyline"
          label="SCREEN_4_JOIN_IMAGE"
          className="mt-6 h-[18svh] w-full rounded-t-2xl shadow-[0_12px_40px_rgba(0,0,0,0.08)]"
        />
      </div>
    </SnapSection>
  );
}

export function LandingPage() {
  return (
    <main className="landing-snap-container h-[100svh] w-full overflow-y-auto bg-white text-stone-900">
      <Screen1 />
      <Screen2 />
      <Screen3 />
      <Screen4 />
    </main>
  );
}

export default LandingPage;
