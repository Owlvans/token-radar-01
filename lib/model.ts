// The token radar's model: one sealed snapshot of the protocol universe in, one ranked board out.
//
// What the board is. The snapshot's watchlist (40 protocols that record no token and clear the
// house's $50M floor) is the floor, never the ceiling: the board ranks every watchlist protocol
// plus the radar's early finds — the other protocols that record no token, down to the snapshot's
// own $5M floor, leaving out the wrapped, staked and bridged products of tokens that already
// trade, the versioned pools and the exchange products, by the same tests the house's watchlist
// rule states. Protocols whose token already trades are never ranked: they are the reference
// set, the market's own evidence, and the dashboard shows them apart with their real values.
//
// What a token would be worth. A launched token's market value per dollar of TVL is observable
// in the snapshot itself: the 144 tokenized protocols carry both figures. The model prices a
// pre-token protocol from that evidence, never from a list of names:
//
//   multiple   the market-cap/TVL multiple of its peers, read at three levels — its category,
//              its family of like categories, the whole reference set — each level shrunk
//              toward the one above it with a prior weight of 4. The shrinkage is geometric
//              (in log space), because a multiple is a ratio: one peer trading at 400 times
//              its TVL (Rain, the prediction markets' only traded reference) must move a
//              category's price by a factor, not by hundreds of turns, and a category with
//              one or two traded peers borrows most of its multiple from its family either
//              way. Category ratios are winsorized at their 5th and 95th percentiles when
//              the category has 10 or more references. Only references with a positive
//              market cap price the model: a record of $0 is no evidence of value.
//   base       = tvl_usd x multiple
//   age        a protocol that has run longer with no token is priced up, gently and with a
//              cap: age_f = clamp(0.85 + 0.10 x ln(1 + years), 0.85, 1.25), years counted to
//              the snapshot's own as_of date. No listing date recorded: the factor is a
//              neutral 1.00 and the row is flagged — missing data is neither rewarded nor
//              punished, the one rule both this factor and the momentum factor follow,
//              and the row's confidence is capped by the gap.
//   momentum   the seven-day TVL change, damped because a week of TVL is noisy:
//              mom_f = clamp(1 + 0.35 x change_7d / 100, 0.85, 1.20); unreported: 1.00.
//   reach      each extra chain is distribution the TVL figure alone understates:
//              chain_f = clamp(1 + 0.02 x (chains - 1), 1.00, 1.08).
//   implied    = round(base x age_f x mom_f x chain_f), a whole dollar figure.
//
// Implied value is what the token would be worth if it launched on today's record. The model
// says nothing about whether or when a launch comes, and no protocol's name is special-cased:
// one function prices every row. Rows sort by the rounded implied value, then TVL, then slug,
// so implied value never rises as rank ascends, by construction. Every row carries a confidence
// tier — High when its category has 10 or more traded references and both its listing date and
// its seven-day change are recorded, Medium when its category has 3 or more references or both
// fields are present, Low otherwise — and the dashboard's detail view shows the tier, the
// multiple and the level it came from, and every factor, so a reader can see exactly how much
// evidence stands behind each number.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
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

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's version label, named on the dashboard. */
export const MODEL_VERSION = 'radar-2';

/** The model's stated constants: the dashboard prints them and the detail view applies them. */
export const PRIOR_WEIGHT = 4;
export const WINSOR_MIN_REFS = 10;
export const AGE_BASE = 0.85;
export const AGE_COEF = 0.1;
export const AGE_MIN = 0.85;
export const AGE_MAX = 1.25;
export const MOM_WEIGHT = 0.35;
export const MOM_MIN = 0.85;
export const MOM_MAX = 1.2;
export const CHAIN_STEP = 0.02;
export const CHAIN_MAX = 1.08;

/** The board's own floor for early finds: the snapshot's floor, every protocol it carries. */
export const EARLY_TVL_MIN = 5_000_000;
/** The board never carries more rows than this. */
export const BOARD_MAX = 220;

