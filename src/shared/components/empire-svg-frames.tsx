import { type CSSProperties } from 'react';

/* =========================================================================
   EMPIRE SVG FRAME ASSETS — Simplified
   All ornamental SVG border overlays have been removed in favor of
   clean CSS borders and shadows. These components are kept as no-op
   stubs so existing imports don't break. They render nothing.
   ========================================================================= */

type SvgProps = {
  className?: string;
  style?: CSSProperties;
};

function NoopSvg({ className: _className, style: _style }: SvgProps) {
  return null;
}

export const CommandFrameSvg = NoopSvg;
export const IntelFrameSvg = NoopSvg;
export const LevelRibbonSvg = NoopSvg;
export const ProgressFrameSvg = NoopSvg;
export const CornerOrnamentSvg = NoopSvg;
export const DividerSvg = NoopSvg;
export const IconMedallionSvg = NoopSvg;
export const StatModuleFrameSvg = NoopSvg;
export const NavBarFrameSvg = NoopSvg;
export const CommandBarFrameSvg = NoopSvg;
export const PortraitMedallionSvg = NoopSvg;
