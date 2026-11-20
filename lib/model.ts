// Token Radar's value model (radar-3): one sealed snapshot in, one ranked board out.
//
// The board ranks every protocol on the snapshot's watchlist — the floor, never the ceiling —
// and adds the early radar: pre-token protocols the watchlist leaves out, below the floor and
// above it, that pass the same honesty test the watchlist rule uses. A protocol is pre-token
// when its record carries no token (no market cap, no CoinGecko id, no symbol). Protocols whose
// token already trades are kept apart and shown with the market's own values, never mixed into
// the ranked board.
//
// Implied value comes only from the snapshot's own figures. The starter sorted almost purely by
// TVL, so a $2.7B protocol beat a $50M one fifty times over before anything else was read. This
// model says size has diminishing returns, and lets momentum, time without a token and reach do
// the separating:
//
//   size         = clamp((tvl_usd / 100_000_000) ^ -0.2, 0.45, 1.5)
//                  A protocol ten times the TVL is not ten times the value: the multiple
//                  compresses as size grows, so a small fast grower can outrank a large flat one.
//   growth       = clamp(change_7d, -50, 150) per cent
//   growthMult   = 1 + (growth / 100) x GROWTH_WEIGHT   (0.8: growth is the strongest signal)
//   maturity     = 0.7 + min(age_days, 1095) / 1095 x 0.5   (0.7..1.2: longer with no token,
//                  more pent-up value; age unknown: 365 days)
//   reach        = 1 + min(chains - 1, 4) x 0.05        (1.0..1.2: more chains, broader surface)
//   implied      = max(1, round(tvl_usd x 0.25 x size x growthMult x maturity x reach))
//
// radar-3 keeps that formula and its constants — a sensitivity test over the plausible weight
// range moves the top 20 by at most a few places and never changes the top three, so the
// baseline is the robust middle, not a cherry-picked one — and makes the model honest about
// what it does not know. A seven-day growth the snapshot does not report is treated as 0%:
// no bonus, no penalty, because unreported is not zero. An unknown age uses 365 days for
// maturity, a conservative default below the board's median age of 421 days, and the dashboard
// says so. Every row now carries its implied range, the lowest and highest value across two
// kinds of doubt: the sensitivity runs that shift the growth weight, the unknown-age default
// and the size exponent, and input noise on the snapshot's own figures (TVL ±5% as a
// point-in-time measurement band, seven-day growth ±2 percentage points when reported and
// ±25 points when not reported, age ±30 days when known and 180–730 days when unknown).
// Rows with unreported growth or an unknown age therefore carry a wider range, as they
// should: less is known about them. Every row also carries its main driver, the multiplier
// furthest from 1.0. Multipliers are stored to six decimals, so a reader who multiplies the
// shown figures lands within a few hundred dollars of the implied value. Each farm plan ends
// with its total cost — gas across every transaction in the plan, at the midpoint of the
// gas band for its chain, plus a $1 withdrawal fee — set against the protocol's implied
// value as a ratio, never as a promised return: implied value is the whole protocol's
// modelled value, not a farmer's payout, and an airdrop is never guaranteed. No protocol
// name is ever special-cased: the same function scores every row.

/** One protocol entry from the sealed snapshot: exactly its ten fields. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole sealed snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's tunable constants, as the dashboard states them. */
export interface ModelConstants {
  base_multiple: number;
  size_ref_usd: number;
  size_exponent: number;
  size_floor: number;
  size_cap: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  reach_per_chain: number;
  reach_max_chains: number;
}

