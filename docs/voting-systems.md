# Voting Systems Reference

This document is the authoritative reference for how all voting works in the Empire.
There are three separate voting systems. They are intentionally distinct — each has
its own eligibility rules, ballot mechanics, and cost structure. Do not mix them.

---

## Core Principles

Three concepts are kept separate at all times:

| Concept | What it is | Where it applies |
|---|---|---|
| **Voting Credits** | A monthly allowance spent only on Metro Initiative selections | Metro Initiative Voting only |
| **Voting Power** | Earned weight based on the member's Level (Influence) | All three voting systems — applies once per ballot or per selection |
| **Influence** | A progression currency awarded for participation | +25 awarded once per completed voting event in any system |

Voting Credits are never used for leadership elections or Empire-wide votes.
Voting Power is never purchased, spent, or consumed — it is a multiplier that
applies once and remains with the member.
Influence rewards are one-time per voting event, regardless of how many selections
the member makes within that event.

---

## 1. Metro Initiative Voting

### Purpose
Members vote on which organization-created initiatives their Metro Treasury
should fund. Organizations submit initiatives attached to their organization, the
Top 5 initiatives by community backing are frozen into a 48-hour ballot, and
members vote on the initiatives themselves.

### Eligibility
- Black Card or higher membership
- Active account
- Must be a member of the Metro holding the initiative

### Initiative Voting Credits

Each membership tier receives a monthly allowance of Initiative Voting Credits:

| Tier | Monthly Credits |
|---|---|
| White Card | 0 |
| Black Card | 4 |
| Black+ | 7 |
| Black Pro | 10 |
| Arch Member | 10 |
| Arch Pro | 10 |

- Credits are granted on the member's monthly anniversary date.
- Credits carry forward if unused, up to a **maximum balance of 30**.
- Black Pro provides enough credits (10) to support all 5 initiatives in both
  monthly voting cycles (5 x 2 = 10).
- Arch Member and Arch Pro receive the same 10 credits as Black Pro. Their
  additional value is prestige and VIP recognition, not more voting power.

### Ballot Mechanics

- Voting cycles open on the **1st and 15th** of each month (Metro local time)
  and last **48 hours**.
- The Top 5 eligible initiatives (each fully fundable from the Available Treasury)
  are frozen into the ballot. The organization name identifies who submitted each
  initiative; organizations are not voting choices.
- A member may support **any or all** of the 5 initiatives on the ballot.
- **Each selected initiative costs 1 Initiative Voting Credit.**
- A member may spend **maximum 1 credit per initiative per cycle** — no stacking
  multiple credits on the same initiative.
- The member's **Voting Power applies once** to each initiative they support.
- One ballot per member per cycle. Ballots are final once submitted.

### Influence Reward

- **+25 Influence** is awarded once per completed voting cycle, regardless of
  whether the member supports 1 initiative or all 5.

### Quorum and Qualification

- Quorum: 5% of eligible voters or 100 ballots, whichever is lower (minimum 1).
- An initiative must receive support on at least 10% of ballots cast to qualify
  for funding.
- Qualifying initiatives move to admin review, then funding in vote-ranked order.

### Rollover Cap

- Unused credits carry forward, but the balance is capped at **30**.
- The cap is applied at the next monthly grant: if a member has 25 credits and
  receives 10 more, the balance becomes 30 (not 35).

---

## 2. Metro Leadership Elections

### Purpose
Members elect their Metro Council — the representatives who govern their Metro.
The election follows a nomination phase, then a finalist election phase.

### Eligibility
- Black Card or higher membership
- Active account
- Must be a member of the Metro holding the election

### Ballot Mechanics

- Each eligible voter receives **one automatic election ballot** — no credits
  are used or consumed.
- A voter may select **up to 7 candidates** (matching the number of council seats).
- A voter may only select each candidate **once**.
- The member's **Voting Power applies once** to each selected candidate.
- One ballot per member per election. Ballots are final once submitted.

### Influence Reward

- **+25 Influence** is awarded once when the member submits their election ballot.

### Winning

- The 7 candidates with the highest vote totals win seats, subject to the
  existing runoff and tie-breaking rules.

### No Credits Required

Leadership elections do **not** use Initiative Voting Credits. Any eligible
Black Card+ member can vote regardless of their credit balance.

---

## 3. Empire-Wide Votes

### Purpose
Empire-wide decisions are put to the entire eligible membership. These are
typically major policy decisions, structural changes, or direction questions
that affect the whole Empire.

### Eligibility
- Black Card or higher membership
- Active account
- Applies across the entire Empire (not Metro-specific)

### Ballot Mechanics

- Each eligible member receives **one automatic ballot** — no credits are used
  or consumed.
- Most Empire-wide decisions use a simple **Yes / No** or **Support / Do Not
  Support** format.
- The member's **Voting Power applies once** to the ballot.
- No stacking or purchasing extra votes.
- Empire-wide voting remains open for **7 days**.
- One ballot per member. Ballots are final once submitted.

### Influence Reward

- **+25 Influence** is awarded once when the member casts their ballot.

### No Credits Required

Empire-wide votes do **not** use Initiative Voting Credits. Any eligible
Black Card+ member can vote regardless of their credit balance.

---

## Summary Table

| Feature | Metro Initiatives | Leadership Elections | Empire-Wide Votes |
|---|---|---|---|
| Eligibility | Black Card+, in Metro | Black Card+, in Metro | Black Card+, Empire-wide |
| Uses Voting Credits | Yes (1 per initiative) | No | No |
| Ballot type | Select up to 5 initiatives | Select up to 7 candidates | Yes/No or Support/Do Not Support |
| Voting Power | Once per initiative | Once per candidate | Once per ballot |
| Influence reward | +25 per cycle | +25 per election | +25 per vote |
| Duration | 48 hours (1st & 15th) | Election phase window | 7 days |
| Final | Yes | Yes | Yes |

---

## Voting Power Formula (unchanged)

Voting Power (VP) determines how strongly a member's vote counts. It is derived
from Level only. Level is determined by total Influence. VP is never purchased,
never spent, and never decays.

```
VP = MIN(1.00 + (Level - 1) x 0.05, 5.00)
```

+0.05 VP for every Level above Level 1, capped at 5.00 (reached at Level 81).

VP is snapshotted at the moment a vote is cast — later changes to Level do not
retroactively affect past votes.

---

## What Has Not Changed

- The Voting Power formula and its caps.
- Metro Initiative quorum, qualification, and funding rules.
- Leadership election nomination, finalist, and runoff/tie rules.
- The Metro Treasury funding flow and admin review process.
- Influence calculation and Level progression.
