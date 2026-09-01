---
name: empire-design-standard
description: Visual design standard for the Empire project — white-on-white with black, gray, plum, and emerald accents. Use whenever building, redesigning, or styling any page, card, modal, dashboard, onboarding screen, landing section, or shared component. Also use when reviewing or auditing existing screens for visual consistency.
---

# Empire Design Standard

The Empire uses a clean white-on-white aesthetic with black and gray as the foundation, plus small, intentional touches of plum purple and emerald green. Gold and warm beige tones are no longer part of the design language.

## Color System

### Surfaces
- Page background: pure white (`#FFFFFF`)
- Card backgrounds: white with a very subtle cool-gray gradient (`#FFFFFF` to `#FAFAFA`)
- Raised surfaces: white with soft neutral shadows and thin gray borders
- Never use cream, ivory, beige, tan, or warm off-white as a surface color

### Text
- Primary text: near-black (`#1A1815`) for headings and important content
- Secondary text: cool gray (`#6B655B`) for body and supporting copy
- Muted text: lighter gray (`#9A9388`) for labels, captions, and metadata
- Always ensure sufficient contrast against white surfaces

### Accent Colors
- **Plum purple** — use sparingly for selected states, featured actions, prestige surfaces, and branded highlights. The plum ramp runs from `#E8DCE8` (lightest) to `#140414` (darkest), with `#4A1F4A` as the default mid-tone.
- **Emerald green** — use sparingly for community, progress, success, and action-oriented areas. The emerald ramp runs from `#D0E8DC` (lightest) to `#1F4D3B` (darkest), with `#3D8A6B` as the default mid-tone.
- Both accents should support the design, not overpower it. A mostly monochrome interface with one or two accent moments is the goal.

### What to Avoid
- Gold, antique gold, bronze, copper, amber, and any warm metallic tones
- Cream, ivory, beige, tan, and warm off-white surfaces
- Warm brown or sepia text colors
- Decorative gold gradients, gold borders, or gold glow effects

## Component Conventions

### Cards
- Use the existing `.frame-command`, `.frame-intel`, and `.frame-utility` classes for white raised surfaces
- Borders: thin, low-opacity gray (`rgba(26,24,21,0.08)`)
- Shadows: soft, neutral, never warm-tinted
- Hover states: slightly stronger border and shadow, no color shift

### Buttons
- Primary: black gradient (`#333333` to `#171717`) with white text
- Secondary: white background with gray border, dark text
- Ghost: transparent with gray text, subtle gray hover background
- Plum buttons: use `bg-plum-600` for featured or prestige actions
- Never use gold or amber for buttons

### Icons
- Default icon color: near-black (`text-empire-gold` maps to `#171717`) or gray
- Emerald icons: use `text-emerald-600` for community, growth, and success concepts
- Plum icons: use `text-plum-500` for prestige and featured concepts
- Keep icon colors restrained — most icons should be neutral

### Progress Bars
- Default fill: black-to-charcoal gradient
- Complete fill: emerald gradient
- XP fill: charcoal gradient
- Never use gold or amber progress fills

### Badges
- Neutral badge: dark text on light gray background
- Emerald badge: emerald text on light emerald background
- Plum badge: plum text on light plum background
- Never use gold or amber badges

## Typography
- Display font: Outfit (headings, buttons, labels)
- Body font: Inter (paragraphs, descriptions, form text)
- Monospace: JetBrains Mono (code, numbers)
- Heading line-height: 1.2
- Body line-height: 1.5
- Maximum 3 font weights per screen

## Layout
- 8px spacing system
- Consistent alignment and visual balance
- Responsive breakpoints for mobile through desktop
- Progressive disclosure for complex actions (modals, drawers)

## When to Use This Skill

Activate this skill whenever you:
- Build a new page, section, or screen
- Redesign or restyle an existing page
- Add a new card, modal, drawer, or shared component
- Review or audit the project for visual consistency
- Choose colors for icons, buttons, badges, or accents

If you encounter old gold, amber, bronze, or warm beige values in the codebase, replace them with the neutral white, black, gray, plum, or emerald equivalents defined above.