export const MODEL: ModelConstants = {
  base_multiple: 0.25,
  size_ref_usd: 100_000_000,
  size_exponent: -0.2,
  size_floor: 0.45,
  size_cap: 1.5,
  growth_weight: 0.8,
  growth_floor: -50,
  growth_cap: 150,
  maturity_floor: 0.7,
  maturity_range: 0.5,
  maturity_days: 1095,
  unknown_age_days: 365,
  reach_per_chain: 0.05,
  reach_max_chains: 4,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-3';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** One farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: a ranked pre-token protocol with its model breakdown and farm plan. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  implied_range: { low: number; high: number };
  driver: string;
  driver_multiplier: number;
  model: {
    base_multiple: number;
    size_multiplier: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    reach_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
  /** Total farm cost in USD: gas across every transaction in the plan plus the $1 withdrawal fee (see farmCost). Capital is NOT part of it — it stays in the position. */
  farm_cost_usd: number;
}

/** A board row's compact form for data.js; the farm plan is generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  implied_low: number;
  implied_high: number;
  driver: string;
  driver_multiplier: number;
  size_multiplier: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  reach_multiplier: number;
  farm_cost_usd: number;
  watchlist: boolean;
}

/** A live-token protocol: it already trades, so the board shows the market's value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard renders: the board, the live set, and the model that scored them. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** The headline figures: watchlist size, board size, early rows, live protocols set aside. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/** Raised when the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** Clamp `value` into [`lo`, `hi`]. */
function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/** `value` when it is a finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Whole days from `from` to `to`, never below zero; null when either date is absent or unparseable. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Round to six decimals, so a reader who multiplies the shown multipliers lands within a few hundred dollars of the implied value. */
const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;

/**
 * The four multipliers and the implied value for one set of inputs under `model`.
 * `ageForModel` is already resolved: the protocol's known age in days, or the model's
 * unknown-age default when it has none. The formula is the model's whole claim: size has
 * diminishing returns, growth weighs most, a longer run with no token adds pent-up value,
 * and more chains widen the surface. Every scorer — the point estimate, the sensitivity
 * runs and the input-noise corners — goes through this one function, so they can never drift.
 */
function impliedBreakdown(
  tvlUsd: number,
  change7d: number | null,
  ageForModel: number,
  chainCount: number,
  model: ModelConstants,
): {
  implied: number;
  sizeMult: number;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  reachMult: number;
} {
  const sizeMult = clamp(Math.pow(tvlUsd / model.size_ref_usd, model.size_exponent), model.size_floor, model.size_cap);
  const growthPct = clamp(finite(change7d, 0), model.growth_floor, model.growth_cap);
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const maturityMult = model.maturity_floor + (clamp(ageForModel, 0, model.maturity_days) / model.maturity_days) * model.maturity_range;
  const extraChains = clamp(chainCount - 1, 0, model.reach_max_chains);
  const reachMult = 1 + extraChains * model.reach_per_chain;
  const implied = Math.max(1, Math.round(tvlUsd * model.base_multiple * sizeMult * growthMult * maturityMult * reachMult));
  return { implied, sizeMult, growthPct, growthMult, maturityMult, reachMult };
}

/**
 * The four multipliers and the implied value one protocol gets under `model`.
 */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
): {
  implied: number;
  sizeMult: number;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  reachMult: number;
  age: number | null;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const ageForModel = age ?? model.unknown_age_days;
  const out = impliedBreakdown(protocol.tvl_usd, protocol.change_7d, ageForModel, protocol.chains.length, model);
  return { ...out, age };
}

/** The sensitivity runs: the baseline model, each key weight shifted once, and the two combined extremes. The board's point estimate always uses MODEL; these runs only set each row's low/high range, so the baseline implied value always lies inside its own range. */
export const SENSITIVITY_RUNS: ModelConstants[] = [
  MODEL,
  { ...MODEL, growth_weight: 0.6 },
  { ...MODEL, growth_weight: 1.0 },
  { ...MODEL, unknown_age_days: 180 },
  { ...MODEL, unknown_age_days: 730 },
  { ...MODEL, size_exponent: -0.15 },
  { ...MODEL, size_exponent: -0.25 },
  { ...MODEL, growth_weight: 0.6, unknown_age_days: 180, size_exponent: -0.15 },
  { ...MODEL, growth_weight: 1.0, unknown_age_days: 730, size_exponent: -0.25 },
];

