// Token Radar's plain dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, a filterable table, a per-protocol detail dialog with the model's own
// inputs and the protocol's farm plan. No network: every byte it shows is in data.js.
//
// The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and age
// decide the action, the capital, the hold and every cost and time. No name is special-cased. The
// detail view recomputes a pre-token row's implied value from the same formula and says whether the
// number matches board.json, so the page's code and the board's data are visibly the same arithmetic.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', tab: 'pre-token', watchlistOnly: false, sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  // The model in one function: the page recomputes a row from the snapshot figures.
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var ageMult = model.age_floor + model.age_range * (1 - Math.exp(-Math.max(age, 0) / model.age_scale_days));
    return Math.max(1, Math.round(row.tvl_usd * model.base_multiple * growthMult * ageMult));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // ---- farm plans: the same derivation main.ts writes to board.json ----
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 1e9) return 250;
    if (p.tvl_usd >= 1e8) return 150;
    if (p.tvl_usd >= 2e7) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 45;
    if (age < 90) return 90;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function preTokenAction(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Lend $' + capital + ' of USDC on ' + name + ' on ' + chain + ' and leave the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('swap') >= 0) return 'Add $' + capital + ' of liquidity to ' + name + "'s deepest pool on " + chain + ' and hold the LP tokens.';
    if (c.indexOf('yield aggregator') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + "'s top vault on " + chain + ' and keep the shares.';
    if (c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position earning.';
    if (c.indexOf('risk curator') >= 0 || c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' curator vault on ' + chain + ' and keep the vault shares.';
    if (c.indexOf('derivative') >= 0 || c.indexOf('perpetual') >= 0 || c.indexOf('basis trad') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedged position.';
    if (c.indexOf('rwa') >= 0) return 'Buy $' + capital + " of " + name + "'s yield-bearing asset on " + chain + ' and hold it.';
    if (c.indexOf('restak') >= 0 || c.indexOf('staking') >= 0) return "Restake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt token.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' with ' + name + ', then use the bridged funds inside its app.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and open one prediction-market position on ' + name + '.';
    if (c.indexOf('payment') >= 0) return 'Route $' + capital + ' of payments through ' + name + ' on ' + chain + ' and keep the receipts.';
    if (c.indexOf('stable') >= 0) return 'Mint or hold $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('chain') >= 0) return 'Use $' + capital + " on " + name + "'s chain: bridge in, then make one on-chain action a week.";
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function liveAction(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Lend $' + capital + ' of USDC on ' + name + ' on ' + chain + ' and stake the receipt token if one is offered.';
    if (c.indexOf('dex') >= 0 || c.indexOf('swap') >= 0) return 'Add $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and stake the LP tokens for rewards.';
    if (c.indexOf('yield') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + "'s top vault on " + chain + ' and claim the yield weekly.';
    if (c.indexOf('restak') >= 0 || c.indexOf('staking') >= 0) return 'Stake $' + capital + ' of ' + name + "'s token through its own staking page and keep the receipt.";
    if (c.indexOf('derivative') >= 0 || c.indexOf('perpetual') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and trade one small hedged position.';
    if (c.indexOf('rwa') >= 0) return 'Buy $' + capital + ' of ' + name + "'s yield-bearing asset on " + chain + ' and hold it for the yield.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' with ' + name + ' and use the bridged funds inside its app.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and use its main feature once a week.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Keep the position open and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    if (p.token_status === 'live') {
      return [
        { text: 'Set up a fresh wallet for this position only, keep its seed phrase on paper and never in a screenshot or a chat.', cost: 'no cost to create', time: '10 minutes' },
        { text: liveAction(p, capital, chain), cost: '$' + capital + ' of capital plus about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '20 minutes to set up' },
        { text: 'Use the protocol once a week and vote in governance when a proposal is open.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
        { text: 'Hold the position for at least 30 days; a live token\'s rewards usually vest or compound over weeks.', cost: 'the $' + capital + ' stays in the position', time: '30 days' },
        { text: 'Claim staking or liquidity rewards only from the protocol\'s own app, and check the claim\'s gas before confirming.', cost: 'gas on the claim', time: '10 minutes' },
        { text: 'Record the wallet, the dates, and every transaction in a farm log so you can repeat or unwind the position.', cost: 'nothing', time: '5 minutes' }
      ].map(stepText);
    }
    return [
      { text: 'Set up a fresh wallet for this farm only, keep its seed phrase on paper and never in a screenshot or a chat.', cost: 'no cost to create', time: '10 minutes' },
      { text: preTokenAction(p, capital, chain), cost: '$' + capital + ' of capital plus about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '20 minutes to set up' },
      { text: 'Do one qualifying action every week: a deposit, a borrow, a swap, a vote, or a claim, and vary the action.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Keep the position open for at least ' + hold + ' days so the activity spans more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: 'When a points or rewards page appears, open it only from the protocol\'s own site and never pay a fee to claim.', cost: 'nothing to check', time: '10 minutes' },
      { text: 'Record the wallet, the dates, and every transaction in a farm log so you can repeat or unwind the position.', cost: 'nothing', time: '5 minutes' }
    ].map(stepText);
  }
  // Test hook: the page's own farm steps for a slug, for checking against board.json.
  window.__farmStepsFor = function (slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    return row ? farmSteps(row) : null;
  };

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('watchlist') === '1') state.watchlistOnly = true;
    if (params.get('sort')) state.sort = params.get('sort');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.watchlistOnly) params.set('watchlist', '1');
    if (state.selected) params.set('p', state.selected);
    if (state.sort !== 'implied') params.set('sort', state.sort);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function baseRows() {
    if (state.tab === 'pre-token') return DATA.rows.filter(function (r) { return r.token_status === 'pre-token'; });
    if (state.tab === 'live') return DATA.rows.filter(function (r) { return r.token_status === 'live'; });
    return DATA.rows.slice();
  }
  function rows() {
    var q = state.q.trim().toLowerCase();
    return baseRows().filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).some(function (c) { return c === state.chain; })) return false;
      if (state.watchlistOnly && !r.watchlist) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { text: 'TOKEN RADAR' }), el('small', { text: 'pre-token launches, ranked' })),
      el('div', { class: 'top-meta' },
        el('span', { class: 'pill', text: 'Snapshot ' + DATA.as_of }),
        el('span', { class: 'pill', text: 'DefiLlama protocol index' }),
        el('span', { class: 'pill', text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.board_size + ' protocols ranked by implied value' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor and ' + DATA.above_size + ' above it that the watchlist rule left out. The live section, ' + DATA.live_size + ' protocols whose token already trades, sits below the pre-token board with its market cap. Implied value is a model, not a promise.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size }), el('small', { text: 'every watchlist protocol is ranked' })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows' }), el('b', { text: String(DATA.pre_size) }), el('small', { text: DATA.early_size + ' early + ' + DATA.above_size + ' above the floor' })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token rows' }), el('b', { text: String(DATA.live_size) }), el('small', { text: 'market cap, not a model' })),
        el('div', { class: 'fact' }, el('span', { text: 'Top implied value' }), el('b', { text: fmtUsd(DATA.rows[0].implied_value_usd) }), el('small', { text: DATA.rows[0].name + ' at rank 1' }))
      )
    );
  }

  function top10() {
    var top = DATA.rows.filter(function (r) { return r.token_status === 'pre-token'; }).slice(0, 10);
    return el('section', { class: 'top10' },
      el('h2', { text: 'Top 10 by implied value' }),
      el('div', { class: 'cards' }, top.map(function (r) {
        return el('button', { type: 'button', class: 'card', onclick: function () { openDetail(r.slug); } },
          el('span', { class: 'rk', text: 'RANK ' + r.rank }),
          el('span', { class: 'nm', text: r.name }),
          el('span', { class: 'ct', text: (r.category || 'Other') + ' · ' + fmtUsd(r.tvl_usd) + ' TVL' }),
          el('span', { class: 'vl', text: fmtUsd(r.implied_value_usd) }),
          el('span', { class: 'tv', text: 'implied value' })
        );
      }))
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var catSelect = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    catSelect.addEventListener('change', function () { state.category = catSelect.value; writeHash(); render(); });
    var chainSelect = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; writeHash(); render(); });
    function tabButton(tab, label) {
      return el('button', { type: 'button', 'aria-pressed': state.tab === tab ? 'true' : 'false', text: label, onclick: function () { state.tab = tab; writeHash(); render(); } });
    }
    var wl = el('label', { class: 'pill-check' },
      el('input', { type: 'checkbox', checked: state.watchlistOnly ? 'checked' : null, onclick: function () { state.watchlistOnly = !state.watchlistOnly; writeHash(); render(); } }),
      document.createTextNode(' Watchlist only')
    );
    var shown = rows().length;
    var total = baseRows().length;
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSelect),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, tabButton('pre-token', 'Pre-token'), tabButton('live', 'Live token'), tabButton('all', 'All'))),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: ' ' }), wl),
      el('span', { class: 'count', text: shown + ' of ' + total + ' rows shown' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } writeHash(); render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.watchlistOnly = false; writeHash(); render(); } })
      ));
    }
    var max = list.reduce(function (m, r) { return Math.max(m, r.implied_value_usd); }, 1);
    var live = state.tab === 'live';
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var valueLabel = r.token_status === 'live' ? fmtUsd(r.mcap_usd) : fmtUsd(r.implied_value_usd);
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: r.token_status === 'live' ? String(r.rank) : String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', null, document.createTextNode(r.name), r.watchlist ? el('span', { class: 'star', text: 'WATCHLIST' }) : null),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar' + (r.token_status === 'live' ? ' live' : ''), 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: valueLabel })
        )),
        el('td', null, el('span', { class: 'status ' + (r.token_status === 'live' ? 'live' : 'pre'), text: r.token_status === 'live' ? 'LIVE' : 'NO TOKEN' }))
      );
      tbody.appendChild(tr);
    });
    var caption = live
      ? 'Token live: these protocols already trade, so their market cap is a fact, not a model. They sit below the pre-token ranking.'
      : 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.';
    var valueHead = live ? 'Market cap' : 'Implied value';
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: caption }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', valueHead),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every pre-token row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'implied = round( tvl_usd x ' + m.base_multiple + ' x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.age_floor + ' + ' + m.age_range + ' x (1 - exp(-age_days / ' + m.age_scale_days + '))) )'
      ),
      el('p', { class: 'sub', text: 'TVL is the protocol\u2019s scale, seven-day growth is its momentum, and age is how long it has run with no token: the age factor rises steeply in the first year and then flattens. An unlisted age uses ' + m.unknown_age_days + ' days. The live section below the board carries market caps instead of model values, so the two groups are never mixed.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') + (row.watchlist ? ' · on the watchlist' : '') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    if (row.token_status === 'live') {
      dialog.appendChild(el('section', { class: 'detail-section' },
        el('h3', { text: 'Market value' }),
        el('div', { class: 'equation' },
          el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
          el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
          el('div', null, el('span', { text: 'Age' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
          el('div', null, el('span', { text: 'Market cap' }), el('b', { class: 'num', text: fmtUsd(row.mcap_usd) })),
          el('div', null, el('span', { text: 'Token status' }), el('b', { class: 'num', text: 'already trades' })),
          el('div', null, el('span', { text: 'Value shown' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
        ),
        el('p', { class: 'sub', text: 'This protocol already trades, so the board shows its market cap, the market\u2019s own value, not the model\u2019s. It sits below the pre-token ranking on purpose.' })
      ));
    } else {
      var recomputed = impliedOf(row, DATA.model);
      dialog.appendChild(el('section', { class: 'detail-section' },
        el('h3', { text: 'Implied value' }),
        el('div', { class: 'equation' },
          el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
          el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
          el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
          el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
          el('div', null, el('span', { text: 'Age multiplier' }), el('b', { class: 'num', text: String(row.age_multiplier) })),
          el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
        ),
        el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price. A protocol that records no token may still have one its record does not carry.' })
      ));
    }
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: row.token_status === 'live' ? 'How to use it' : 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    if (state.tab !== 'live') shell.appendChild(top10());
    shell.appendChild(controls());
    shell.appendChild(boardTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    shell.appendChild(el('p', { class: 'note' },
      el('b', { text: 'Method. ' }),
      document.createTextNode('Data: DefiLlama protocol index, snapshot ' + DATA.as_of + '. Implied value is this dashboard\u2019s own model from TVL, seven-day growth and age with no token; it is not a prediction that a token launches, or of its price. A protocol that records no token may still have one. Live-token rows show market cap and are ranked below the pre-token board.')
    ));
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
