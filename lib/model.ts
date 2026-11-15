// The token radar model: peer-implied circulating market cap with winsorized log ratios,
// category shrinkage, momentum, tenure normalization, sensitivity bands, and farm plans.

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

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

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
  token_status: 'pre-token' | 'benchmark';
  age_days: number | null;
  implied_value_usd: number;
  implied_tvl_ratio: number;
  peers_count: number;
  multiple: number;
  growth: number;
  tenure: number;
  sensitivity_low: number;
  sensitivity_high: number;
  labels: string[];
  farm_steps: string[];
  is_benchmark: boolean;
}

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
  implied_tvl_ratio: number;
  peers_count: number;
  multiple: number;
  growth: number;
  tenure: number;
  sensitivity_low: number;
  sensitivity_high: number;
  labels: string[];
  is_benchmark: boolean;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  benchmark_size: number;
  pretoken_size: number;
  below_floor_count: number;
  categories_covered: number;
  rows: RadarRow[];
  audit_summary: {
    global_median_log_ratio: number;
    normalization_factor_D: number;
    winsor_p5: number;
    winsor_p95: number;
    category_counts: Record<string, number>;
    category_multiples: Record<string, number>;
  };
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  const weight = idx - lower;
  if (upper >= sorted.length) return sorted[sorted.length - 1]!;
  return sorted[lower]! * (1 - weight) + sorted[upper]! * weight;
}

const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_STAKED = /\b(wrapped|staked|staking)\b/i;
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

export function isTokenRecorded(p: SnapshotProtocol): boolean {
  return (p.mcap_usd !== null && p.mcap_usd > 0) || p.gecko_id !== null;
}

export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

function hasExchangePrefix(name: string): boolean {
  const lower = name.toLowerCase();
  return EXCHANGE_PREFIXES.some((ex) => lower.startsWith(ex.toLowerCase()));
}

export function passesExclusions(p: SnapshotProtocol): boolean {
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_STAKED.test(p.name)) return false;
  if (hasExchangePrefix(p.name)) return false;
  return true;
}