/** A row's implied value across the sensitivity runs: the lowest and the highest. */
export function sensitivityRange(protocol: SnapshotProtocol, asOf: string): { low: number; high: number } {
  let low = Number.POSITIVE_INFINITY;
  let high = 0;
  for (const run of SENSITIVITY_RUNS) {
    const value = impliedValue(protocol, asOf, run).implied;
    if (value < low) low = value;
    if (value > high) high = value;
  }
  return { low, high };
}

/**
 * Input-noise assumptions: how far the snapshot's own figures could be off, stated so a
 * reader can argue with them. TVL ±5% is a point-in-time measurement band — DefiLlama TVL
 * moves with prices and deposits within a day, so the figure on the snapshot date is not
 * exact to the dollar. Seven-day growth ±2 percentage points is ordinary reporting noise
 * when a figure is published; when nothing is reported at all the band is ±25 points
 * around the neutral 0% (half the model's growth floor), because a week with no report
 * could plausibly have moved that far, and pretending it is known would understate the
 * doubt. Age ±30 days covers listing-date rounding when the age is known; when it is
 * unknown the band is 180–730 days, the same plausible span the sensitivity runs sweep
 * for the unknown-age default, because the true age could sit anywhere in it. These bands
 * are deliberately wider for missing data: a row with unreported growth or an unknown age
 * gets a wider range, as it should.
 */
export const INPUT_NOISE = {
  tvl_pct: 0.05,
  growth_pp: 2,
  growth_unknown_pp: 25,
  age_days: 30,
  unknown_age_low_days: 180,
  unknown_age_high_days: 730,
};

/**
 * A row's implied value at the two input-noise corners, under the baseline model: every
 * input pushed low together, and every input pushed high together. Implied value rises
 * with TVL, with growth and with age (TVL × size still grows, since size only tapers it),
 * so the low corner is the row's low and the high corner its high. The point estimate
 * sits between them by construction.
 */
export function inputRange(protocol: SnapshotProtocol, asOf: string): { low: number; high: number } {
  const age = ageDays(asOf, protocol.listed_at);
  const lowChange = protocol.change_7d === null ? -INPUT_NOISE.growth_unknown_pp : protocol.change_7d - INPUT_NOISE.growth_pp;
  const highChange = protocol.change_7d === null ? INPUT_NOISE.growth_unknown_pp : protocol.change_7d + INPUT_NOISE.growth_pp;
  const lowAge = age === null ? INPUT_NOISE.unknown_age_low_days : Math.max(0, age - INPUT_NOISE.age_days);
  const highAge = age === null ? INPUT_NOISE.unknown_age_high_days : age + INPUT_NOISE.age_days;
  const low = impliedBreakdown(
    protocol.tvl_usd * (1 - INPUT_NOISE.tvl_pct),
    lowChange,
    lowAge,
    protocol.chains.length,
    MODEL,
  ).implied;
  const high = impliedBreakdown(
    protocol.tvl_usd * (1 + INPUT_NOISE.tvl_pct),
    highChange,
    highAge,
    protocol.chains.length,
    MODEL,
  ).implied;
  return { low, high };
}

/**
 * A row's implied range: the union of the parameter-sensitivity range and the input-noise
 * range. The baseline point estimate is one of the sensitivity runs, so it always lies
 * inside its own range.
 */
export function impliedRange(protocol: SnapshotProtocol, asOf: string): { low: number; high: number } {
  const param = sensitivityRange(protocol, asOf);
  const input = inputRange(protocol, asOf);
  return { low: Math.min(param.low, input.low), high: Math.max(param.high, input.high) };
}