/**
 * Families: groups of categories alike enough to share pricing evidence. A category with few
 * traded peers borrows its family's multiple; the map names every category the snapshot uses.
 */
export const FAMILY_OF: Record<string, string> = {
  'Risk Curators': 'Vaults & curators',
  'Onchain Capital Allocator': 'Vaults & curators',
  'Yield Aggregator': 'Vaults & curators',
  Yield: 'Vaults & curators',
  'Liquidity Manager': 'Vaults & curators',
  Farm: 'Vaults & curators',
  'Leveraged Farming': 'Vaults & curators',
  Lending: 'Lending & credit',
  CDP: 'Lending & credit',
  'CDP Manager': 'Lending & credit',
  'Collateral Markets': 'Lending & credit',
  'Collateral Management': 'Lending & credit',
  'Uncollateralized Lending': 'Lending & credit',
  Dexs: 'Trading & derivatives',
  Derivatives: 'Trading & derivatives',
  Options: 'Trading & derivatives',
  'Options Vault': 'Trading & derivatives',
  'Interest Rate Derivatives': 'Trading & derivatives',
  Synthetics: 'Trading & derivatives',
  'Prediction Market': 'Trading & derivatives',
  'Basis Trading': 'Trading & derivatives',
  RWA: 'Real assets & stablecoins',
  'Algo-Stables': 'Real assets & stablecoins',
  'Dual-Token Stablecoin': 'Real assets & stablecoins',
  'Stablecoin Issuer': 'Real assets & stablecoins',
  'Stablecoin Wrapper': 'Real assets & stablecoins',
  'Reserve Currency': 'Real assets & stablecoins',
  'Anchor BTC': 'Real assets & stablecoins',
  'Decentralized BTC': 'Real assets & stablecoins',
  'Liquid Staking': 'Staking & restaking',
  'Liquid Restaking': 'Staking & restaking',
  Restaking: 'Staking & restaking',
  'Staking Pool': 'Staking & restaking',
  'Restaked BTC': 'Staking & restaking',
  Bridge: 'Bridges & interoperability',
  'Canonical Bridge': 'Bridges & interoperability',
  'Cross Chain Bridge': 'Bridges & interoperability',
  Chain: 'Infrastructure & services',
  Payments: 'Infrastructure & services',
  'Token Locker': 'Infrastructure & services',
  Launchpad: 'Infrastructure & services',
  Indexes: 'Infrastructure & services',
  'Governance Incentives': 'Infrastructure & services',
  'NFT Marketplace': 'Infrastructure & services',
  'OTC Marketplace': 'Infrastructure & services',
  'Crypto Card Issuer': 'Infrastructure & services',
  DOR: 'Infrastructure & services',
  Privacy: 'Infrastructure & services',
  'AI Agents': 'Infrastructure & services',
  'Decentralized AI': 'Infrastructure & services',
  Insurance: 'Infrastructure & services',
  CeDeFi: 'Infrastructure & services',
  CEX: 'Exchanges',
};

/** Which multiple priced a row, and how much evidence stood behind it. */
export type MultipleLevel = 'category' | 'family' | 'global';
export type Confidence = 'High' | 'Medium' | 'Low';

/** One level of the reference evidence: how many traded peers, their median, the shrunk multiple. */
export interface RefLevel {
  refs: number;
  median: number | null;
  multiple: number;
}

/** The reference set's evidence, by category and by family, plus the global figures. */
export interface RefStats {
  global: RefLevel;
  categories: Record<string, RefLevel & { family: string | null }>;
  families: Record<string, RefLevel>;
}

/** A board row's pricing breakdown, carried into board.json so the number can be checked. */
export interface RowModel {
  multiple: number;
  multiple_level: MultipleLevel;
  category_refs: number;
  family: string | null;
  age_factor: number;
  momentum_factor: number;
  chain_factor: number;
  confidence: Confidence;
}

/** One row of board.json: the ranked board's row. */
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
  model: RowModel;
  farm_steps: string[];
}

/** The dashboard's view of one board row: the row, its breakdown and its farm plan. */
export interface RadarRow extends BoardRow {
  watchlist: boolean;
}