export function buildBoard(snapshot: Snapshot): { board: BoardRow[]; audit: any } {
  const protocolsBySlug = new Map(snapshot.protocols.map((p) => [p.slug, p]));

  // 1. Peer pool: token-recorded, mcap_usd > 0, tvl_usd >= 1,000,000
  const peers = snapshot.protocols.filter(
    (p) => isTokenRecorded(p) && (p.mcap_usd ?? 0) > 0 && p.tvl_usd >= 1_000_000
  );

  // x_j = ln(mcap_j / tvl_j)
  const logRatios = peers.map((p) => Math.log((p.mcap_usd!) / p.tvl_usd));
  const p5 = percentile(logRatios, 5);
  const p95 = percentile(logRatios, 95);

  // Winsorize log ratios
  const winsorizedRatios = logRatios.map((x) => Math.max(p5, Math.min(p95, x)));
  const L0 = median(winsorizedRatios);

  // Map winsorized ratio back to peer
  const peerWinsorMap = new Map<string, number>();
  peers.forEach((p, idx) => {
    peerWinsorMap.set(p.slug, winsorizedRatios[idx]!);
  });

  // Group peers by category
  const categoryPeers = new Map<string, SnapshotProtocol[]>();
  for (const p of peers) {
    const cat = p.category || 'Other';
    if (!categoryPeers.has(cat)) categoryPeers.set(cat, []);
    categoryPeers.get(cat)!.push(p);
  }

  const categoryMultiples: Record<string, number> = {};
  const categoryQ25Multiples = new Map<string, number>();
  const categoryQ75Multiples = new Map<string, number>();
  const categoryCounts: Record<string, number> = {};

  for (const [cat, cpList] of categoryPeers.entries()) {
    categoryCounts[cat] = cpList.length;
    const catRatios = cpList.map((p) => peerWinsorMap.get(p.slug)!);
    const medCat = median(catRatios);
    const q25Cat = percentile(catRatios, 25);
    const q75Cat = percentile(catRatios, 75);
    const nc = cpList.length;
    const wc = nc / (nc + 8);
    const shrunk = wc * medCat + (1 - wc) * L0;
    categoryMultiples[cat] = Math.exp(shrunk);

    const shrunk25 = wc * q25Cat + (1 - wc) * L0;
    const shrunk75 = wc * q75Cat + (1 - wc) * L0;
    categoryQ25Multiples.set(cat, Math.exp(shrunk25));
    categoryQ75Multiples.set(cat, Math.exp(shrunk75));
  }

  // Pre-token eligible rows: all pre-token minus dynamic exclusions, UNION watchlist slugs
  const eligiblePreToken = new Map<string, SnapshotProtocol>();
  for (const p of snapshot.protocols) {
    if (isPreToken(p) && passesExclusions(p)) {
      eligiblePreToken.set(p.slug, p);
    }
  }
  for (const slug of snapshot.watchlist) {
    const p = protocolsBySlug.get(slug);
    if (p !== undefined && isPreToken(p)) {
      eligiblePreToken.set(slug, p);
    }
  }

  // Calculate G and A for all protocols to compute D (median of G * A over peer pool)
  const peerGA: number[] = [];
  for (const p of peers) {
    const change7d = p.change_7d;
    const changePct = change7d !== null ? Math.max(-100, Math.min(100, change7d)) : 0;
    const G = change7d !== null ? Math.exp(0.18 * Math.tanh(changePct / 25)) : 1;

    const age = ageDays(snapshot.as_of, p.listed_at);
    const h = age !== null ? age / (age + 365) : 0.5;
    const A = Math.exp(0.12 * (2 * h - 1));
    peerGA.push(G * A);
  }
  const D = median(peerGA) || 1;

  // Score all eligible pre-token protocols
  const scoredRows: any[] = [];
  for (const p of eligiblePreToken.values()) {
    const cat = p.category || 'Other';
    const nc = categoryPeers.has(cat) ? categoryPeers.get(cat)!.length : 0;
    const Rc = categoryMultiples[cat] !== undefined ? categoryMultiples[cat] : Math.exp(L0);
    const R_low = categoryQ25Multiples.has(cat) ? categoryQ25Multiples.get(cat)! : Rc * 0.8;
    const R_high = categoryQ75Multiples.has(cat) ? categoryQ75Multiples.get(cat)! : Rc * 1.2;

    const change7d = p.change_7d;
    const changePct = change7d !== null ? Math.max(-100, Math.min(100, change7d)) : 0;
    const G = change7d !== null ? Math.exp(0.18 * Math.tanh(changePct / 25)) : 1;

    const age = ageDays(snapshot.as_of, p.listed_at);
    const h = age !== null ? age / (age + 365) : 0.5;
    const A = Math.exp(0.12 * (2 * h - 1));

    const rawV = p.tvl_usd * Rc * (G * A) / D;
    const implied = Math.max(1, Math.round(rawV));

    const rawLow = p.tvl_usd * R_low * (G * A) / D;
    const sensitivity_low = Math.max(1, Math.round(rawLow));

    const rawHigh = p.tvl_usd * R_high * (G * A) / D;
    const sensitivity_high = Math.max(1, Math.round(rawHigh));

    const implied_tvl_ratio = p.tvl_usd > 0 ? implied / p.tvl_usd : 0;

    const labels: string[] = [];
    if (snapshot.watchlist.includes(p.slug)) labels.push('WATCHLIST');
    if (age !== null && age >= 730) labels.push('OVERDUE');
    if (change7d !== null && change7d >= 10) labels.push('GROWING');
    if (age !== null && age < 180) labels.push('EARLY');
    if (nc < 5) labels.push('THIN PEERS');

    scoredRows.push({
      p,
      implied,
      implied_tvl_ratio,
      peers_count: nc,
      multiple: Rc,
      growth: G,
      tenure: A,
      sensitivity_low,
      sensitivity_high,
      age_days: age,
      labels,
      is_benchmark: false,
    });
  }

  // Benchmark rows: 24 token-bearing benchmark rows (top-TVL protocol per candidate category, fill remaining by TVL desc)
  const tokenBearing = snapshot.protocols.filter(
    (p) => !isPreToken(p) && (p.mcap_usd ?? 0) > 0 && p.category !== 'CEX'
  );
  tokenBearing.sort((a, b) => b.tvl_usd - a.tvl_usd);

  const benchmarkProtocols = new Map<string, SnapshotProtocol>();
  const categoriesPresent = new Set<string>();
  tokenBearing.forEach((p) => {
    const cat = p.category || 'Other';
    if (!categoriesPresent.has(cat) && benchmarkProtocols.size < 24) {
      categoriesPresent.add(cat);
      benchmarkProtocols.set(p.slug, p);
    }
  });
  for (const p of tokenBearing) {
    if (benchmarkProtocols.size >= 24) break;
    if (!benchmarkProtocols.has(p.slug)) {
      benchmarkProtocols.set(p.slug, p);
    }
  }

  for (const p of benchmarkProtocols.values()) {
    const mcap = p.mcap_usd ?? p.tvl_usd;
    const age = ageDays(snapshot.as_of, p.listed_at);
    scoredRows.push({
      p,
      implied: Math.round(mcap),
      implied_tvl_ratio: p.tvl_usd > 0 ? mcap / p.tvl_usd : 0,
      peers_count: peers.length,
      multiple: 1.0,
      growth: 1.0,
      tenure: 1.0,
      sensitivity_low: Math.round(mcap * 0.8),
      sensitivity_high: Math.round(mcap * 1.2),
      age_days: age,
      labels: ['BENCHMARK'],
      is_benchmark: true,
    });
  }

  // Sort descending by implied value, tie-break slug ascending
  scoredRows.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));

  const board: BoardRow[] = scoredRows.map((s, idx) => ({
    rank: idx + 1,
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
    token_status: s.is_benchmark ? 'benchmark' : 'pre-token',
    age_days: s.age_days,
    implied_value_usd: s.implied,
    implied_tvl_ratio: Number(s.implied_tvl_ratio.toFixed(4)),
    peers_count: s.peers_count,
    multiple: Number(s.multiple.toFixed(4)),
    growth: Number(s.growth.toFixed(4)),
    tenure: Number(s.tenure.toFixed(4)),
    sensitivity_low: s.sensitivity_low,
    sensitivity_high: s.sensitivity_high,
    labels: s.labels,
    farm_steps: generateFarmSteps(s.p, s.age_days),
    is_benchmark: s.is_benchmark,
  }));

  const audit = {
    global_median_log_ratio: L0,
    normalization_factor_D: D,
    winsor_p5: p5,
    winsor_p95: p95,
    category_counts: categoryCounts,
    category_multiples: categoryMultiples,
  };

  return { board, audit };
}