/** Which multiplier moves a row's implied value most: the one furthest from 1, boost or compression alike. */
export function driverFor(sizeMult: number, growthMult: number, maturityMult: number, reachMult: number): { driver: string; multiplier: number } {
  const candidates: Array<[string, number]> = [
    ['size', sizeMult],
    ['growth', growthMult],
    ['maturity', maturityMult],
    ['reach', reachMult],
  ];
  let best: [string, number] = candidates[0]!;
  let bestDistance = 0;
  for (const [name, mult] of candidates) {
    const distance = Math.abs(Math.log(mult));
    if (distance > bestDistance) {
      bestDistance = distance;
      best = [name, mult];
    }
  }
  return { driver: best[0], multiplier: best[1] };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories that are a wrapped, staked or bridged product, not a protocol of their own. */
const WRAPPED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Cross Chain Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** A name carrying a whole word wrapped, staked or staking. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** A name beginning with an exchange's name. */
const EXCHANGE_LEAD = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a protocol is one the early radar may carry: pre-token and not a wrapped, staked or
 * bridged product of a token that already trades — the same honesty test the watchlist rule uses.
 */
export function isEarly(p: SnapshotProtocol): boolean {
  return (
    isPreToken(p) &&
    !WRAPPED_CATEGORIES.has(p.category ?? '') &&
    !VERSIONED.test(p.name) &&
    !WRAPPED_WORD.test(p.name) &&
    !EXCHANGE_LEAD.test(p.name)
  );
}

/** The snapshot's protocols indexed by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/**
 * The protocols the board ranks, strongest first, with ranks 1..n.
 * The watchlist is the floor: every one of its slugs is ranked. The early radar then adds every
 * pre-token protocol the watchlist leaves out that passes the honesty test, below the floor and
 * above it. A chosen protocol is never replaced by an early one.
 */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isEarly(p)) chosen.set(p.slug, p);
  }

  const scored = [...chosen.values()].map((p) => {
    const { implied, sizeMult, growthPct, growthMult, maturityMult, reachMult, age } = impliedValue(p, snapshot.as_of, model);
    return { p, implied, sizeMult, growthPct, growthMult, maturityMult, reachMult, age };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => {
    const range = impliedRange(s.p, snapshot.as_of);
    const driven = driverFor(s.sizeMult, s.growthMult, s.maturityMult, s.reachMult);
    const cost = farmCost(s.p, s.age);
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token',
      age_days: s.age,
      implied_value_usd: s.implied,
      implied_range: range,
      driver: driven.driver,
      driver_multiplier: round6(driven.multiplier),
      model: {
        base_multiple: model.base_multiple,
        size_multiplier: round6(s.sizeMult),
        growth_pct: s.growthPct,
        growth_multiplier: round6(s.growthMult),
        maturity_multiplier: round6(s.maturityMult),
        reach_multiplier: round6(s.reachMult),
        age_days: s.age,
      },
      farm_steps: farmSteps(s.p, s.age).map(stepText),
      farm_cost_usd: cost.total,
    };
  });
}

/** One step as a single string: its action, then its cost and time, within 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase when it names none. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** What one transaction costs on a chain: the chain's own gas, not a flat guess. */
export function gasOn(chain: string): string {
  const c = chain.toLowerCase();
  const table: Array<[string[], string]> = [
    [['ethereum'], '$4 to $8 of gas'],
    [['solana', 'sui', 'aptos', 'movement', 'seii'], 'about $0.01 of gas'],
    [['bnb chain', 'bsc'], 'about $0.20 of gas'],
    [['polygon', 'polygon zkevm'], 'about $0.05 of gas'],
    [['avalanche', 'fantom', 'cronos'], 'about $0.30 of gas'],
    [['tron'], 'about $1 of energy'],
    [['bitcoin', 'stacks', 'rootstock'], 'about $2 of network fees'],
    [['ton'], 'about $0.10 of gas'],
    [['near', 'cosmos', 'osmosis'], 'about $0.05 of gas'],
  ];
  for (const [names, cost] of table) {
    if (names.includes(c)) return cost;
  }
  return 'about $0.10 to $0.50 of gas';
}

/** The same gas table as gasOn, in dollars per transaction: the midpoint of the band gasOn states ($4–$8 on Ethereum is $6; "about $0.10 to $0.50" is $0.30). A midpoint is a planning figure, not a quote — gas moves with congestion — so the farm plan states the band's midpoint and the dashboard says so. */
const GAS_USD_TABLE: Array<[string[], number]> = [
  [['ethereum'], 6],
  [['solana', 'sui', 'aptos', 'movement', 'seii'], 0.01],
  [['bnb chain', 'bsc'], 0.2],
  [['polygon', 'polygon zkevm'], 0.05],
  [['avalanche', 'fantom', 'cronos'], 0.3],
  [['tron'], 1],
  [['bitcoin', 'stacks', 'rootstock'], 2],
  [['ton'], 0.1],
  [['near', 'cosmos', 'osmosis'], 0.05],
];