/** A protocol whose token already trades: the market's own value, never a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  symbol: string | null;
  category: string | null;
  family: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number;
  ratio: number | null;
  change_7d: number | null;
}

/** Everything the dashboard renders: the board, the reference set, and the evidence behind both. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  constants: {
    prior_weight: number;
    winsor_min_refs: number;
    age_base: number;
    age_coef: number;
    age_min: number;
    age_max: number;
    mom_weight: number;
    mom_min: number;
    mom_max: number;
    chain_step: number;
    chain_max: number;
    early_tvl_min: number;
  };
  stats: RefStats;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const bySlugAsc = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** A whole day count from `listedAt` to `asOf`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a non-empty list: the middle value, or the mean of the two middle ones. */
function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** A percentile of a sorted list, by linear interpolation between the closest ranks. */
function percentile(sorted: number[], q: number): number {
  if (sorted.length === 1) return sorted[0]!;
  const at = q * (sorted.length - 1);
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (at - lo);
}

/**
 * The reference evidence: every protocol whose token already trades at a positive market cap
 * and whose TVL is positive contributes its market-cap/TVL ratio. Category medians are computed
 * from winsorized ratios when the category has WINSOR_MIN_REFS or more references; family and
 * global medians from the raw ratios of their members. Each level's multiple shrinks the level's
 * own median toward the level above with PRIOR_WEIGHT.
 */
/** Shrink a level's median toward its parent multiple, geometrically, with PRIOR_WEIGHT. */
function shrink(n: number, med: number, parent: number): number {
  return Math.exp((n * Math.log(med) + PRIOR_WEIGHT * Math.log(parent)) / (n + PRIOR_WEIGHT));
}

export function referenceStats(snapshot: Snapshot): RefStats {
  const refs = snapshot.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
  const ratio = (p: SnapshotProtocol): number => p.mcap_usd! / p.tvl_usd;

  const globalMedian = median(refs.map(ratio));
  const global: RefLevel = { refs: refs.length, median: round4(globalMedian), multiple: round4(globalMedian) };

  const famRatios = new Map<string, number[]>();
  for (const p of refs) {
    const fam = p.category === null ? null : (FAMILY_OF[p.category] ?? null);
    if (fam === null) continue;
    const list = famRatios.get(fam) ?? [];
    list.push(ratio(p));
    famRatios.set(fam, list);
  }
  const families: Record<string, RefLevel> = {};
  for (const [fam, list] of [...famRatios.entries()].sort((a, b) => bySlugAsc(a[0], b[0]))) {
    const med = median(list);
    families[fam] = {
      refs: list.length,
      median: round4(med),
      multiple: round4(shrink(list.length, med, globalMedian)),
    };
  }

  const catRatios = new Map<string, number[]>();
  for (const p of refs) {
    if (p.category === null) continue;
    const list = catRatios.get(p.category) ?? [];
    list.push(ratio(p));
    catRatios.set(p.category, list);
  }
  const categories: Record<string, RefLevel & { family: string | null }> = {};
  for (const [cat, list] of [...catRatios.entries()].sort((a, b) => bySlugAsc(a[0], b[0]))) {
    const fam = FAMILY_OF[cat] ?? null;
    let used = list;
    if (list.length >= WINSOR_MIN_REFS) {
      const sorted = [...list].sort((a, b) => a - b);
      const lo = percentile(sorted, 0.05);
      const hi = percentile(sorted, 0.95);
      used = list.map((r) => clamp(r, lo, hi));
    }
    const med = median(used);
    const parent = fam !== null && families[fam] !== undefined ? families[fam]!.multiple : globalMedian;
    categories[cat] = {
      refs: list.length,
      median: round4(med),
      multiple: round4(shrink(list.length, med, parent)),
      family: fam,
    };
  }
  return { global, categories, families };
}

