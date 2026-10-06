import { TRACK2_DATA } from './_track2-data.js';

// Authoritative Track 2 scoring. Recomputes the score from the raw submitted
// answers — never trusts a number sent by the client. This is the single
// source of truth, shared (as data) with the live client readout via
// track2/items.json. Mirrors track2/SCORING.md exactly.
//
// `responses` is a plain object: { [itemId]: true }  for checkbox/trap/flag,
//                                { [itemId]: <int> }  for counters (unit count).

const META = TRACK2_DATA.meta;
const ITEMS = TRACK2_DATA.items;
const ORDER = TRACK2_DATA.categoryOrder;
const BY_ID = Object.fromEntries(ITEMS.map((it) => [it.id, it]));
const BY_CAT = {};
for (const it of ITEMS) (BY_CAT[it.category] = BY_CAT[it.category] || []).push(it);

const TENURE_CAT = META.tenureCategory;
const TCAP = META.tenureCap;
const SOFT_CAP = META.softCap || 0;
const MINS = META.categoryMinimums || {};
const GATE_ORDER = ['Tenure', 'Ground Truth', 'Suffering'].filter((c) => MINS[c] != null);
const THRESHOLD = META.threshold;

// Clean an incoming responses object to only what the item set allows, so a
// crafted payload can't inject arbitrary ids or out-of-range counters.
export function normalizeResponses(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const it of ITEMS) {
    const v = raw[it.id];
    if (v == null) continue;
    if (it.input === 'counter') {
      const n = Math.max(0, Math.min(it.maxUnits, Math.floor(Number(v) || 0)));
      if (n > 0) out[it.id] = n;
    } else if (v === true || v === 1 || v === 'true') {
      out[it.id] = true;
    }
  }
  return out;
}

function rawCategoryTotal(cat, r) {
  let t = 0;
  for (const it of BY_CAT[cat] || []) {
    if (it.input === 'counter') {
      const u = r[it.id] || 0;
      t += Math.min(it.max, it.unitPoints * u);
    } else if (it.input === 'checkbox' || it.input === 'trap') {
      if (r[it.id]) t += it.points;
    }
    // flags contribute 0
  }
  return t;
}

function softRawTotal(r) {
  let t = 0;
  for (const it of ITEMS) {
    // Crime items are never soft-capped — they always count.
    if (it.soft && !it.crime && r[it.id]) t += it.points;
  }
  return t;
}

// Returns the full computed result for a set of responses.
export function computeScore(rawResponses) {
  const r = normalizeResponses(rawResponses);

  const tenureRaw = rawCategoryTotal(TENURE_CAT, r);
  const tenureContribution = Math.min(TCAP, tenureRaw);

  let gross = tenureContribution;
  for (const c of ORDER) {
    if (c === TENURE_CAT || c === 'Flag') continue;
    gross += rawCategoryTotal(c, r);
  }

  // Soft cap: full value to SOFT_CAP, half rate beyond (a true soft cap).
  const softRaw = softRawTotal(r);
  const softOver = Math.max(0, softRaw - SOFT_CAP);
  const softDiscount = Math.round(softOver * 0.5);
  const softCounted = softRaw - softDiscount;
  const total = gross - softDiscount;

  const sufferingTotal = rawCategoryTotal(META.sufferingCategory, r);

  const gates = {};
  for (const c of GATE_ORDER) {
    const value = c === TENURE_CAT ? tenureContribution : rawCategoryTotal(c, r);
    gates[c] = { value, min: MINS[c], met: value >= MINS[c] };
  }
  const allGatesMet = GATE_ORDER.every((c) => gates[c].met);

  const disqualified = (BY_CAT.Flag || []).some((it) => r[it.id]);

  // Provisional determination (reviewer-facing triage only). First match wins.
  let provisional;
  if (disqualified) provisional = 'disqualified';
  else if (total >= THRESHOLD && allGatesMet) provisional = 'verified';
  else if (
    total >= THRESHOLD &&
    GATE_ORDER.filter((c) => c !== 'Suffering').every((c) => gates[c].met) &&
    !gates.Suffering?.met
  )
    provisional = 'returned_for_insufficient_suffering';
  else provisional = 'denied';

  return {
    responses: r,
    total,
    tenureRaw,
    tenureContribution,
    softRaw,
    softCounted,
    sufferingTotal,
    gates,
    allGatesMet,
    disqualified,
    provisional,
  };
}

// Reviewer-facing breakdown of what the petitioner actually declared: the
// selected items grouped by category, each with its face-value contribution and
// crime/soft/trap/flag tags. Mirrors computeScore's arithmetic so the "test
// results" the reviewer reads line up with the score. Only categories with at
// least one selected item are returned.
export function explainResponses(rawResponses) {
  const r = normalizeResponses(rawResponses);
  const blocks = [];
  let softRaw = 0;
  for (const cat of ORDER) {
    const items = [];
    let raw = 0;
    for (const it of BY_CAT[cat] || []) {
      if (!r[it.id]) continue;
      let contribution;
      let count = null;
      if (it.input === 'counter') {
        count = r[it.id];
        contribution = Math.min(it.max, it.unitPoints * count);
      } else {
        contribution = it.points || 0;
      }
      raw += contribution;
      if (it.soft && !it.crime) softRaw += it.points || 0;
      items.push({
        label: it.label,
        type: it.type || null,
        input: it.input,
        count,
        unitPoints: it.unitPoints ?? null,
        points: contribution,
        crime: !!it.crime,
        soft: !!it.soft,
        flag: it.input === 'flag' || cat === 'Flag',
        trap: it.input === 'trap' || cat === 'Trap',
      });
    }
    if (!items.length) continue;
    const block = { category: cat, raw, items };
    if (cat === TENURE_CAT) { block.cap = TCAP; block.counted = Math.min(TCAP, raw); }
    if (MINS[cat] != null) block.gateMin = MINS[cat];
    blocks.push(block);
  }
  const softDiscount = Math.round(Math.max(0, softRaw - SOFT_CAP) * 0.5);
  return { blocks, soft: { raw: softRaw, counted: softRaw - softDiscount, cap: SOFT_CAP, discount: softDiscount } };
}

export const TRACK2_META = META;
