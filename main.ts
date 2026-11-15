import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildBoard, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory>\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshotText = readFileSync(inputFile, 'utf8');
const snapshot = parseSnapshot(snapshotText);
const { board, audit } = buildBoard(snapshot);

const issue = boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: gate refused board: ${issue}\n`);
  process.exit(1);
}

// Compute categories covered & below floor count
const categoriesSet = new Set(board.map((r) => r.category).filter(Boolean));
const benchmarkRows = board.filter((r) => r.is_benchmark);
const minBenchmarkVal = benchmarkRows.length > 0 ? Math.min(...benchmarkRows.map((r) => r.implied_value_usd)) : 0;
const belowFloorCount = board.filter((r) => !r.is_benchmark && r.implied_value_usd < minBenchmarkVal).length;

const radarRows = board.map((r) => ({
  rank: r.rank,
  slug: r.slug,
  name: r.name,
  category: r.category,
  chains: r.chains,
  tvl_usd: r.tvl_usd,
  change_7d: r.change_7d,
  mcap_usd: r.mcap_usd,
  listed_at: r.listed_at,
  age_days: r.age_days,
  implied_value_usd: r.implied_value_usd,
  implied_tvl_ratio: r.implied_tvl_ratio,
  peers_count: r.peers_count,
  multiple: r.multiple,
  growth: r.growth,
  tenure: r.tenure,
  sensitivity_low: r.sensitivity_low,
  sensitivity_high: r.sensitivity_high,
  labels: r.labels,
  is_benchmark: r.is_benchmark,
}));

const radarData = {
  as_of: snapshot.as_of,
  source: snapshot.source,
  floor_usd: snapshot.floor_usd,
  model_version: 'radar-1',
  watchlist_size: snapshot.watchlist.length,
  board_size: board.length,
  benchmark_size: benchmarkRows.length,
  pretoken_size: board.length - benchmarkRows.length,
  below_floor_count: belowFloorCount,
  categories_covered: categoriesSet.size,
  rows: radarRows,
  audit_summary: audit,
};

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board }, null, 2)}\n`);
writeFileSync(join(out, 'data.js'), `window.RADAR=${JSON.stringify(radarData)};\n`);

// Write audit.json into repo root
writeFileSync(
  join(here, 'audit.json'),
  `${JSON.stringify({
    as_of: snapshot.as_of,
    total_protocols: snapshot.protocols.length,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    audit_parameters: audit,
  }, null, 2)}\n`
);

function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));

for (const name of shots) {
  if (!IMAGE_NAME.test(name)) {
    process.stderr.write(`token radar: screenshots/${name}: invalid name\n`);
    process.exit(1);
  }
}

writeFileSync(join(out, 'dossier.json'), buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: { max_files: 400, max_bytes: 4_194_304 } }));

process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} watchlist, ${board.length} board rows (${benchmarkRows.length} benchmarks)\n` +
    `token radar: wrote board.json, data.js, dashboard/, screenshots/ (${shots.length} images) and dossier.json\n`
);
