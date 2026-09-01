# Empire Civilization Progression Reference

This document is the authoritative reference for how and why the Empire progresses.
It defines the civilization ladder, the unlocks at each stage, and the rules for
introducing new requirements. Do not move features between levels without an
explicit approved change.

---

## 1. Core Progression Principle

The Empire advances through **two measurements only**:

1. **Total Population** — every member in the Empire.
2. **Tribe City Count** — the number of cities that have reached Tribe status (100+ people).

No other metric gates Empire advancement. Money, voting, initiatives, legacy
enrollment, and governance are city-level features that unlock at certain
civilization levels, but they do NOT determine when the Empire advances.

Each civilization level requires BOTH thresholds to be met simultaneously.
Neither population alone nor Tribe Cities alone can advance the Empire.

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

These levels represent the advancement of the **entire Empire**.

They must never be mixed with local city progression:

- Group
- Tribe
- Organization
- Congregation
- Coalition
- Powerhouse
- Legacy City

Use separate types, configuration, calculations, database fields, and UI labels for Empire civilization levels and city levels.

---

## 3. Official Progression Requirements

| Level | Name | Population Required | Tribe Cities Required | Unlocks |
|---|---|---|---|---|
| LVL 1 | Outpost | 1,000 | 10 | Archetypes, Marketplace |
| LVL 2 | Settlement | 5,000 | 20 | City Treasuries, Local Voting |
| LVL 3 | Village | 25,000 | 30 | Family, City Leadership and Elections |
| LVL 4 | Province | 50,000 | 40 | Legacy Program, Expanded Treasury Capacity |
| LVL 5 | Kingdom | 100,000 | 50 | Empire Council, Inter-City Initiatives |
| LVL 6 | Dominion | 500,000 | 100 | Final Empire Status, All approved core systems fully active |
| LVL 7 | Empire | 1,000,000 | 200 | — |

A city becomes a Tribe when its population reaches 100 people.

---

## 4. Current Objectives

### LVL 1 — OUTPOST

**Current Objective**
Reach 1,000 members and form 10 Tribe Cities.

**To Reach LVL 2 — Settlement**
We must gather our people and raise 10 Tribes.

**Unlocks**
- Archetypes
- Marketplace

---

### LVL 2 — SETTLEMENT

**Current Objective**
Reach 5,000 members and form 20 Tribe Cities.

**To Reach LVL 3 — Village**
We must grow our numbers and our geography.

**Unlocks**
- City Treasuries
- Local Voting

---

### LVL 3 — VILLAGE

**Current Objective**
Reach 25,000 members and form 30 Tribe Cities.

**To Reach LVL 4 — Province**
We must keep growing — more people, more Tribes.

**Unlocks**
- Family
- City Leadership and Elections

---

### LVL 4 — PROVINCE

**Current Objective**
Reach 50,000 members and form 40 Tribe Cities.

**To Reach LVL 5 — Kingdom**
We must keep growing our population and our geography.

**Unlocks**
- Legacy Program
- Expanded Treasury Capacity

---

### LVL 5 — KINGDOM

**Current Objective**
Reach 100,000 members and form 50 Tribe Cities.

**To Reach LVL 6 — Dominion**
We must reach one hundred thousand members and fifty Tribes.

**Unlocks**
- Empire Council
- Inter-City Initiatives

---

### LVL 6 — DOMINION

**Current Objective**
Reach 500,000 members and form 100 Tribe Cities.

**To Reach LVL 7 — Empire**
We must unite half a million members and one hundred Tribes.

**Unlocks**
- Final Empire Status
- All approved core systems fully active

---

### LVL 7 — EMPIRE

**Current Objective**
Continue growing the population and expanding Tribe Cities across the land.

**Civilization Achieved**
One million members. Two hundred Tribe Cities. One Empire.
The Empire has risen. Now we build its legacy.

---

## 5. Outpost

### Purpose

Outpost is the pre-launch Founder Campaign.

The Empire is gathering its first members and helping cities reach Tribe status.

### Available During Outpost

- Member registration
- Member numbers
- City and metro assignment
- Member profiles
- Member missions
- Referrals
- Member rankings
- City rankings
- Empire growth updates
- Empire map and campaign statistics

### Requirement to Reach Settlement

**1,000 total members AND 10 Tribe Cities.**

A Tribe City is any city with 100+ members.

This transition is calculated from authoritative backend data.

### Settlement Unlocks

- Archetypes
- Marketplace

---

## 6. Settlement

### Purpose

The Empire is now open.

Members choose their primary role and immediately receive tools that allow them to contribute through that role.

### New Features Unlocked

#### Archetype System

Members select their role or job within the Empire.

#### Marketplace and Contribution Tools

The Marketplace opens at the same time as Archetypes so members can immediately use their roles.

### Village Unlocks

- City Treasuries
- Local Voting

### Requirement to Reach Village

**5,000 total members AND 20 Tribe Cities.**

---

## 7. Village

### Purpose

The Empire has grown enough to begin accumulating and allocating shared resources.

### New Features Unlocked

#### City Treasury

Eligible Empire revenue begins flowing into city treasury balances.

#### Local Voting Booth

Eligible members can participate in local voting sessions.

### Province Unlocks

- Family
- City Leadership and Elections

### Requirement to Reach Province

**25,000 total members AND 30 Tribe Cities.**