/** The multiple that prices one protocol, and the level it came from. */
export function multipleFor(p: SnapshotProtocol, stats: RefStats): { multiple: number; level: MultipleLevel; categoryRefs: number; family: string | null } {
  const fam = p.category === null ? null : (FAMILY_OF[p.category] ?? null);
  if (p.category !== null) {
    const cat = stats.categories[p.category];
    if (cat !== undefined && cat.refs >= 1) {
      return { multiple: cat.multiple, level: 'category', categoryRefs: cat.refs, family: fam };
    }
  }
  if (fam !== null) {
    const f = stats.families[fam];
    if (f !== undefined && f.refs >= 1) {
      const cat = p.category !== null ? stats.categories[p.category] : undefined;
      return { multiple: f.multiple, level: 'family', categoryRefs: cat?.refs ?? 0, family: fam };
    }
  }
  return { multiple: stats.global.multiple, level: 'global', categoryRefs: 0, family: fam };
}

/** The three adjustment factors and the implied value one protocol gets. */
export function impliedValue(
  p: SnapshotProtocol,
  asOf: string,
  stats: RefStats,
): { implied: number; model: RowModel; age: number | null } {
  const { multiple, level, categoryRefs, family } = multipleFor(p, stats);
  const age = ageDays(asOf, p.listed_at);
  const years = age === null ? 0 : age / 365;
  const ageF = age === null ? 1 : clamp(AGE_BASE + AGE_COEF * Math.log(1 + years), AGE_MIN, AGE_MAX);
  const momF = p.change_7d === null ? 1 : clamp(1 + (MOM_WEIGHT * p.change_7d) / 100, MOM_MIN, MOM_MAX);
  const chainF = clamp(1 + CHAIN_STEP * Math.max(0, p.chains.length - 1), 1, CHAIN_MAX);
  const implied = Math.max(1, Math.round(p.tvl_usd * multiple * ageF * momF * chainF));
  const bothFields = p.listed_at !== null && p.change_7d !== null;
  const confidence: Confidence = categoryRefs >= 10 && bothFields ? 'High' : categoryRefs >= 3 || bothFields ? 'Medium' : 'Low';
  return {
    implied,
    age,
    model: {
      multiple,
      multiple_level: level,
      category_refs: categoryRefs,
      family,
      age_factor: round4(ageF),
      momentum_factor: round4(momF),
      chain_factor: round4(chainF),
      confidence,
    },
  };
}

/** Whether a protocol records no token at all: no market cap, no CoinGecko id, no symbol. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** A whole word wrapped, staked or staking in a name marks a product of a token that trades. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
/** Categories that are products of another protocol or of an exchange, per the house's rule. */
const PRODUCT_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
/** Names that begin with an exchange's name are that exchange's products. */
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/**
 * The house's own tests for a product of a token that already trades, as the watchlist rule
 * states them: a product category, a versioned name, a wrapped/staked word, an exchange's name.
 */
export function isProductOfTraded(p: SnapshotProtocol): boolean {
  if (p.category !== null && PRODUCT_CATEGORIES.has(p.category)) return true;
  if (VERSIONED.test(p.name)) return true;
  if (WRAPPED_WORD.test(p.name)) return true;
  return EXCHANGE_PREFIXES.some((x) => p.name.startsWith(x));
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot): BoardRow[] {
  const stats = referenceStats(snapshot);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug on it is a row, whatever its other marks.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early finds: the other protocols that record no token, down to the snapshot's floor,
  // leaving out the products of tokens that already trade, strongest TVL first.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isPreToken(p) && p.tvl_usd >= EARLY_TVL_MIN && !isProductOfTraded(p))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || bySlugAsc(a.slug, b.slug));
  for (const p of early) {
    if (chosen.size >= BOARD_MAX) break;
    chosen.set(p.slug, p);
  }
  const scored = [...chosen.values()].map((p) => ({ p, ...impliedValue(p, snapshot.as_of, stats) }));
  scored.sort((a, b) => b.implied - a.implied || b.p.tvl_usd - a.p.tvl_usd || bySlugAsc(a.p.slug, b.p.slug));
  return scored.map((s, i) => ({
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
    model: s.model,
    farm_steps: farmSteps(s.p, s.age),
  }));
}

