# Empire Civilization Progression Reference

This document is the authoritative reference for how and why the Empire progresses.
It defines the civilization ladder, the unlocks at each stage, and the rules for
introducing new requirements. Do not move features between levels without an
explicit approved change.

---

## 1. Core Progression Principle

The Empire advances through **one measurement only**:

1. **Qualified Metro Count** — the number of Metros that have reached at least
   100 active members.

No other metric gates Empire advancement. Money, voting, initiatives, and
governance are feature systems that unlock at certain civilization levels, but
they do NOT determine when the Empire advances.

A Metro becomes **Qualified** when its active member population reaches 100.

---

## 2. Official Empire Civilization Levels

Use this exact order:

1. Outpost
2. Settlement
3. Village
4. Province
5. Kingdom
6. Dominion
7. Empire

These levels represent the advancement of the **entire Empire** — not individual
cities or Metros. Cities do not have named levels. Metros do not have named
levels. The civilization ladder belongs to the Empire as a whole.

The following legacy terms are **removed** and must never be used as progression
levels:

- Tribe City
- Group
- Congregation
- Coalition
- Powerhouse
- Legacy City

---

## 3. Official Progression Requirements

| Level | Name | Qualified Metros Required | Unlocks |
|---|---|---|---|
| LVL 1 | Outpost | 0 (prelaunch) | Member registration, profiles, referrals, missions, rankings |
| LVL 2 | Settlement | 1 | Organizations, Marketplace |
| LVL 3 | Village | 3 | Metro Treasuries, Metro Initiative Voting |
| LVL 4 | Province | 5 | Family, Metro Leadership Elections |
| LVL 5 | Kingdom | 10 | Empire Advisory Council, Legacy Program, Expanded Treasury Capacity |
| LVL 6 | Dominion | 25 | Empire-Wide Voting, Inter-Metro Initiatives |
| LVL 7 | Empire | 50 | Final Empire Status — all approved core systems fully active |

A Metro qualifies at 100 active members. Empire stage is determined solely by
how many Qualified Metros exist.

---

## 4. Current Objectives

### LVL 1 — OUTPOST

**Current Objective**
Recruit founding members and help Metros reach 100 members.

**To Reach LVL 2 — Settlement**
At least one Metro must reach 100 active members.

**Available During Outpost**
- Member registration
- Member numbers
- City and Metro assignment
- Member profiles
- Member missions
- Referrals
- Member rankings
- City rankings (population and contributions)
- Empire growth updates
- Empire map and campaign statistics

---

### LVL 2 — SETTLEMENT

**Current Objective**
Grow the first Qualified Metro and begin building organizations.

**To Reach LVL 3 — Village**
Three Metros must reach 100 active members.

**Unlocks**
- Organizations
- Marketplace

---

### LVL 3 — VILLAGE

**Current Objective**
Begin pooling community resources through Metro Treasuries.

**To Reach LVL 4 — Province**
Five Metros must reach 100 active members.

**Unlocks**
- Metro Treasuries
- Metro Initiative Voting

---

### LVL 4 — PROVINCE

**Current Objective**
Establish local governance through elected Metro Councils.

**To Reach LVL 5 — Kingdom**
Ten Metros must reach 100 active members.

**Unlocks**
- Family
- Metro Leadership Elections

---

### LVL 5 — KINGDOM

**Current Objective**
Introduce the Empire Advisory Council and the Legacy Program.

**To Reach LVL 6 — Dominion**
Twenty-five Metros must reach 100 active members.

**Unlocks**
- Empire Advisory Council
- Legacy Program
- Expanded Treasury Capacity

---

### LVL 6 — DOMINION

**Current Objective**
Enable Empire-wide decisions and cross-Metro collaboration.

**To Reach LVL 7 — Empire**
Fifty Metros must reach 100 active members.

**Unlocks**
- Empire-Wide Voting
- Inter-Metro Initiatives

---

### LVL 7 — EMPIRE

**Current Objective**
Continue growing the population and expanding Qualified Metros across the land.

**Civilization Achieved**
Fifty Qualified Metros. One Empire.
The Empire has risen. Now we build its legacy.

---

## 5. City and Metro Structure

Cities do not have named levels. A city display shows:

- Member population
- Amount raised/contributed
- Businesses, professionals, organizations
- Metro affiliation

Example:

> Kennesaw, GA
> 842 Members
> $6,420 Raised
> Atlanta Metro

Cities contribute financially, but the **Metro** is the primary local governance
and Treasury unit. City contributions combine into the Metro Treasury.

**Principle:** Cities raise it. The Metro pools it. The Metro community decides
how it is used.

---

## 6. Metro Treasury Capacity

Treasury capacity belongs to the Metro, not individual cities.

| Metro Population | Available Capacity |
|---|---|
| 0–99 | $0 |
| 100–249 | $5,000 |
| 250–499 | $10,000 |
| 500–999 | $25,000 |
| 1,000–2,499 | $50,000 |
| 2,500–4,999 | $100,000 |
| 5,000+ | No artificial cap |

Treasury capacity is a maximum Available balance at one time, not a lifetime
spending limit.