const CHAIN_PREFERENCE = ['Ethereum', 'Arbitrum', 'Optimism', 'Base', 'Solana', 'Polygon', 'BSC', 'Avalanche', 'Sui', 'Aptos', 'Sonic'];

const CHAIN_GAS_BUDGETS: Record<string, string> = {
  Ethereum: '$8-$25',
  Arbitrum: '$0.50-$2',
  Optimism: '$0.50-$2',
  Base: '$0.50-$2',
  Solana: '$0.05',
  Polygon: '$0.10-$0.50',
  BSC: '$0.20-$1',
  Avalanche: '$0.50-$2',
  Sui: '$0.10-$0.50',
  Aptos: '$0.10-$0.50',
  Sonic: '$0.20-$1',
};

function selectChain(chains: string[]): string {
  for (const pref of CHAIN_PREFERENCE) {
    if (chains.includes(pref)) return pref;
  }
  return chains.length > 0 ? chains[0]! : 'Ethereum';
}

function gasBudgetFor(chain: string): string {
  return CHAIN_GAS_BUDGETS[chain] || '$1-$5';
}

function capitalFor(tvl: number): number {
  const scaled = 100 * Math.pow(tvl / 1e7, 0.25);
  const clamped = Math.max(50, Math.min(500, scaled));
  return 25 * Math.round(clamped / 25);
}

