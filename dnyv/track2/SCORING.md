# Track 2 — Verification by Experience: Scoring Spec

Scoring logic for the DNYV Track 2 application. Item data lives in `items.json`.
This file is the single source of truth. The page is built by `build.mjs`
(embeds `items.json` into `page.template.html`). When the server side is built,
it must recompute the score from the raw submitted answers using the exact rules
below — never trust a score sent from the client.

The score is advisory. A human Verifier makes the final determination. The
applicant never sees a verdict or a number; the live readout shows the running
total and the gates, because the instrument is meant to feel honest and grueling.

---

## Data shape

`items.json`:

```
{
  "meta": {
    "title", "agency",
    "threshold": 1000,             // overall pass line
    "tenureCap": 500,              // Tenure category contributes at most this
    "tenureCategory": "Tenure",
    "sufferingFloor": 250,         // legacy mirror of categoryMinimums.Suffering
    "sufferingCategory": "Suffering",
    "categoryMinimums": {          // the "gates" — each must be met on its own
      "Tenure": 150, "Ground Truth": 120, "Suffering": 250
    },
    "softCap": 150,                // diminishing returns on "everyday life" items
    "softLabel": "Everyday life"
  },
  "categoryOrder": [ "Tenure","Sustenance","Ground Truth","Suffering","Mastery","Disposition","Trap","Flag" ],
  "items": [ ... ]
}
```

Each item: `id`, `category`, `label`, `type`, `input`. `input` is one of:

| `input`    | Render as                         | Scoring |
|------------|-----------------------------------|---------|
| `checkbox` | checkbox                          | adds `points` when checked |
| `counter`  | stepper 0..`maxUnits`             | adds `unitPoints` × units, capped at `max` |
| `trap`     | checkbox                          | adds `points` (NEGATIVE) when checked |
| `flag`     | checkbox                          | instant disqualification; 0 points |

Extra fields: `points` (checkbox/trap/flag); `unitPoints`/`maxUnits`/`max`
(counter); `bonus:true` / `crime:true` (visual tag only, scores normally);
**`soft:true`** — the item is in the capped "everyday life" bucket (see below).
Soft items appear only in non-gated categories (Sustenance, Mastery, Disposition).

**Presentation:** render grouped by **display category** (`item.display`, falling
back to `item.category`), so `Trap` and `Flag` items are scattered in among the
real items of a category rather than sitting in their own section — a petitioner
must not be able to tell which items hurt. For the same reason the page shows
**no per-item point values**; the running tally is the only feedback. Scoring is
independent of display and uses `item.category` (traps stay `Trap`, flags `Flag`),
so the gates are unaffected by where a trap is shown.

---

## The score

```
rawCategoryTotal(cat) =
    Σ points of checked checkboxes in cat
  + Σ (unitPoints × units, capped at max) of counters in cat
  + Σ points of checked traps in cat            // traps live in the "Trap" category

tenureContribution = min(tenureCap, rawCategoryTotal("Tenure"))        // ≤ 500

gross = tenureContribution
      + Σ rawCategoryTotal(cat) for every category EXCEPT Tenure and Flag

// Diminishing returns on "everyday life" (soft) items:
softRaw      = Σ points of checked items where item.soft === true
softOverflow = max(0, softRaw − softCap)        // everything past 150 is discarded
total        = gross − softOverflow
```

Notes:
- **Tenure cap** (500) applies to the Tenure category only.
- **Soft cap** (`softCap`, 150): a true soft cap, not a cliff. Everyday-life
  (soft) points count in full up to 150, then at **half rate** beyond it:
  `softCounted = softRaw <= 150 ? softRaw : 150 + round((softRaw − 150) / 2)`,
  and `total` is reduced by the discarded half. They still count in full toward
  their own category totals — but none of them are in a *gated* category.
- **Crime items always count.** An item with `crime:true` is never soft-capped
  (the soft set is `item.soft && !item.crime`), so petty-crime street cred always
  adds to the total. Crime items carry a visual "Crime" tag and may be negative
  (e.g. shoplifting from a mom-and-pop is −50).
- **Traps** subtract and are not capped. **Flags** only disqualify.
- `total` is not capped at the threshold; it can exceed it.

## The gates (category minimums)

`meta.categoryMinimums` — each listed category must independently meet its floor,
on its *counted* contribution (Tenure uses `tenureContribution`; others use
`rawCategoryTotal`). Points in one category never carry another past its gate.

```
gateMet(cat) = countedValue(cat) >= categoryMinimums[cat]
allGatesMet  = every listed category's gate is met
```

Current gates: **Tenure ≥ 150, Ground Truth ≥ 120, Suffering ≥ 250.**

---

## Provisional determination (reviewer-facing only; never shown to applicant)

First match wins:

1. **DISQUALIFIED** — any `flag` checked. Overrides everything.
2. **VERIFIED** — `total >= threshold` AND `allGatesMet`.
3. **RETURNED FOR INSUFFICIENT SUFFERING** — `total >= threshold`, all other
   gates met, but the **Suffering** gate is the only one unmet. (They have the
   points and the roots, but have not paid enough.)
4. **DENIED** — anything else (`total < threshold`, or a non-Suffering gate unmet).

A human makes the final call from the queue; this only triages.

### What the applicant sees on submit

No verdict, no number — one deadpan confirmation ("Application received… You are
exactly where you are in line.").

---

## Reference numbers (from the current item set)

- Items: **111** (Tenure 8, Sustenance 8, Ground Truth 19, Suffering 31,
  Mastery 10, Disposition 19, Trap 14, Flag 2).
- Category maxes: Tenure 705 (→ 500 capped), Ground Truth 435, Suffering 805,
  Sustenance 185, Mastery 220, Disposition 480.
- Soft bucket raw max: **415**, capped at **150** (265 discarded at full fill).
- **Max achievable total** (tenure-capped, soft-capped, no traps/flags): **2,360.**
- End-to-end test: check every non-trap/non-flag item and max every counter →
  total **2,360**, all three gates met, provisional **VERIFIED**. The client live
  readout and the server-stored score must agree on that number.
