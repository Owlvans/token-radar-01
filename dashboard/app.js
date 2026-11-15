(function () {
  const radar = window.RADAR;
  if (!radar) {
    console.error('No window.RADAR found');
    return;
  }

  document.getElementById('snapshot-date').textContent = radar.as_of;
  document.getElementById('stat-candidates').textContent = radar.board_size;
  document.getElementById('stat-watchlist').textContent = `${radar.watchlist_size}/40`;
  document.getElementById('stat-below-floor').textContent = radar.below_floor_count || 0;
  document.getElementById('stat-categories').textContent = radar.categories_covered || Object.keys(radar.audit_summary.category_counts).length;

  const tableBody = document.getElementById('table-body');
  const searchInput = document.getElementById('search-input');
  const filterCategory = document.getElementById('filter-category');
  const filterChain = document.getElementById('filter-chain');
  const filterLabel = document.getElementById('filter-label');
  const filterTvl = document.getElementById('filter-tvl');
  const toggleWatchlist = document.getElementById('toggle-watchlist');
  const toggleBenchmarks = document.getElementById('toggle-benchmarks');

  const drawer = document.getElementById('detail-drawer');
  const backdrop = document.getElementById('drawer-backdrop');
  const drawerClose = document.getElementById('drawer-close');
  const drawerName = document.getElementById('drawer-name');
  const drawerBadges = document.getElementById('drawer-badges');
  const drawerContent = document.getElementById('drawer-content');

  const categories = new Set();
  const chains = new Set();
  radar.rows.forEach(r => {
    if (r.category) categories.add(r.category);
    if (r.chains) r.chains.forEach(c => chains.add(c));
  });

  Array.from(categories).sort().forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    filterCategory.appendChild(opt);
  });

  Array.from(chains).sort().forEach(ch => {
    const opt = document.createElement('option');
    opt.value = ch;
    opt.textContent = ch;
    filterChain.appendChild(opt);
  });

  let currentSort = { column: 'rank', asc: true };

  function formatUsd(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + n.toLocaleString();
  }

  function formatPct(n) {
    if (n === null || n === undefined) return '—';
    const pct = n;
    const sign = pct > 0 ? '+' : '';
    return `<span class="${pct >= 0 ? 'pos' : 'neg'}">${sign}${pct.toFixed(1)}%</span>`;
  }

  function badgeHtml(label) {
    let cls = 'badge-thin';
    if (label === 'WATCHLIST') cls = 'badge-watchlist';
    else if (label === 'BENCHMARK') cls = 'badge-benchmark';
    else if (label === 'OVERDUE') cls = 'badge-overdue';
    else if (label === 'GROWING') cls = 'badge-growing';
    else if (label === 'EARLY') cls = 'badge-early';
    return `<span class="badge ${cls}">${label}</span>`;
  }

  function renderTable() {
    const query = searchInput.value.toLowerCase().trim();
    const catVal = filterCategory.value;
    const chainVal = filterChain.value;
    const labelVal = filterLabel.value;
    const minTvl = Number(filterTvl.value) || 0;
    const watchlistOnly = toggleWatchlist.checked;
    const showBenchmarks = toggleBenchmarks.checked;

    let rows = radar.rows.filter(r => {
      if (!showBenchmarks && r.is_benchmark) return false;
      if (watchlistOnly && !r.labels.includes('WATCHLIST')) return false;
      if (catVal && r.category !== catVal) return false;
      if (chainVal && (!r.chains || !r.chains.includes(chainVal))) return false;
      if (labelVal && !r.labels.includes(labelVal)) return false;
      if (r.tvl_usd < minTvl) return false;

      if (query) {
        const text = `${r.name} ${r.slug} ${r.category || ''} ${(r.chains || []).join(' ')}`.toLowerCase();
        if (!text.includes(query)) return false;
      }
      return true;
    });

    rows.sort((a, b) => {
      let va = a[currentSort.column];
      let vb = b[currentSort.column];
      if (va === null || va === undefined) va = '';
      if (vb === null || vb === undefined) vb = '';
      if (typeof va === 'string') {
        const cmp = va.localeCompare(vb);
        return currentSort.asc ? cmp : -cmp;
      }
      return currentSort.asc ? va - vb : vb - va;
    });

    tableBody.innerHTML = '';
    if (rows.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="8" style="text-align:center; color: var(--muted); padding: 40px;">No protocols match current filters.</td></tr>`;
      return;
    }

    rows.forEach(r => {
      const tr = document.createElement('tr');
      tr.addEventListener('click', () => {
        openDrawer(r);
        window.location.hash = `#p=${r.slug}`;
      });

      const badges = (r.labels || []).map(badgeHtml).join(' ');
      const chainsStr = (r.chains || []).slice(0, 3).join(', ');

      tr.innerHTML = `
        <td class="mono">#${r.rank}</td>
        <td>
          <div class="proto-cell">
            <div class="proto-name-row">
              <span class="proto-name">${r.name}</span>
              ${badges}
            </div>
            <div class="proto-sub">${r.category || 'Other'} &bull; ${chainsStr}</div>
          </div>
        </td>
        <td class="num mono" style="font-weight: 600; color: var(--accent);">${formatUsd(r.implied_value_usd)}</td>
        <td class="num mono">${formatUsd(r.tvl_usd)}</td>
        <td class="num">${formatPct(r.change_7d)}</td>
        <td class="num mono">${(r.implied_tvl_ratio || 0).toFixed(2)}x</td>
        <td class="num mono">${r.age_days !== null ? r.age_days + 'd' : '—'}</td>
        <td class="num mono">${r.peers_count}</td>
      `;
      tableBody.appendChild(tr);
    });
  }

  document.querySelectorAll('th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.getAttribute('data-sort');
      if (currentSort.column === col) {
        currentSort.asc = !currentSort.asc;
      } else {
        currentSort.column = col;
        currentSort.asc = col === 'rank' || col === 'name';
      }
      renderTable();
    });
  });

  [searchInput, filterCategory, filterChain, filterLabel, filterTvl, toggleWatchlist, toggleBenchmarks].forEach(el => {
    el.addEventListener('input', renderTable);
    el.addEventListener('change', renderTable);
  });

  function openDrawer(r) {
    drawerName.textContent = r.name;
    // Enhanced peer-count badge and shrinkage weight indicator next to name in drawer
    const shrinkageWeight = ((r.peers_count / (r.peers_count + 8)) * 100).toFixed(0);
    drawerBadges.innerHTML = (r.labels || []).map(badgeHtml).join(' ') + 
      `<span class="badge" style="background-color: var(--raised); color: var(--accent); border: 1px solid var(--line);">Peers: ${r.peers_count} (Shrinkage: ${shrinkageWeight}%)</span>`;

    const spreadPct = r.implied_value_usd > 0 ? (((r.sensitivity_high - r.sensitivity_low) / r.implied_value_usd) * 100).toFixed(1) : '0';

    const calcHtml = `
      <div class="section-card">
        <h3>Valuation Calculation</h3>
        <div class="calc-grid">
          <div class="calc-item"><span class="calc-label">TVL</span><span class="calc-val">${formatUsd(r.tvl_usd)}</span></div>
          <div class="calc-item"><span class="calc-label">Category Multiple (R_c)</span><span class="calc-val">${(r.multiple || 1).toFixed(3)}x</span></div>
          <div class="calc-item"><span class="calc-label">Growth Factor (G)</span><span class="calc-val">${(r.growth || 1).toFixed(3)}</span></div>
          <div class="calc-item"><span class="calc-label">Tenure Factor (A)</span><span class="calc-val">${(r.tenure || 1).toFixed(3)}</span></div>
          <div class="calc-item"><span class="calc-label">Implied Value</span><span class="calc-val" style="color: var(--accent);">${formatUsd(r.implied_value_usd)}</span></div>
          <div class="calc-item"><span class="calc-label">Implied / TVL</span><span class="calc-val">${(r.implied_tvl_ratio || 0).toFixed(2)}x</span></div>
        </div>
      </div>
      <div class="section-card">
        <h3>Sensitivity Range & Q25/Q75 Multiples</h3>
        <div class="calc-grid">
          <div class="calc-item"><span class="calc-label">Sensitivity Low (Q25)</span><span class="calc-val">${formatUsd(r.sensitivity_low)}</span></div>
          <div class="calc-item"><span class="calc-label">Sensitivity High (Q75)</span><span class="calc-val">${formatUsd(r.sensitivity_high)}</span></div>
          <div class="calc-item"><span class="calc-label">Spread</span><span class="calc-val">${spreadPct}% of Implied</span></div>
          <div class="calc-item"><span class="calc-label">Category Peer Count</span><span class="calc-val">${r.peers_count} protocols</span></div>
        </div>
      </div>
      <div class="section-card">
        <h3>Protocol Facts & Chains</h3>
        <div class="calc-grid">
          <div class="calc-item"><span class="calc-label">Category</span><span class="calc-val">${r.category || 'Other'}</span></div>
          <div class="calc-item"><span class="calc-label">Chains</span><span class="calc-val">${(r.chains || []).join(', ') || 'None'}</span></div>
          <div class="calc-item"><span class="calc-label">Age</span><span class="calc-val">${r.age_days !== null ? r.age_days + ' days' : 'Unknown'}</span></div>
          <div class="calc-item"><span class="calc-label">7d Change</span><span class="calc-val">${formatPct(r.change_7d)}</span></div>
        </div>
      </div>
      <div class="section-card">
        <h3>6-Step Farm Plan</h3>
        <ol class="farm-steps-list">
          ${(r.farm_steps || []).map((step, idx) => `
            <li class="farm-step-item">
              <span class="step-num">${idx + 1}</span>
              <span class="step-text">${step}</span>
            </li>
          `).join('')}
        </ol>
      </div>
    `;

    drawerContent.innerHTML = calcHtml;
    drawer.classList.add('open');
    backdrop.classList.add('open');
  }

  function closeDrawer() {
    drawer.classList.remove('open');
    backdrop.classList.remove('open');
    if (window.location.hash.startsWith('#p=')) {
      history.pushState('', document.title, window.location.pathname + window.location.search);
    }
  }

  drawerClose.addEventListener('click', closeDrawer);
  backdrop.addEventListener('click', closeDrawer);

  function handleHash() {
    const hash = window.location.hash;
    if (hash.startsWith('#p=')) {
      const slug = hash.slice(3);
      const row = radar.rows.find(r => r.slug === slug);
      if (row) openDrawer(row);
    } else if (hash.startsWith('#f=')) {
      closeDrawer();
      const parts = hash.slice(3).split(':');
      if (parts[0] === 'cat' && parts[1]) {
        filterCategory.value = parts[1];
        renderTable();
      } else if (parts[0] === 'label' && parts[1]) {
        filterLabel.value = parts[1];
        renderTable();
      }
    }
  }

  window.addEventListener('hashchange', handleHash);

  renderTable();
  if (window.location.hash) {
    handleHash();
  }
})();
