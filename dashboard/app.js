'use strict';
/* Token Launch Radar — the page's logic. Data arrives as window.RADAR from ../data.js,
   written by main.ts from the same board that board.json carries, so what the page shows
   and what the gate checks are one set of numbers. No network, no framework. */
const R = window.RADAR;
const $ = (id) => document.getElementById(id);

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const commas = (n) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
function fmtUSD(n) {
  if (n === null || n === undefined) return '—';
  if (n === 0) return '$0';
  const a = Math.abs(n);
  if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${commas(n)}`;
}
function fmtPct(v) {
  if (v === null || v === undefined) return '<span class="flat">—</span>';
  const cls = v > 0.05 ? 'pos' : v < -0.05 ? 'neg' : 'flat';
  return `<span class="${cls}">${v > 0 ? '+' : ''}${v.toFixed(1)}%</span>`;
}
function fmtAge(days) {
  if (days === null || days === undefined) return 'not recorded';
  if (days < 90) return `${days} days`;
  if (days < 730) return `${(days / 30.44).toFixed(1)} months`;
  return `${(days / 365).toFixed(1)} years`;
}
const CONF_ORDER = { High: 0, Medium: 1, Low: 2 };
const chip = (c) => `<span class="chip chip-${c.toLowerCase()}">${c}</span>`;

const state = {
  view: 'board',
  sortKey: 'rank',
  sortDir: 1,
  q: '',
  category: '',
  chain: '',
  confidence: '',
  watchlistOnly: false,
  selected: null,
};

/* ---------- headline + filters ---------- */
function renderHeadline() {
  $('headlineStats').innerHTML = [
    [commas(R.board_size), 'protocols ranked'],
    [commas(R.watchlist_size), 'on the watchlist'],
    [commas(R.live_size), 'already launched'],
    [esc(R.as_of), 'snapshot date'],
  ].map(([b, s]) => `<div class="stat"><b>${b}</b><span>${s}</span></div>`).join('');
  $('sourceLine').textContent = `Data: ${R.source}. Model ${R.model_version}; every figure on this page is derived from that snapshot alone.`;
  $('boardNote').innerHTML = `The board ranks <b>${R.watchlist_size} watchlist protocols</b> and <b>${R.early_size} early finds</b> together, by implied value. <b>${R.live_size} protocols already have a token that trades</b> — they are never ranked; the market has priced them, and they stand apart as the reference set.`;
}
function fillFilters() {
  const cats = [...new Set(R.rows.map((r) => r.category).filter(Boolean))].sort();
  $('fCategory').innerHTML = '<option value="">All categories</option>' + cats.map((c) => `<option>${esc(c)}</option>`).join('');
  const chains = [...new Set(R.rows.flatMap((r) => r.chains))].sort();
  $('fChain').innerHTML = '<option value="">All chains</option>' + chains.map((c) => `<option>${esc(c)}</option>`).join('');
}

/* ---------- board ---------- */
function visibleRows() {
  const q = state.q.trim().toLowerCase();
  return R.rows.filter((r) =>
    (state.category === '' || r.category === state.category) &&
    (state.chain === '' || r.chains.includes(state.chain)) &&
    (state.confidence === '' || r.model.confidence === state.confidence) &&
    (!state.watchlistOnly || r.watchlist) &&
    (q === '' || r.name.toLowerCase().includes(q) || r.slug.includes(q)));
}
function sortRows(rows) {
  const k = state.sortKey;
  const dir = state.sortDir;
  const val = (r) => (k === 'confidence' ? CONF_ORDER[r.model.confidence] : r[k]);
  return [...rows].sort((a, b) => {
    const va = val(a);
    const vb = val(b);
    if (va === null || va === undefined) return 1;
    if (vb === null || vb === undefined) return -1;
    if (typeof va === 'string') return dir * va.localeCompare(vb);
    if (va !== vb) return dir * (va - vb);
    return a.rank - b.rank;
  });
}
function renderBoard() {
  const rows = sortRows(visibleRows());
  $('rowCount').textContent = `${rows.length} of ${R.board_size} protocols`;
  $('boardBody').innerHTML = rows.map((r) => `
    <tr data-slug="${esc(r.slug)}" class="${r.watchlist ? 'is-watch' : ''}">
      <td class="num">${r.rank}</td>
      <td><span class="proto-name">${esc(r.name)}</span>${r.watchlist ? '<span class="badge">Watchlist</span>' : ''}<br><span class="proto-slug">${esc(r.slug)}</span></td>
      <td>${esc(r.category ?? '—')}</td>
      <td class="num">${fmtUSD(r.tvl_usd)}</td>
      <td class="num">${fmtPct(r.change_7d)}</td>
      <td class="num"><b>${fmtUSD(r.implied_value_usd)}</b></td>
      <td>${chip(r.model.confidence)}</td>
    </tr>`).join('');
  document.querySelectorAll('#boardTable th[data-sort]').forEach((th) => {
    const arrow = th.dataset.sort === state.sortKey ? ` <span class="arrow">${state.sortDir === 1 ? '▲' : '▼'}</span>` : '';
    th.innerHTML = th.dataset.label + arrow;
  });
}

/* ---------- detail ---------- */
function levelText(r) {
  const m = r.model;
  if (m.multiple_level === 'category') return `the ${esc(r.category)} category multiple, from ${m.category_refs} traded reference${m.category_refs === 1 ? '' : 's'}, shrunk toward its family`;
  if (m.multiple_level === 'family') return `the ${esc(m.family)} family multiple — the ${esc(r.category ?? 'uncategorised')} category has too few traded references to price from alone`;
  return 'the whole reference set’s multiple — no category or family evidence stands behind this row';
}
function renderDetail(r) {
  const m = r.model;
  const years = r.age_days === null ? null : (r.age_days / 365).toFixed(2);
  const missing = [];
  if (r.listed_at === null) missing.push('No listing date is recorded for this protocol, so its age factor is a neutral 1.00 — missing data is neither rewarded nor punished — and its confidence is capped by the missing field.');
  if (r.change_7d === null) missing.push('No seven-day TVL change is recorded, so its momentum factor is a neutral 1.00.');
  const base = r.tvl_usd * m.multiple;
  $('detailBody').innerHTML = `
    <div class="detail-head">
      <h2>${esc(r.name)}</h2>
      ${r.watchlist ? '<span class="badge">Watchlist</span>' : '<span class="chip">Early find</span>'}
      ${chip(m.confidence)}
    </div>
    <p class="detail-sub">Rank #${r.rank} of ${R.board_size} · ${esc(r.category ?? 'Uncategorised')} · family ${esc(m.family ?? '—')} · <span class="proto-slug">${esc(r.slug)}</span></p>
    <div class="cards">
      <div class="card"><span>TVL</span><b>${fmtUSD(r.tvl_usd)}</b></div>
      <div class="card"><span>7-day change</span><b>${r.change_7d === null ? '—' : `${r.change_7d > 0 ? '+' : ''}${r.change_7d.toFixed(1)}%`}</b></div>
      <div class="card"><span>Implied value</span><b>${fmtUSD(r.implied_value_usd)}</b></div>
      <div class="card"><span>Running since</span><b>${r.listed_at === null ? 'not recorded' : esc(r.listed_at)}</b></div>
      <div class="card"><span>Age at snapshot</span><b>${fmtAge(r.age_days)}</b></div>
      <div class="card"><span>Chains</span><b>${r.chains.length}</b></div>
    </div>
    <div class="panel-box">
      <h3>How this implied value is priced</h3>
      <table class="kv">
        <tr><td>Total value locked (the snapshot's figure)</td><td class="num"><b>$${commas(r.tvl_usd)}</b></td></tr>
        <tr><td>× peer multiple — ${levelText(r)}</td><td class="num"><b>${m.multiple.toFixed(4)}×</b></td></tr>
        <tr><td>= base value at peer pricing</td><td class="num">${fmtUSD(base)}</td></tr>
        <tr><td>× age factor — ${years === null ? 'no listing date recorded: a neutral factor, flagged' : `${years} years running with no token`}</td><td class="num">${m.age_factor.toFixed(4)}×</td></tr>
        <tr><td>× momentum factor — ${r.change_7d === null ? 'seven-day change not reported' : `TVL ${r.change_7d > 0 ? 'grew' : 'fell'} ${Math.abs(r.change_7d).toFixed(1)}% in seven days, damped`}</td><td class="num">${m.momentum_factor.toFixed(4)}×</td></tr>
        <tr><td>× reach factor — ${r.chains.length} chain${r.chains.length === 1 ? '' : 's'}${r.chains.length > 0 ? `: ${esc(r.chains.join(', '))}` : ''}</td><td class="num">${m.chain_factor.toFixed(4)}×</td></tr>
        <tr class="total"><td>Implied value, if a token launched on this record</td><td class="num">$${commas(r.implied_value_usd)}</td></tr>
      </table>
      ${missing.map((t) => `<p class="warn">${t}</p>`).join('')}
      <p class="fineprint">Confidence ${m.confidence}: High needs 10 or more traded references in the protocol's category and both its listing date and seven-day change recorded; Medium needs 3 or more references, or both fields; Low is the rest. The multiple and every factor are stated so the number can be checked, not just read.</p>
    </div>
    <div class="panel-box">
      <h3>Farm plan — the work that grows this protocol</h3>
      <ol class="farm">${r.farm_steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
      <p class="fineprint">The plan is written from the protocol's own record — its category, its chains, its size and its age. Costs are typical estimates for the chain and the position size, not quotes. It names no points program and promises no airdrop: the snapshot carries no such facts, and a launch may never come.</p>
    </div>`;
}

/* ---------- reference set ---------- */
function renderLive() {
  $('liveBody').innerHTML = R.live.map((p) => `
    <tr>
      <td><span class="proto-name">${esc(p.name)}</span><br><span class="proto-slug">${esc(p.slug)}</span></td>
      <td>${esc(p.symbol ?? '—')}</td>
      <td>${esc(p.category ?? '—')}</td>
      <td class="num">${fmtUSD(p.tvl_usd)}</td>
      <td class="num">${p.mcap_usd === 0 ? '$0 recorded' : fmtUSD(p.mcap_usd)}</td>
      <td class="num">${p.ratio === null ? '—' : `${p.ratio.toFixed(2)}×`}</td>
      <td class="num">${fmtPct(p.change_7d)}</td>
    </tr>`).join('');
}

/* ---------- method ---------- */
function renderMethod() {
  const c = R.constants;
  const s = R.stats;
  const oldestYears = (Math.max(...R.rows.map((r) => r.age_days ?? 0)) / 365).toFixed(1);
  const maxAgeF = Math.max(...R.rows.map((r) => r.model.age_factor)).toFixed(2);
  const famRows = Object.entries(s.families).sort((a, b) => b[1].refs - a[1].refs).map(([name, f]) => `
    <tr><td>${esc(name)}</td><td class="num">${f.refs}</td><td class="num">${f.median === null ? '—' : `${f.median.toFixed(4)}×`}</td><td class="num">${f.multiple.toFixed(4)}×</td></tr>`).join('');
  $('methodBody').innerHTML = `
  <div class="method">
    <h3>The question</h3>
    <p>What would a protocol's token be worth <em>if it launched on today's record</em>? The radar answers that for every protocol in the snapshot that records no token — no market cap, no CoinGecko id, no symbol — and ranks them by the answer. It does not predict whether or when a token comes.</p>
    <h3>The board</h3>
    <p>The snapshot's watchlist — ${R.watchlist_size} protocols at or above the house's $${commas(R.floor_usd)} floor that record no token — is the floor, never the ceiling. The board adds the radar's early finds: the other protocols that record no token, down to the snapshot's own $${commas(c.early_tvl_min)} floor, leaving out the wrapped, staked and bridged products of tokens that already trade, the versioned pools and the exchange products, by the same tests the house's watchlist rule states. That makes ${R.board_size} rows: ${R.watchlist_size} watchlist and ${R.early_size} early finds. Protocols whose token already trades are never ranked — the market has priced them — and are shown apart as the reference set.</p>
    <h3>The multiple: pricing from the market's own evidence</h3>
    <p>A launched token's value per dollar of TVL is observable: ${s.global.refs} of the traded protocols record a positive market cap, and their market-cap/TVL ratios are the evidence. The middle of all of them is <code>${s.global.median.toFixed(4)}×</code>. A protocol is priced first from its own category's traded peers; because many categories have only a few, each level is shrunk toward the level above — category toward family, family toward the whole set — with a prior weight of ${c.prior_weight}. The shrinkage is geometric, in log space, because a multiple is a ratio: one peer trading at 400 times its TVL moves a category's price by a factor, not by hundreds of turns. The worked example is at the top of this board: the prediction markets' only traded reference trades at 400× its TVL, geometric shrinkage prices that category at 2.85×, and arithmetic shrinkage would have left it near 80×. For a category with a single reference the prior carries most of the weight — the family is the working model for thin categories, and the table below shows each family's evidence. Where a category has ${c.winsor_min_refs} or more references, its ratios are first winsorized at their 5th and 95th percentiles. A category with no traded peers is priced from its family; a protocol with neither is priced from the whole set, and its detail view says so.</p>
    <table class="evidence">
      <thead><tr><th>Family</th><th class="num">Traded references</th><th class="num">Median MCap/TVL</th><th class="num">Multiple used</th></tr></thead>
      <tbody>${famRows}
      <tr><td><b>Whole reference set</b></td><td class="num"><b>${s.global.refs}</b></td><td class="num"><b>${s.global.median.toFixed(4)}×</b></td><td class="num"><b>${s.global.multiple.toFixed(4)}×</b></td></tr></tbody>
    </table>
    <h3>The three adjustments</h3>
    <p><strong>Age.</strong> A protocol that has run longer with no token is priced up, gently: <code>clamp(${c.age_base} + ${c.age_coef} × ln(1 + years), ${c.age_min}, ${c.age_max})</code>, years counted to the snapshot's own date. No listing date recorded counts as a neutral 1.00 — missing data is neither rewarded nor punished, the one rule both this factor and the momentum factor follow — and caps the row's confidence. The cap is a cap, not a promise: the oldest protocol on this board has run ${oldestYears} years, so here the factor reaches at most ${maxAgeF}×.</p>
    <p><strong>Momentum.</strong> The seven-day TVL change, damped because a week of TVL is noisy: <code>clamp(1 + ${c.mom_weight} × change/100, ${c.mom_min}, ${c.mom_max})</code>. Unreported counts as a neutral 1.00.</p>
    <p><strong>Reach.</strong> Each extra chain is distribution the TVL figure alone understates: <code>clamp(1 + ${c.chain_step} × (chains − 1), 1.00, ${c.chain_max})</code>.</p>
    <p>Implied value = TVL × multiple × age × momentum × reach, rounded to whole dollars. Rows sort by that rounded value, then TVL, then slug, so value never rises as rank ascends. One function prices every row; no protocol's name is special-cased anywhere in the model.</p>
    <h3>Confidence</h3>
    <p>Every row carries a tier. <strong>High</strong>: its category has 10 or more traded references and both its listing date and seven-day change are recorded. <strong>Medium</strong>: 3 or more references, or both fields present. <strong>Low</strong>: the rest. The detail view shows the tier, the multiple and the level it came from, and every factor, so a thin number reads as thin.</p>
    <h3>Farm plans</h3>
    <p>Each row's plan is the work that grows that protocol's TVL and usage — the activity a launch rewards — written from its own record: its category sets the shape of the work, its first chain sets the gas cost (Ethereum $10–30 a transaction, major layer-2s $1–5, low-fee chains under $1, other chains $1–5 typical), its TVL sets the position size ($50–$250), and its age sets the holding window (30–60 days). Every step states its cost and its time, as typical estimates for the chain, not quotes. No plan names a points program or promises an airdrop: the snapshot carries no such facts.</p>
    <h3>Limitations, stated</h3>
    <p class="muted">TVL is one figure, and a manipulated or mercenary TVL prices as if it were real. A category's traded peers may price on things TVL never captures — a brand, a licence, an exchange's earnings — and the shrinkage can only damp that, not remove it. Fifteen traded protocols record a market cap of $0 and price nothing, so they are evidence of a launch, not of a value. And a record is not proof: a protocol listed here as recording no token may have one its record does not carry.</p>
  </div>`;
}

/* ---------- navigation ---------- */
function show(view) {
  state.view = view;
  for (const v of ['board', 'detail', 'live', 'method']) {
    $('view-' + v).hidden = v !== view;
  }
  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('is-active', t.dataset.view === view || (view === 'detail' && t.dataset.view === 'board'));
  });
  try {
    const h = view === 'detail' && state.selected ? `#detail=${state.selected}` : `#${view}`;
    history.replaceState(null, '', h);
  } catch (e) { /* file URLs in some browsers refuse replaceState; the view still shows */ }
  window.scrollTo(0, 0);
}
function openDetail(slug) {
  const r = R.rows.find((x) => x.slug === slug);
  if (!r) return;
  state.selected = slug;
  renderDetail(r);
  show('detail');
}

/* ---------- wiring ---------- */
document.querySelectorAll('#boardTable th[data-sort]').forEach((th) => {
  th.dataset.label = th.textContent;
  th.addEventListener('click', () => {
    const k = th.dataset.sort;
    if (state.sortKey === k) state.sortDir = -state.sortDir;
    else { state.sortKey = k; state.sortDir = k === 'rank' || k === 'name' || k === 'category' ? 1 : -1; }
    renderBoard();
  });
});
$('boardBody').addEventListener('click', (ev) => {
  const tr = ev.target.closest('tr[data-slug]');
  if (tr) openDetail(tr.dataset.slug);
});
$('q').addEventListener('input', (ev) => { state.q = ev.target.value; renderBoard(); });
$('fCategory').addEventListener('change', (ev) => { state.category = ev.target.value; renderBoard(); });
$('fChain').addEventListener('change', (ev) => { state.chain = ev.target.value; renderBoard(); });
$('fConfidence').addEventListener('change', (ev) => { state.confidence = ev.target.value; renderBoard(); });
$('fWatchlist').addEventListener('change', (ev) => { state.watchlistOnly = ev.target.checked; renderBoard(); });
$('backToBoard').addEventListener('click', () => show('board'));
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => show(t.dataset.view)));

/* ---------- start: read the hash so a view can be linked (and screenshotted) directly ---------- */
function startFromHash() {
  const h = location.hash.replace(/^#/, '');
  if (h.startsWith('detail=')) { openDetail(decodeURIComponent(h.slice(7))); return; }
  if (h.startsWith('board?')) {
    const params = new URLSearchParams(h.slice(6));
    if (params.get('cat')) { state.category = params.get('cat'); $('fCategory').value = state.category; }
    if (params.get('chain')) { state.chain = params.get('chain'); $('fChain').value = state.chain; }
    if (params.get('conf')) { state.confidence = params.get('conf'); $('fConfidence').value = state.confidence; }
    if (params.get('watch') === '1') { state.watchlistOnly = true; $('fWatchlist').checked = true; }
    if (params.get('q')) { state.q = params.get('q'); $('q').value = state.q; }
    renderBoard();
    show('board');
    return;
  }
  if (h === 'live' || h === 'method') { show(h); return; }
  show('board');
}
renderHeadline();
fillFilters();
renderBoard();
renderLive();
renderMethod();
startFromHash();