// ---------------------------------------------------------------- farm plans

/** Chains whose gas is priced at the Ethereum tier, the major-L2 tier, or the low-fee tier. */
const L2_CHAINS = new Set([
  'Arbitrum', 'Arbitrum Nova', 'Optimism', 'Base', 'Polygon', 'Polygon zkEVM', 'zkSync Era',
  'Linea', 'Scroll', 'Mantle', 'Blast', 'Mode', 'Starknet', 'Taiko', 'Unichain', 'Ink',
  'Soneium', 'World Chain', 'Zircuit', 'Fraxtal', 'Metis',
]);
const LOW_FEE_CHAINS = new Set(['BSC', 'Avalanche', 'Solana', 'Tron']);

/** What one transaction costs on a chain, in the words a plan states. */
export function gasCost(chain: string): string {
  if (chain === 'Ethereum') return '$10-30 of gas';
  if (L2_CHAINS.has(chain)) return '$1-5 of gas';
  if (LOW_FEE_CHAINS.has(chain)) return 'under $1 of gas';
  return '$1-5 of gas (typical for the chain)';
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
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

type FarmGroup =
  | 'lending' | 'cdp' | 'curator' | 'yield' | 'dex' | 'derivatives' | 'basis' | 'rwa'
  | 'chain' | 'payments' | 'staking' | 'insurance' | 'stable' | 'index' | 'launchpad'
  | 'privacy' | 'ai' | 'prediction' | 'generic';

/** The farm group a category belongs to: the shape of the work a launch rewards. */
function farmGroup(category: string | null): FarmGroup {
  switch (category) {
    case 'Lending':
    case 'Uncollateralized Lending':
    case 'Collateral Markets':
    case 'Collateral Management':
      return 'lending';
    case 'CDP':
    case 'CDP Manager':
      return 'cdp';
    case 'Risk Curators':
    case 'Onchain Capital Allocator':
      return 'curator';
    case 'Yield':
    case 'Yield Aggregator':
    case 'Liquidity Manager':
    case 'Farm':
    case 'Leveraged Farming':
      return 'yield';
    case 'Dexs':
      return 'dex';
    case 'Derivatives':
    case 'Options':
    case 'Options Vault':
    case 'Interest Rate Derivatives':
    case 'Synthetics':
      return 'derivatives';
    case 'Basis Trading':
      return 'basis';
    case 'RWA':
      return 'rwa';
    case 'Chain':
      return 'chain';
    case 'Payments':
    case 'Crypto Card Issuer':
      return 'payments';
    case 'Staking Pool':
    case 'Restaking':
    case 'Liquid Staking':
    case 'Liquid Restaking':
    case 'Restaked BTC':
      return 'staking';
    case 'Insurance':
      return 'insurance';
    case 'Stablecoin Issuer':
    case 'Algo-Stables':
    case 'Dual-Token Stablecoin':
    case 'Stablecoin Wrapper':
    case 'Reserve Currency':
    case 'Anchor BTC':
    case 'Decentralized BTC':
      return 'stable';
    case 'Indexes':
      return 'index';
    case 'Launchpad':
      return 'launchpad';
    case 'Privacy':
      return 'privacy';
    case 'AI Agents':
    case 'Decentralized AI':
      return 'ai';
    case 'Prediction Market':
      return 'prediction';
    default:
      return 'generic';
  }
}

/** The group's core action and its follow-up, in the words a farmer can follow. */
function groupActions(group: FarmGroup, name: string, chain: string, capital: number): { core: string; second: string } {
  switch (group) {
    case 'lending':
      return {
        core: `Supply $${capital} of USDC to ${name} on ${chain} and keep the supply position open.`,
        second: `Borrow a small amount, about a fifth of the supply, against the position, hold it for a week, then repay it in full, so the record shows both sides of the market.`,
      };
    case 'cdp':
      return {
        core: `Open a vault in ${name} on ${chain}: deposit $${capital} of collateral and mint the protocol's stablecoin against it.`,
        second: `Keep the vault's collateral ratio comfortably above its minimum: check it once a week and top up or repay whenever it drifts toward the line.`,
      };
    case 'curator':
      return {
        core: `Deposit $${capital} of USDC into a vault that ${name} curates on ${chain} and keep the vault shares in the wallet.`,
        second: `Once a month, read the vault's risk dashboard and the curator's published notes, and move the deposit if the vault's markets or caps change materially.`,
      };
    case 'yield':
      return {
        core: `Deposit $${capital} of USDC into ${name}'s main vault on ${chain} and keep the vault shares in the wallet.`,
        second: `Compound the yield back into the same vault once a month instead of withdrawing it, so the position and its record keep growing.`,
      };
    case 'dex':
      return {
        core: `Provide $${capital} of liquidity to a main pool of ${name} on ${chain}, a stablecoin pair where one exists, and keep the position open.`,
        second: `Make two or three ordinary swaps a week through ${name}'s own interface, sized the way a regular user would size them.`,
      };
    case 'derivatives':
      return {
        core: `Deposit $${capital} of USDC as margin on ${name} and open one small position hedged against a spot holding of the same asset.`,
        second: `Roll or re-open the hedge once a week and keep every position small: the aim is a real trading record, not a profit target.`,
      };
    case 'basis':
      return {
        core: `Deposit $${capital} of USDC into ${name}'s basis vault on ${chain} and keep the shares while the basis trade runs.`,
        second: `Leave the deposit through a full funding cycle and claim each distribution from the protocol's own page.`,
      };
    case 'rwa':
      return {
        core: `Mint or buy $${capital} of ${name}'s yield-bearing asset on ${chain}, completing any eligibility check the protocol itself asks for first, and hold the asset.`,
        second: `Hold the asset across a full distribution cycle and claim each distribution from the protocol's own page.`,
      };
    case 'chain':
      return {
        core: `Bridge $${capital} of USDC to ${name} and keep a working balance on the chain.`,
        second: `Use two or three of ${name}'s native apps each week — a swap, a lend, a payment — so the wallet reads as a resident of the chain, not a passer-by.`,
      };
    case 'payments':
      return {
        core: `Open a ${name} account, fund it with $${capital} and make real payments or transfers through it every week.`,
        second: `Keep a working balance in the account between payments, so the usage reads as continuous rather than a single spike.`,
      };
    case 'staking':
      return {
        core: `Stake $${capital} of the chain's staking asset through ${name} on ${chain} and keep the staking position.`,
        second: `Claim the staking rewards once a month and re-stake them into the same position.`,
      };
    case 'insurance':
      return {
        core: `Stake $${capital} into ${name}'s cover pools on ${chain}, or buy cover on an asset the wallet actually holds, and keep the position.`,
        second: `Renew or extend the cover before it lapses, so the record runs unbroken.`,
      };
    case 'stable':
      return {
        core: `Mint $${capital} of ${name}'s stable asset against collateral on ${chain}, or deposit $${capital} of USDC for it, and hold the asset.`,
        second: `Put the stable asset to work in one partner app, a lend or a pool, so it circulates from the wallet instead of sitting idle.`,
      };
    case 'index':
      return {
        core: `Buy $${capital} of ${name}'s index product on ${chain} and hold it.`,
        second: `Rebalance alongside the index about once a quarter rather than trading in and out of it.`,
      };
    case 'launchpad':
      return {
        core: `Register the wallet on ${name} and complete one small participation it offers on ${chain}, of about $${capital}.`,
        second: `Keep the participated position and follow ${name}'s own announcements for the next round.`,
      };
    case 'privacy':
      return {
        core: `Make a shielded deposit of $${capital} into ${name} on ${chain} and hold the private balance.`,
        second: `Make one private transfer a month, so the wallet's usage is real and recurring.`,
      };
    case 'ai':
      return {
        core: `Fund the wallet with $${capital} of working balance and run real tasks through ${name}'s service on ${chain}.`,
        second: `Repeat the usage every week: a steady record counts for more than one large burst.`,
      };
    case 'prediction':
      return {
        core: `Fund the wallet with $${capital} and take one small position in an active market on ${name}.`,
        second: `Settle each position at its resolution and take a new one, so the record spans several markets.`,
      };
    default:
      return {
        core: `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`,
        second: `Make one qualifying action a week — a deposit, a swap, a vote or a claim check — always from the same wallet.`,
      };
  }
}

/**
 * A protocol's farm plan: five steps, each an action with its cost and its time. The plan is
 * derived from the protocol's own record (category, chains, TVL, age) and framed as the work
 * that grows the protocol's TVL and usage — the activity a launch rewards. It names no points
 * program and promises no airdrop: no such fact is in the snapshot.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): string[] {
  const chain = chainOf(p);
  const gas = gasCost(chain);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const { core, second } = groupActions(farmGroup(p.category), p.name, chain, capital);
  const steps = [
    `Set up a fresh wallet for ${p.name} and fund it on ${chain}: keep the seed phrase offline and hold enough of the chain's gas token for the steps below. Cost: ${gas} to fund the wallet and make the first transaction. Time: about 10 minutes.`,
    `${core} Cost: $${capital} of capital, plus ${gas} for the transaction. Time: about 15 minutes to set up.`,
    `${second} Cost: ${gas} for each action, and no new capital. Time: about 10 minutes a time.`,
    `Keep the position open for at least ${hold} days so the activity spans several weekly snapshots, and repeat one small qualifying action each week from the same wallet. Cost: the $${capital} stays in the position, plus ${gas} a week. Time: ${hold} days, about 10 minutes a week.`,
    `Each week, check ${p.name}'s own site and announcements for a points or rewards page and follow only links published there; never pay a fee to claim and never sign a message you did not start. Keep a log of the wallet, the dates and every transaction, so the position can be repeated or unwound. Cost: nothing. Time: 10 minutes a week.`,
  ];
  return steps.map((s) => (s.length > 600 ? `${s.slice(0, 596)}...` : s));
}

// ---------------------------------------------------------------- the reference set

/** The protocols whose token already trades, by market cap: the market's own values. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => p.mcap_usd !== null)
    .sort((a, b) => b.mcap_usd! - a.mcap_usd! || b.tvl_usd - a.tvl_usd || bySlugAsc(a.slug, b.slug))
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      symbol: p.symbol,
      category: p.category,
      family: p.category === null ? null : (FAMILY_OF[p.category] ?? null),
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd!,
      ratio: p.tvl_usd > 0 ? round4(p.mcap_usd! / p.tvl_usd) : null,
      change_7d: p.change_7d,
    }));
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot);
  const stats = referenceStats(snapshot);
  const live = liveRows(snapshot);
  const onWatchlist = new Set(snapshot.watchlist);
  const rows: RadarRow[] = board.map((r) => ({ ...r, watchlist: onWatchlist.has(r.slug) }));
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    constants: {
      prior_weight: PRIOR_WEIGHT,
      winsor_min_refs: WINSOR_MIN_REFS,
      age_base: AGE_BASE,
      age_coef: AGE_COEF,
      age_min: AGE_MIN,
      age_max: AGE_MAX,
      mom_weight: MOM_WEIGHT,
      mom_min: MOM_MIN,
      mom_max: MOM_MAX,
      chain_step: CHAIN_STEP,
      chain_max: CHAIN_MAX,
      early_tvl_min: EARLY_TVL_MIN,
    },
    stats,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: board.length - rows.filter((r) => r.watchlist).length,
    live_size: live.length,
    rows,
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

/** Why a board is not one the gate will take, or null: size, coverage, ranks, order, values, farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `the board holds ${board.length} rows, outside 100 to 4000`;
  const slugs = new Set(board.map((r) => r.slug));
  if (slugs.size !== board.length) return 'the board names a slug twice';
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  for (const r of board) if (!known.has(r.slug)) return `${r.slug} is not one of the snapshot's protocols`;
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000) {
      return `${r.slug} has implied value ${r.implied_value_usd}`;
    }
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} has a farm step of ${t.length} characters once trimmed`;
    }
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