---

## 8. Province

### Purpose

Cities are now becoming organized communities with local programs, gatherings, leadership, and civic structure.

### New Features Unlocked

#### Family Section

The Family section supports local events, mentorship, youth programs, community gatherings, and recurring programs.

#### City Leadership and Elections

Qualified members may participate in local governance.

### Kingdom Unlocks

- Legacy Program
- Expanded Treasury Capacity

### Requirement to Reach Kingdom

**50,000 total members AND 40 Tribe Cities.**

---

## 9. Kingdom

### Purpose

The Empire has grown large enough to support qualified members through major life milestones.

### New Features Unlocked

#### Legacy Program

The Legacy Program supports qualified members through Death Support, Marriage Support, Child Welcome, and Education Recognition grants.

#### Expanded Treasury Capacity

Cities become eligible for higher treasury caps, larger awards, and expanded project categories.

### Dominion Unlocks

- Empire Council
- Inter-City Initiatives

### Requirement to Reach Dominion

**100,000 total members AND 50 Tribe Cities.**

---

## 10. Dominion

### Purpose

The Empire now contains mature cities capable of coordinating leadership, funding, and initiatives across regions.

### New Features Unlocked

#### Empire Council

The Empire Council supports empire-wide coordination, national leadership, and regional representation.

#### Inter-City Initiatives

Multiple cities may collaborate through shared projects, cooperative campaigns, and coordinated funding.

### Empire Unlocks

- Final Empire Status
- All approved core systems fully active

### Requirement to Reach Empire

**500,000 total members AND 100 Tribe Cities.**

---

## 11. Empire

### Purpose

Empire is the seventh and highest civilization stage.

There is no civilization level after Empire.

### Completion State

Show a celebration state:

> EMPIRE ACHIEVED
> One million members. Two hundred Tribe Cities. One Empire.

Personal progression, city progression, projects, treasuries, Legacy support, leadership, and community growth continue after Empire status is reached.

The application does not stop evolving. Only the civilization ladder is complete.

---

## 12. Voting Power Formula

### Overview

Voting Power (VP) determines how strongly a member's Voting Credits count in Empire decisions. It is derived from two inputs only: **Level** (driven by XP) and **Influence** (earned through verified referrals and voting). VP is never purchased, never spent, and never decays.

### Formula

```
VP = MIN(1.00 + level_bonus + influence_bonus, 5.00)
```

**Level Bonus:**

```
level_bonus = MIN((level - 1) × 0.05, 1.50)
```

+0.05 VP for every Level above Level 1, capped at +1.50 (reached at Level 31).

| Level | Level Bonus |
|-------|-------------|
| 1     | +0.00       |
| 2     | +0.05       |
| 3     | +0.10       |
| 5     | +0.20       |
| 10    | +0.45       |
| 20    | +0.95       |
| 30    | +1.45       |
| 31+   | +1.50       |

**Influence Bonus:**

```
influence_bonus = MIN(FLOOR(influence / 10) × 0.01, 2.50)
```

+0.01 VP for every 10 Influence, capped at +2.50 (reached at 2,500 Influence).

| Influence | Influence Bonus |
|-----------|-----------------|
| 0         | +0.00           |
| 10        | +0.01           |
| 50        | +0.05           |
| 100       | +0.10           |
| 250       | +0.25           |
| 500       | +0.50           |
| 1,000     | +1.00           |
| 1,500     | +1.50           |
| 2,000     | +2.00           |
| 2,500+    | +2.50           |

### VP Examples

| Level | Influence | Base | Level Bonus | Influence Bonus | Total VP |
|-------|-----------|------|-------------|-----------------|----------|
| 1     | 0         | 1.00 | +0.00       | +0.00           | 1.00×    |
| 3     | 0         | 1.00 | +0.10       | +0.00           | 1.10×    |
| 10    | 500       | 1.00 | +0.45       | +0.50           | 1.95×    |
| 20    | 1,000     | 1.00 | +0.95       | +1.00           | 2.95×    |
| 31+   | 2,500+    | 1.00 | +1.50       | +2.50           | 5.00×    |

### Ballot Mechanics

- **Credit cap:** 100 Voting Credits per member per ballot.
- **Maximum weighted voting power:** 100 credits × 5.00 VP = **500**.
- Votes are final. Credits are consumed at submission.
- VP is snapshotted at the moment a vote is cast — later changes to Level or Influence do not retroactively affect past votes.
- Buying credits never awards XP, Influence, or Level.

### Design Rationale

The linear level rate (+0.05/level) keeps unlimited Level progression from creating unlimited voting weight. The Influence bonus rewards proven impact (voting and verified referrals) without allowing purchased credits to inflate VP. A veteran member who has helped build the Empire carries real weight in decisions — strong enough to feel earned, without making a single person equivalent to twenty community members.

---

## 13. Official Feature-Unlock Matrix

| Civilization | Major Unlocks |
|---|---|
| Outpost | Founder Campaign |
| Settlement | Archetypes and Marketplace |
| Village | City Treasury and Local Voting |
| Province | Family and City Leadership/Elections |
| Kingdom | Legacy Program and Expanded Treasury |
| Dominion | Empire Council and Inter-City Initiatives |
| Empire | Final Civilization Status and all approved core systems |

Do not move features between levels without an explicit approved change.
