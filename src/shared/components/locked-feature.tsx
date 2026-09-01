import { Link } from 'react-router-dom';
import { Lock, type LucideIcon } from 'lucide-react';

interface LockedFeatureCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

export function LockedFeatureCard({ icon: Icon, title, description }: LockedFeatureCardProps) {
  return (
    <div className="card card-hover p-6 opacity-60">
      <div className="flex items-center gap-3 mb-3">
        <div className="p-2.5 rounded-lg bg-ink-800/50 border border-ink-700/50">
          <Icon className="w-5 h-5 text-ink-300" />
        </div>
        <div className="flex items-center gap-2">
          <h3 className="font-display text-lg font-semibold text-ink-200">{title}</h3>
          <Lock className="w-4 h-4 text-ink-400" />
        </div>
      </div>
      <p className="text-sm text-ink-400 leading-relaxed">{description}</p>
    </div>
  );
}

export function LockedFeatureSection({
  title,
  description,
  items,
}: {
  title: string;
  description: string;
  items: LockedFeatureCardProps[];
}) {
  return (
    <section className="mt-16 container-empire">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-display font-bold text-ink-200 mb-2">{title}</h2>
        <p className="text-ink-400">{description}</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((item) => (
          <LockedFeatureCard key={item.title} {...item} />
        ))}
      </div>
    </section>
  );
}

export function CtaSection({
  title,
  description,
  buttonLabel,
  buttonLink,
}: {
  title: string;
  description: string;
  buttonLabel: string;
  buttonLink: string;
}) {
  return (
    <section className="mt-16">
      <div className="card p-8 md:p-12 text-center bg-gradient-to-b from-ink-800/40 to-ink-950/40">
        <h2 className="text-2xl md:text-3xl font-display font-bold text-gradient-gold mb-3">
          {title}
        </h2>
        <p className="text-ink-300 max-w-xl mx-auto mb-6">{description}</p>
        <Link to={buttonLink} className="btn-primary">
          {buttonLabel}
        </Link>
      </div>
    </section>
  );
}
