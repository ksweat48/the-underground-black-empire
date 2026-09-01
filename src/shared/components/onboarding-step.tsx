import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';

interface OnboardingStepProps {
  step: number;
  totalSteps: number;
  title: string;
  subtitle?: string;
  children: ReactNode;
  onBack?: () => void;
}

export function OnboardingStep({ step, totalSteps, title, subtitle, children, onBack }: OnboardingStepProps) {
  const progress = (step / totalSteps) * 100;

  return (
    <div className="min-h-screen flex flex-col">
      <div className="h-1 bg-ink-800/50 w-full">
        <div
          className="h-full bg-gradient-to-r from-gold-500 to-gold-300 transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg">
          {onBack && (
            <button
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-sm text-ink-400 hover:text-gold-400 transition-colors mb-6"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
          )}
          <div className="text-center mb-8">
            <p className="text-sm font-medium text-gold-400 uppercase tracking-wider mb-2">
              Step {step} of {totalSteps}
            </p>
            <h1 className="text-3xl font-display font-bold text-ink-100 mb-2">{title}</h1>
            {subtitle && <p className="text-ink-400">{subtitle}</p>}
          </div>

          {children}
        </div>
      </div>
    </div>
  );
}

export default OnboardingStep;