/** What one transaction costs in dollars on a chain: the midpoint of gasOn's band. */
export function gasUsd(chain: string): number {
  const c = chain.toLowerCase();
  for (const [names, cost] of GAS_USD_TABLE) {
    if (names.includes(c)) return cost;
  }
  return 0.3;
}

/** Round to whole cents, so gas totals never carry binary-float dust. */
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** A dollar amount as the farm plan writes it: whole dollars plain, cents to two places. */
function formatUsd(n: number): string {
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
}

/** A whole number with thousands separators, for the cost-to-implied ratio. */
function formatInt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

/** The $1 exchange withdrawal fee, the same $1 step 2 of the plan already charges. */
const WITHDRAWAL_FEE_USD = 1;

/**
 * A farm plan's total cost in dollars: gas across every transaction the plan itself
 * counts, plus the $1 withdrawal fee. Transactions counted: step 2 (moving USDC in),
 * step 3 (the main position), step 4 (the second action), one per week of the hold in
 * step 5 (ceil(holdDays / 7) — a 30-day hold is 5 weekly actions), and one exit
 * transaction to withdraw at the end. Steps 1, 6 and 7 move no money on-chain. Capital
 * is NOT a cost here: it stays in the position and comes back on withdrawal, so the
 * total is only what farming burns. The ratio against implied value is a scale check,
 * not a return: implied value is the whole protocol's modelled value, not a farmer's
 * payout, and an airdrop is never guaranteed.
 */