**Capacity is permanent.** Once a Metro reaches a threshold and unlocks a
higher capacity, it never loses that capacity — even if population later
decreases. The system stores the highest capacity ever unlocked and refills
Available from Reserved up to that amount.

---

## 7. Influence Growth Rewards

Influence is earned through **individual member actions only**, primarily:

- Voting (+25 per completed voting event)
- Referrals (+25 per verified referral)

**Removed rewards (no longer awarded):**
- ~~+50 Influence city-level-up reward~~
- ~~+50 Metro qualification reward~~
- ~~+100 Influence Empire-stage advancement reward~~

Metro qualification and Empire-stage advancement trigger milestone notifications,
celebrations, historical records, and cosmetic recognition — but **no automatic
Influence**.

---

## 8. Voting Systems Overview

### Three Separate Voting Systems

The Empire has three distinct voting systems. They are fully documented in
`docs/voting-systems.md`. The key rules are summarized here.

**1. Metro Initiative Voting** — Members vote on which community initiatives
their Metro Treasury funds. Uses Initiative Voting Credits (1 per initiative,
up to 5 per 48-hour cycle). Black Card+ only. +25 Influence per cycle.

**2. Metro Leadership Elections** — Members elect their Metro Council
representatives. No credits used. One automatic ballot, up to 7 candidates.
Black Card+ only. +25 Influence per election.

**3. Empire-Wide Votes** — Empire-wide decisions in a Yes/No format. No credits
used. One automatic ballot. Black Card+ only. Open for 7 days. +25 Influence
per vote.

### Initiative Voting Credits by Tier

| Tier | Monthly Credits |
|---|---|
| White Card | 0 |
| Black Card | 4 |
| Black+ | 7 |
| Black Pro | 10 |
| Arch Member | 10 |
| Arch Pro | 10 |

- Credits are for Metro Initiative voting only.
- Unused credits carry forward, capped at a maximum balance of 30.
- Black Pro provides enough credits to support all 5 initiatives in both
  monthly voting cycles (5 x 2 = 10).
- Arch and Arch Pro do not receive more credits than Black Pro. Their value
  is prestige and VIP recognition.

### Voting Power Formula (unchanged)

Voting Power (VP) determines how strongly a member's vote counts in all three
voting systems. It is derived from Level only. Level is determined by total
Influence. VP is never purchased, never spent, and never decays.

```
VP = MIN(1.00 + (Level - 1) x 0.05, 5.00)
```

+0.05 VP for every Level above Level 1, capped at 5.00 (reached at Level 81).

| Level | Level Bonus | Total VP |
|-------|-------------|----------|
| 1     | +0.00       | 1.00x    |
| 10    | +0.45       | 1.45x    |
| 20    | +0.95       | 1.95x    |
| 40    | +1.95       | 2.95x    |
| 81+   | +4.00       | 5.00x    |

VP is snapshotted at the moment a vote is cast — later changes to Level do not
retroactively affect past votes.

### Design Rationale

The linear level rate (+0.05/level) keeps unlimited Level progression from
creating unlimited voting weight. VP is driven by Level alone, and Level is
driven by Influence alone — so voting weight reflects earned participation,
not purchased power.

---

## 9. News Publishing

Only active elected Metro leadership may publish local/Metro News.

Empire-wide News may only be published by:
- Founder/Admin
- authorized Media & Public Affairs EAC members

Normal members do not publish News. The general correspondent/news publishing
model is removed.

---

## 10. Event Check-ins

Event Check-ins are removed from V1. They are not used for Influence,
Marketplace ranking, initiative ranking, or any current progression system.
The concept is retained only as a future feature.

---

## 11. Official Feature-Unlock Matrix

| Civilization | Major Unlocks |
|---|---|
| Outpost | Founder Campaign — registration, profiles, referrals, missions, rankings |
| Settlement | Organizations and Marketplace |
| Village | Metro Treasury and Metro Initiative Voting |
| Province | Family and Metro Leadership Elections |
| Kingdom | Empire Advisory Council, Legacy Program, Expanded Treasury |
| Dominion | Empire-Wide Voting and Inter-Metro Initiatives |
| Empire | Final Civilization Status and all approved core systems |

Do not move features between levels without an explicit approved change.

---

## 12. Final Principles

- Influence is earned through individual participation such as voting and referrals.
- Paid membership does not directly purchase Influence.
- Initiative Voting Credits determine how many initiatives a member may support,
  not how much weight they can stack on one proposal.
- Voting Power is earned through progression and applies once to each valid
  selection.
- Black Pro is the maximum functional Initiative Voting Credit tier.
- Arch and Arch Pro add prestige, VIP identity, and recognition — not extra
  governance power.
- Cities raise funds. Metros pool funds. Metro communities vote on local
  initiatives.
- Treasury capacity permanently unlocks and never decreases.
- Organizations build initiative support continuously rather than resubmitting
  every cycle.
- Metro Initiative Voting, Metro Leadership Elections, and Empire-Wide Votes
  are three separate voting systems with different ballot mechanics.
