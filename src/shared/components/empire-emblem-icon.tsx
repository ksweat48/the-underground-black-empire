import type { ComponentType } from 'react';
import { EmpireEmblem } from '@/shared/components/empire-emblem';

interface EmpireEmblemIconProps {
  className?: string;
}

export const EmpireEmblemIcon: ComponentType<EmpireEmblemIconProps> = ({ className }) => (
  <EmpireEmblem variant="dark" className={className} />
);