export function farmCost(p: SnapshotProtocol, age: number | null): {
  total: number;
  gasTotal: number;
  txCount: number;
  gasPerTx: number;
  weeklyTx: number;
} {
  const chain = chainOf(p);
  const gasPerTx = gasUsd(chain);
  const hold = holdDaysFor(age);
  const weeklyTx = Math.ceil(hold / 7);
  const txCount = 4 + weeklyTx;
  const gasTotal = round2(gasPerTx * txCount);
  const total = round2(gasTotal + WITHDRAWAL_FEE_USD);
  return { total, gasTotal, txCount, gasPerTx, weeklyTx };
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** One category's core action, built from the protocol's own record. */
type ActionBuilder = (name: string, capital: number, chain: string) => string;

/** The category table, in the order it is tried: the first key that matches decides the action. */
const ACTION_TABLE: Array<{ keys: string[]; build: ActionBuilder }> = [
  { keys: ['lend', 'cdp', 'collateral'], build: (n, cap, ch) => `Supply $${cap} of USDC to ${n} on ${ch} and keep the position open.` },
  { keys: ['dex', 'yield', 'leveraged farm'], build: (n, cap, ch) => `Provide $${cap} of liquidity to ${n}'s main pool on ${ch} and keep the position open.` },
  { keys: ['bridge'], build: (n, cap, ch) => `Bridge $${cap} of USDC to ${ch} through ${n} and use the bridged funds in its app.` },
  { keys: ['staking', 'restak'], build: (n, cap, ch) => `Stake $${cap} of the chain's staking asset through ${n} and keep the receipt.` },
  { keys: ['perpetual', 'derivative', 'options'], build: (n, cap, ch) => `Deposit $${cap} of USDC as margin on ${n} and open one small hedge.` },
  { keys: ['prediction'], build: (n, cap, ch) => `Fund $${cap} and place one market position on ${n}.` },
  { keys: ['curator', 'allocator', 'risk'], build: (n, cap, ch) => `Deposit $${cap} into a ${n} vault on ${ch} and keep the shares.` },
  { keys: ['stable'], build: (n, cap, ch) => `Mint or deposit $${cap} of the stable asset through ${n} on ${ch}.` },
  { keys: ['rwa'], build: (n, cap, ch) => `Mint $${cap} of the protocol's yield asset on ${ch} and hold it.` },
  { keys: ['insurance'], build: (n, cap, ch) => `Buy $${cap} of cover from ${n} on ${ch} and keep the policy.` },
  { keys: ['launchpad'], build: (n, cap, ch) => `Commit $${cap} of USDC to ${n}'s next launch on ${ch} and hold the allocation.` },
  { keys: ['farm'], build: (n, cap, ch) => `Stake $${cap} of LP tokens in ${n}'s farm on ${ch} and keep the position.` },
  { keys: ['synthetic', 'basis'], build: (n, cap, ch) => `Mint $${cap} of the synthetic asset on ${n} and hold the position.` },
  { keys: ['liquid'], build: (n, cap, ch) => `Deposit $${cap} of the liquid asset through ${n} on ${ch} and keep the receipt.` },
  { keys: ['nft'], build: (n, cap, ch) => `List or buy one item through ${n} on ${ch} for about $${cap} and keep the receipt.` },
  { keys: ['payment'], build: (n, cap, ch) => `Pay $${cap} through ${n} on ${ch} and keep the receipt.` },
];

/** The category's core action, in words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  for (const entry of ACTION_TABLE) {
    if (entry.keys.some((k) => c.includes(k))) return entry.build(p.name, capital, chain);
  }
  return `Deposit $${capital} of USDC into ${p.name} on ${chain} and keep the position open.`;
}

/** The second-action table, tried in order: the first key that matches decides the action. */
const SECOND_ACTION_TABLE: Array<{ keys: string[]; build: (name: string, small: number, chain: string) => string }> = [
  { keys: ['lend', 'cdp', 'collateral'], build: (n, s) => `Borrow $${s} against the deposit on ${n} and repay it the same week, so the wallet shows both sides.` },
  { keys: ['dex', 'yield', 'leveraged farm'], build: (n, s, ch) => `Swap $${s} through ${n} on ${ch} once, so the wallet shows a trade as well as liquidity.` },
  { keys: ['perpetual', 'derivative', 'options'], build: (n, s) => `Close the hedge on ${n} and open a second one for $${s}, so the wallet shows repeat use.` },
  { keys: ['prediction'], build: (n, s) => `Settle the first market on ${n} and place a second $${s} position.` },
  { keys: ['curator', 'allocator', 'risk'], build: (n, s, ch) => `Move $${s} into a second ${n} vault on ${ch} so the wallet shows two vaults.` },
  { keys: ['stable'], build: (n, s) => `Redeem $${s} of the stable asset through ${n} and re-mint it, so the wallet shows a full cycle.` },
  { keys: ['staking', 'restak'], build: (n, s) => `Delegate a second $${s} stake through ${n} so the wallet shows repeat staking.` },
  { keys: ['rwa'], build: (n, s) => `Buy a second $${s} of the yield asset on ${n} and hold it beside the first.` },
  { keys: ['launchpad'], build: (n) => `Vote on ${n}'s next launch with the allocation, if it opens a vote.` },
];

/**
 * The category's second qualifying action: a different product of the same protocol, so the
 * wallet shows breadth, not a single deposit.
 */
function secondActionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const small = Math.max(10, Math.round(capital / 5));
  for (const entry of SECOND_ACTION_TABLE) {
    if (entry.keys.some((k) => c.includes(k))) return entry.build(p.name, small, chain);
  }
  return `Do one more action on ${p.name} for $${small} — a swap, a vote or a second deposit — so the wallet shows repeat use.`;
}

/**
 * The category's main risk, in words a farmer can weigh before moving money. The table is
 * tried in the same order as the action table: the first key that matches decides the risk.
 * A category no key matches gets the plain contract risk.
 */