export function generateFarmSteps(p: SnapshotProtocol, age: number | null): string[] {
  const chain = selectChain(p.chains);
  const capital = capitalFor(p.tvl_usd);
  const gasBudget = gasBudgetFor(chain);
  const cat = (p.category || 'Other').toLowerCase();
  const name = p.name;

  let action = `Deposit $${capital} of USDC into ${name} on ${chain} and maintain the active position across weekly checkpoints.`;
  if (cat.includes('lend') || cat.includes('cdp') || cat.includes('collateral')) {
    action = `Supply $${capital} worth of stablecoin collateral to ${name} on ${chain} and maintain a healthy collateral factor.`;
  } else if (cat.includes('dex') || cat.includes('yield') || cat.includes('liquidity')) {
    action = `Provide $${capital} in liquidity to ${name}'s core pool on ${chain} and stake the LP tokens if applicable.`;
  } else if (cat.includes('bridge')) {
    action = `Bridge $${capital} of assets via ${name} to ${chain} and execute at least one follow-on interaction in the destination app.`;
  } else if (cat.includes('staking') || cat.includes('restak')) {
    action = `Stake $${capital} equivalent of network assets through ${name} and hold the liquid receipt token.`;
  } else if (cat.includes('perpetual') || cat.includes('derivative')) {
    action = `Deposit $${capital} margin collateral on ${name} and execute a modest hedged trade position.`;
  }

  const steps = [
    `Prepare a dedicated non-custodial wallet funded with native gas tokens, budgeting about ${gasBudget} in gas on ${chain} for setup transactions.`,
    action,
    `Perform weekly recurrent on-chain touchpoints (swaps, claims, or deposits) to register consistent protocol engagement.`,
    `Hold the active position for a minimum qualifying window of ${age !== null && age < 180 ? 60 : 30} days to ensure snapshot capture.`,
    `Check the official incentives page — points eligibility is not in this snapshot. Verify campaign rules before claiming rewards.`,
    `Log position metrics, transaction hashes, and exit parameters securely to prepare for orderly capital withdrawal.`
  ];

  return steps.map((s) => {
    let t = s;
    if (t.length > 600) t = t.slice(0, 596) + '...';
    while (t.length < 20) t += ' Maintain interaction.';
    return t;
  });
}

export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not valid JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new SnapshotError('snapshot.json root must be an object');
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) {
    throw new SnapshotError('snapshot.json missing valid as_of date');
  }
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json missing source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) {
    throw new SnapshotError('snapshot.json missing valid floor_usd');
  }
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json missing protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) {
    throw new SnapshotError('snapshot.json missing watchlist array of strings');
  }

  const protocols: SnapshotProtocol[] = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      throw new SnapshotError(`Protocol at index ${i} is not an object`);
    }
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`Protocol at index ${i} missing slug, name, or tvl_usd`);
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

export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `Board misses ${missing.length} watchlist slugs: ${missing.slice(0, 5).join(', ')}`;

  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) {
    if (ranks[i] !== i + 1) return `Rank mismatch at position ${i + 1}: found ${ranks[i]}`;
  }

  for (let i = 1; i < board.length; i++) {
    if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) {
      return `Row ${i + 1} (${board[i]!.slug}) outranks row ${i} (${board[i - 1]!.slug}) on implied value`;
    }
  }

  for (const r of board) {
    if (r.farm_steps.length !== 6) return `${r.slug} has ${r.farm_steps.length} farm steps (expected exactly 6)`;
    for (const s of r.farm_steps) {
      if (s.length < 20 || s.length > 600) return `${r.slug} farm step length ${s.length} out of bounds [20, 600]`;
    }
  }

  return null;
}