const RISK_TABLE: Array<{ keys: string[]; risk: string }> = [
  { keys: ['lend', 'cdp', 'collateral'], risk: 'a falling collateral price can liquidate the position' },
  { keys: ['dex', 'yield', 'leveraged farm', 'farm'], risk: 'liquidity positions can lose value to impermanent loss' },
  { keys: ['bridge'], risk: 'a bridge exploit or delay can strand the funds' },
  { keys: ['staking', 'restak'], risk: 'staked funds can be locked or slashed' },
  { keys: ['perpetual', 'derivative', 'options'], risk: 'leverage can liquidate the margin' },
  { keys: ['prediction'], risk: 'a market can resolve against the position' },
  { keys: ['stable'], risk: 'a stable asset can depeg' },
  { keys: ['rwa'], risk: 'the off-chain asset can default' },
];

/** The category's main risk, in words a farmer can weigh. */
function riskFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  for (const entry of RISK_TABLE) {
    if (entry.keys.some((k) => c.includes(k))) return entry.risk;
  }
  return 'the contract could be exploited';
}

/**
 * A protocol's farm plan: eight steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age), never from a hand-written list of names.
 * Step 7 states the plan's risk and when to skip it outright; step 8 totals what the plan burns
 * (gas plus the withdrawal fee, capital excluded) and sets it against the protocol's implied value
 * as a ratio — a scale check, never a promised return.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasOn(chain);
  const action = actionFor(p, capital, chain);
  const second = secondActionFor(p, capital, chain);
  const small = Math.max(10, Math.round(capital / 5));
  const floor = Math.max(10, Math.round(capital / 2));
  const cost = farmCost(p, age);
  const implied = impliedBreakdown(p.tvl_usd, p.change_7d, age ?? MODEL.unknown_age_days, p.chains.length, MODEL).implied;
  const perDollar = Math.max(1, Math.round(implied / cost.total));
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'nothing to create, and never pay anyone to set it up',
      time: '5 minutes',
    },
    {
      text: `Buy $${capital} of USDC on an exchange and withdraw it to the fresh wallet on ${chain}, checking the address twice before you send it.`,
      cost: `about $1 of withdrawal fee and ${gas} on ${chain}`,
      time: '15 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and ${gas}`,
      time: '15 minutes to set up',
    },
    {
      text: second,
      cost: `about $${small} of capital and ${gas}`,
      time: '10 minutes',
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote, and keep the position above $${floor}.`,
      cost: `${gas} a week`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot, and open the protocol's own points or rewards page once a week to check it is tracked.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Know the risks: ${riskFor(p)}. An airdrop is never guaranteed. Skip this protocol if the gas and fees cost more than the value you expect, or if its TVL is held by a few wallets. Before you withdraw, claim only from the link the protocol itself publishes, never from a direct message, and write the wallet, the dates and every transaction hash in a farm log.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `All in, this plan costs about ${formatUsd(cost.total)} — ${formatUsd(cost.gasTotal)} of gas across ${cost.txCount} transactions at about ${formatUsd(cost.gasPerTx)} each on ${chain}, plus a $1 withdrawal fee — on top of ${formatUsd(capital)} of capital that stays in the position. That is about $1 of cost for every $${formatInt(perDollar)} of this protocol's implied value, but implied value is the whole protocol's modelled value, not your payout, and an airdrop is never guaranteed, so only farm if you can afford to lose the fees.`,
      cost: `about ${formatUsd(cost.total)} all in`,
      time: `counted across the ${hold}-day hold`,
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow, watchlist: boolean): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    implied_low: row.implied_range.low,
    implied_high: row.implied_range.high,
    driver: row.driver,
    driver_multiplier: row.driver_multiplier,
    size_multiplier: row.model.size_multiplier,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    reach_multiplier: row.model.reach_multiplier,
    farm_cost_usd: row.farm_cost_usd,
    watchlist,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map((r) => radarRow(r, snapshot.watchlist.includes(r.slug))),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/**
 * Why a board is not one the gate will take, or null when it is fine: coverage, ranks, order,
 * one shared implied value, and farm steps.
 */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (r.implied_value_usd < r.implied_range.low || r.implied_value_usd > r.implied_range.high) return `${r.slug} has implied value outside its range`;
    if (!(r.farm_cost_usd > 0)) return `${r.slug} has farm cost ${r.farm_cost_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
