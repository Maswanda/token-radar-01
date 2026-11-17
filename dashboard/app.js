// Token Radar dashboard, third draft (radar-3).
//
// The page renders window.RADAR (emitted beside dashboard/ by main.ts): the ranked
// pre-token board, a Top-5 spotlight, a searchable, filterable and sortable table,
// a live-token tab, the model's own arithmetic, and a per-protocol detail drawer
// carrying the farm plan. Nothing is fetched: every byte shown already sits in
// data.js.
//
// The farm plan and the implied value are recomputed here from the same snapshot
// figures main.ts scores into board.json — TVL, seven-day growth, age, chains and
// category — so the page and the board agree by construction. No protocol name is
// ever special-cased. Each row also carries its implied range across the model's
// sensitivity runs and the multiplier that drives it most, and each farm plan ends
// with the protocol's main risk and when to skip it outright.
(function () {
  'use strict';

  /* ---------------------------------------------------------------- */
  /* Data and view state                                              */
  /* ---------------------------------------------------------------- */

  var BOARD = window.RADAR;
  if (!BOARD) return;

  var mount = document.getElementById('board');
  var ui = {
    q: '',
    category: 'all',
    chain: 'all',
    watchlistOnly: false,
    tab: 'pre-token',
    sort: 'implied',
    dir: -1,
    selected: null
  };

  /* ---------------------------------------------------------------- */
  /* Number formatting                                                */
  /* ---------------------------------------------------------------- */

  var money = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  });

  function hasValue(x) {
    return x !== null && x !== undefined && isFinite(x);
  }

  function formatMoney(n) {
    if (!hasValue(n)) return 'n/a';
    var magnitude = Math.abs(n);
    if (magnitude >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (magnitude >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (magnitude >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return money.format(n);
  }

  function formatPct(n) {
    if (!hasValue(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }

  function formatAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }

  // The detail view's age: the exact day count, so the maturity multiplier can be
  // checked by hand, with the table's rounded years in brackets. The table rounds
  // years to one decimal, so several ages share one display string; the exact days
  // here are the value the model used.
  function formatAgeExact(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return Math.max(0, Math.round(days)) + 'd (' + (days / 365).toFixed(1) + 'y)';
    return Math.max(0, Math.round(days)) + 'd';
  }

  /* ---------------------------------------------------------------- */
  /* The model, recomputed in the page                                */
  /* ---------------------------------------------------------------- */

  // The same arithmetic as lib/model.ts and board.json: size tapers off, growth
  // carries the most weight, age and chain reach add the rest. The page
  // recomputes every row and checks it against the number the board carries.
  function recomputeImplied(row, model) {
    var tvl = row.tvl_usd;
    var sizeRaw = Math.pow(tvl / model.size_ref_usd, model.size_exponent);
    var size = Math.min(model.size_cap, Math.max(model.size_floor, sizeRaw));
    var change = row.change_7d;
    if (change === null || change === undefined) change = 0;
    var clampedChange = Math.min(model.growth_cap, Math.max(model.growth_floor, change));
    var growth = 1 + (clampedChange / 100) * model.growth_weight;
    var age = row.age_days;
    if (age === null || age === undefined) age = model.unknown_age_days;
    var cappedAge = Math.min(Math.max(age, 0), model.maturity_days);
    var maturity = model.maturity_floor + (cappedAge / model.maturity_days) * model.maturity_range;
    var chainCount = (row.chains || []).length;
    var extraChains = Math.min(Math.max(chainCount - 1, 0), model.reach_max_chains);
    var reach = 1 + extraChains * model.reach_per_chain;
    return Math.max(1, Math.round(tvl * model.base_multiple * size * growth * maturity * reach));
  }

  /* ---------------------------------------------------------------- */
  /* Tiny DOM builder                                                 */
  /* ---------------------------------------------------------------- */

  // h('div', { class: 'x', text: 'y' }, child1, child2, [child3, child4])
  // 'class' sets className, 'text' sets textContent, 'html' sets innerHTML,
  // keys starting with 'on' register listeners, every other non-null value
  // becomes an attribute. Children may be nodes, strings, or arrays of nodes.
  function h(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      var keys = Object.keys(attrs);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        var v = attrs[k];
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), v);
        else if (v !== null && v !== undefined) node.setAttribute(k, v);
      }
    }
    for (var j = 2; j < arguments.length; j++) {
      var child = arguments[j];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) {
        for (var m = 0; m < child.length; m++) {
          if (child[m]) node.appendChild(child[m]);
        }
      } else if (typeof child === 'string') {
        node.appendChild(document.createTextNode(child));
      } else {
        node.appendChild(child);
      }
    }
    return node;
  }

  /* ---------------------------------------------------------------- */
  /* Farm plan: the same derivation main.ts writes to board.json.     */
  /* Mirror of lib/model.ts, table-driven instead of chained ifs.     */
  /* ---------------------------------------------------------------- */

  function primaryChain(p) {
    if (p.chains && p.chains.length > 0) return p.chains[0];
    return 'its main chain';
  }

  var GAS_TABLE = [
    { chains: ['ethereum'], text: '$4 to $8 of gas' },
    { chains: ['solana', 'sui', 'aptos', 'movement', 'seii'], text: 'about $0.01 of gas' },
    { chains: ['bnb chain', 'bsc'], text: 'about $0.20 of gas' },
    { chains: ['polygon', 'polygon zkevm'], text: 'about $0.05 of gas' },
    { chains: ['avalanche', 'fantom', 'cronos'], text: 'about $0.30 of gas' },
    { chains: ['tron'], text: 'about $1 of energy' },
    { chains: ['bitcoin', 'stacks', 'rootstock'], text: 'about $2 of network fees' },
    { chains: ['ton'], text: 'about $0.10 of gas' },
    { chains: ['near', 'cosmos', 'osmosis'], text: 'about $0.05 of gas' }
  ];

  function gasEstimate(chain) {
    var c = (chain || '').toLowerCase();
    for (var i = 0; i < GAS_TABLE.length; i++) {
      if (GAS_TABLE[i].chains.indexOf(c) >= 0) return GAS_TABLE[i].text;
    }
    return 'about $0.10 to $0.50 of gas';
  }

  var CAPITAL_TIERS = [[5e9, 250], [1e9, 150], [1e8, 100]];

  function stakeSize(p) {
    for (var i = 0; i < CAPITAL_TIERS.length; i++) {
      if (p.tvl_usd >= CAPITAL_TIERS[i][0]) return CAPITAL_TIERS[i][1];
    }
    return 50;
  }

  function holdDays(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }

  // First matching rule wins; the order below is part of the behaviour.
  var ACTION_RULES = [
    { keys: ['lend', 'cdp', 'collateral'], build: function (p, capital, chain) { return 'Supply $' + capital + ' of USDC to ' + p.name + ' on ' + chain + ' and keep the position open.'; } },
    { keys: ['dex', 'yield', 'leveraged farm'], build: function (p, capital, chain) { return 'Provide $' + capital + ' of liquidity to ' + p.name + "'s main pool on " + chain + ' and keep the position open.'; } },
    { keys: ['bridge'], build: function (p, capital, chain) { return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + p.name + ' and use the bridged funds in its app.'; } },
    { keys: ['staking', 'restak'], build: function (p, capital, chain) { return "Stake $" + capital + " of the chain's staking asset through " + p.name + ' and keep the receipt.'; } },
    { keys: ['perpetual', 'derivative', 'options'], build: function (p, capital, chain) { return 'Deposit $' + capital + ' of USDC as margin on ' + p.name + ' and open one small hedge.'; } },
    { keys: ['prediction'], build: function (p, capital, chain) { return 'Fund $' + capital + ' and place one market position on ' + p.name + '.'; } },
    { keys: ['curator', 'allocator', 'risk'], build: function (p, capital, chain) { return 'Deposit $' + capital + ' into a ' + p.name + ' vault on ' + chain + ' and keep the shares.'; } },
    { keys: ['stable'], build: function (p, capital, chain) { return 'Mint or deposit $' + capital + ' of the stable asset through ' + p.name + ' on ' + chain + '.'; } },
    { keys: ['rwa'], build: function (p, capital, chain) { return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.'; } },
    { keys: ['insurance'], build: function (p, capital, chain) { return 'Buy $' + capital + ' of cover from ' + p.name + ' on ' + chain + ' and keep the policy.'; } },
    { keys: ['launchpad'], build: function (p, capital, chain) { return "Commit $" + capital + " of USDC to " + p.name + "'s next launch on " + chain + ' and hold the allocation.'; } },
    { keys: ['farm'], build: function (p, capital, chain) { return "Stake $" + capital + " of LP tokens in " + p.name + "'s farm on " + chain + ' and keep the position.'; } },
    { keys: ['synthetic', 'basis'], build: function (p, capital, chain) { return 'Mint $' + capital + ' of the synthetic asset on ' + p.name + ' and hold the position.'; } },
    { keys: ['liquid'], build: function (p, capital, chain) { return 'Deposit $' + capital + ' of the liquid asset through ' + p.name + ' on ' + chain + ' and keep the receipt.'; } },
    { keys: ['nft'], build: function (p, capital, chain) { return 'List or buy one item through ' + p.name + ' on ' + chain + ' for about $' + capital + ' and keep the receipt.'; } },
    { keys: ['payment'], build: function (p, capital, chain) { return 'Pay $' + capital + ' through ' + p.name + ' on ' + chain + ' and keep the receipt.'; } }
  ];

  function primaryAction(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    for (var i = 0; i < ACTION_RULES.length; i++) {
      var keys = ACTION_RULES[i].keys;
      for (var j = 0; j < keys.length; j++) {
        if (c.indexOf(keys[j]) >= 0) return ACTION_RULES[i].build(p, capital, chain);
      }
    }
    return 'Deposit $' + capital + ' of USDC into ' + p.name + ' on ' + chain + ' and keep the position open.';
  }

  // Same shape as the primary rules, different order and different wording:
  // staking sits after the stable rule here, and there is no bridge rule.
  var FOLLOWUP_RULES = [
    { keys: ['lend', 'cdp', 'collateral'], build: function (p, small, chain) { return 'Borrow $' + small + ' against the deposit on ' + p.name + ' and repay it the same week, so the wallet shows both sides.'; } },
    { keys: ['dex', 'yield', 'leveraged farm'], build: function (p, small, chain) { return 'Swap $' + small + ' through ' + p.name + ' on ' + chain + ' once, so the wallet shows a trade as well as liquidity.'; } },
    { keys: ['perpetual', 'derivative', 'options'], build: function (p, small, chain) { return 'Close the hedge on ' + p.name + ' and open a second one for $' + small + ', so the wallet shows repeat use.'; } },
    { keys: ['prediction'], build: function (p, small, chain) { return 'Settle the first market on ' + p.name + ' and place a second $' + small + ' position.'; } },
    { keys: ['curator', 'allocator', 'risk'], build: function (p, small, chain) { return 'Move $' + small + ' into a second ' + p.name + ' vault on ' + chain + ' so the wallet shows two vaults.'; } },
    { keys: ['stable'], build: function (p, small, chain) { return 'Redeem $' + small + ' of the stable asset through ' + p.name + ' and re-mint it, so the wallet shows a full cycle.'; } },
    { keys: ['staking', 'restak'], build: function (p, small, chain) { return 'Delegate a second $' + small + ' stake through ' + p.name + ' so the wallet shows repeat staking.'; } },
    { keys: ['rwa'], build: function (p, small, chain) { return 'Buy a second $' + small + ' of the yield asset on ' + p.name + ' and hold it beside the first.'; } },
    { keys: ['launchpad'], build: function (p, small, chain) { return "Vote on " + p.name + "'s next launch with the allocation, if it opens a vote."; } }
  ];

  function followupAction(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var small = Math.max(10, Math.round(capital / 5));
    for (var i = 0; i < FOLLOWUP_RULES.length; i++) {
      var keys = FOLLOWUP_RULES[i].keys;
      for (var j = 0; j < keys.length; j++) {
        if (c.indexOf(keys[j]) >= 0) return FOLLOWUP_RULES[i].build(p, small, chain);
      }
    }
    return 'Do one more action on ' + p.name + ' for $' + small + ' — a swap, a vote or a second deposit — so the wallet shows repeat use.';
  }

  // The category's main risk, in the same order as the action rules: the first
  // key that matches decides the risk. A category no key matches gets the plain
  // contract risk. This mirrors lib/model.ts exactly, so the page's plan and
  // board.json's plan are the same strings.
  var RISK_RULES = [
    { keys: ['lend', 'cdp', 'collateral'], risk: 'a falling collateral price can liquidate the position' },
    { keys: ['dex', 'yield', 'leveraged farm', 'farm'], risk: 'liquidity positions can lose value to impermanent loss' },
    { keys: ['bridge'], risk: 'a bridge exploit or delay can strand the funds' },
    { keys: ['staking', 'restak'], risk: 'staked funds can be locked or slashed' },
    { keys: ['perpetual', 'derivative', 'options'], risk: 'leverage can liquidate the margin' },
    { keys: ['prediction'], risk: 'a market can resolve against the position' },
    { keys: ['stable'], risk: 'a stable asset can depeg' },
    { keys: ['rwa'], risk: 'the off-chain asset can default' }
  ];

  function riskFor(p) {
    var c = (p.category || '').toLowerCase();
    for (var i = 0; i < RISK_RULES.length; i++) {
      var keys = RISK_RULES[i].keys;
      for (var j = 0; j < keys.length; j++) {
        if (c.indexOf(keys[j]) >= 0) return RISK_RULES[i].risk;
      }
    }
    return 'the contract could be exploited';
  }

  function renderStep(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }

  function buildFarmPlan(p) {
    var chain = primaryChain(p);
    var stake = stakeSize(p);
    var hold = holdDays(p.age_days);
    var gas = gasEstimate(chain);
    var secondStake = Math.max(10, Math.round(stake / 5));
    var keepAbove = Math.max(10, Math.round(stake / 2));
    var steps = [
      {
        text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.',
        cost: 'nothing to create, and never pay anyone to set it up',
        time: '5 minutes'
      },
      {
        text: 'Buy $' + stake + ' of USDC on an exchange and withdraw it to the fresh wallet on ' + chain + ', checking the address twice before you send it.',
        cost: 'about $1 of withdrawal fee and ' + gas + ' on ' + chain,
        time: '15 minutes'
      },
      {
        text: primaryAction(p, stake, chain),
        cost: '$' + stake + ' of capital and ' + gas,
        time: '15 minutes to set up'
      },
      {
        text: followupAction(p, stake, chain),
        cost: 'about $' + secondStake + ' of capital and ' + gas,
        time: '10 minutes'
      },
      {
        text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote, and keep the position above $' + keepAbove + '.',
        cost: gas + ' a week',
        time: '10 minutes a week'
      },
      {
        text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot, and open the protocol' + "'s own points or rewards page once a week to check it is tracked.",
        cost: 'the $' + stake + ' stays in the position',
        time: hold + ' days'
      },
      {
        text: 'Know the risks: ' + riskFor(p) + '. An airdrop is never guaranteed. Skip this protocol if the gas and fees cost more than the value you expect, or if its TVL is held by a few wallets. Before you withdraw, claim only from the link the protocol itself publishes, never from a direct message, and write the wallet, the dates and every transaction hash in a farm log.',
        cost: 'no fee to check, and never pay to claim',
        time: '10 minutes'
      }
    ];
    return steps.map(renderStep);
  }

  function onWatchlist(r) {
    return !!r.watchlist;
  }

  /* ---------------------------------------------------------------- */
  /* View state in the URL hash                                       */
  /* ---------------------------------------------------------------- */

  function loadStateFromHash() {
    var raw = window.location.hash.replace(/^#/, '');
    if (!raw) return;
    var params = new URLSearchParams(raw);
    var q = params.get('q');
    var selected = params.get('p');
    var category = params.get('category');
    var chain = params.get('chain');
    var tab = params.get('tab');
    if (q) ui.q = q;
    if (selected) ui.selected = selected;
    if (category) ui.category = category;
    if (chain) ui.chain = chain;
    if (tab) ui.tab = tab;
    if (params.get('wl') === '1') ui.watchlistOnly = true;
  }

  function saveStateToHash() {
    var params = new URLSearchParams();
    if (ui.q) params.set('q', ui.q);
    if (ui.category !== 'all') params.set('category', ui.category);
    if (ui.chain !== 'all') params.set('chain', ui.chain);
    if (ui.watchlistOnly) params.set('wl', '1');
    if (ui.tab !== 'pre-token') params.set('tab', ui.tab);
    if (ui.selected) params.set('p', ui.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  /* ---------------------------------------------------------------- */
  /* Filtering and sorting                                            */
  /* ---------------------------------------------------------------- */

  function visibleRows() {
    var q = ui.q.trim().toLowerCase();
    return BOARD.rows.filter(function (r) {
      if (ui.watchlistOnly && !onWatchlist(r)) return false;
      if (ui.category !== 'all' && r.category !== ui.category) return false;
      if (ui.chain !== 'all' && (r.chains || []).indexOf(ui.chain) < 0) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }

  // One accessor per sortable column; the fallback is implied value.
  var SORT_KEYS = {
    name: function (r) { return r.name.toLowerCase(); },
    tvl: function (r) { return r.tvl_usd; },
    growth: function (r) { return r.change_7d === null ? -Infinity : r.change_7d; },
    age: function (r) { return r.age_days === null ? Infinity : r.age_days; },
    implied: function (r) { return r.implied_value_usd; }
  };

  function sortVisible(list) {
    var pick = SORT_KEYS[ui.sort] || SORT_KEYS.implied;
    var dir = ui.dir;
    return list.slice().sort(function (a, b) {
      var av = pick(a);
      var bv = pick(b);
      if (av < bv) return -dir;
      if (av > bv) return dir;
      if (a.slug < b.slug) return -1;
      if (a.slug > b.slug) return 1;
      return 0;
    });
  }

  /* ---------------------------------------------------------------- */
  /* View builders                                                    */
  /* ---------------------------------------------------------------- */

  function topBar() {
    var brand = h('div', { class: 'brand' },
      h('span', { class: 'mark' }),
      h('span', { class: 'brand-name', text: 'Token Radar' })
    );
    var meta = h('div', { class: 'top-meta' },
      h('span', { text: 'Snapshot ' + BOARD.as_of }),
      h('span', { text: 'DefiLlama protocol index' }),
      h('span', { text: BOARD.model_version + ' model' })
    );
    return h('header', { class: 'top' }, brand, meta);
  }

  function intro() {
    var floorMillions = Math.round(BOARD.floor_usd / 1e6);
    var heading = h('h1', { text: BOARD.watchlist_size + ' watchlist protocols, ranked by implied value' });
    var blurb = h('p', { text: 'The watchlist is the floor: every protocol with at least $' + floorMillions + 'M of TVL and no token on record. The early radar adds ' + BOARD.early_size + ' pre-token protocols the watchlist leaves out, below the floor and above it. Implied value is a model, not a promise.' });
    var copy = h('div', null, heading, blurb);
    var facts = h('div', { class: 'facts' },
      h('div', { class: 'fact' }, h('span', { text: 'Watchlist covered' }), h('b', { text: BOARD.watchlist_size + ' / ' + BOARD.watchlist_size })),
      h('div', { class: 'fact' }, h('span', { text: 'Pre-token rows scored' }), h('b', { text: String(BOARD.board_size) })),
      h('div', { class: 'fact' }, h('span', { text: 'Early rows the watchlist misses' }), h('b', { text: String(BOARD.early_size) })),
      h('div', { class: 'fact' }, h('span', { text: 'Live-token protocols set aside' }), h('b', { text: String(BOARD.live_size) }))
    );
    return h('section', { class: 'lede' }, copy, facts);
  }

  function topFive() {
    var top = BOARD.rows.slice(0, 5);
    var cards = top.map(function (r) {
      return h('button', {
        type: 'button',
        class: 'spot',
        onclick: function () { showDetail(r.slug); }
      },
        h('span', { class: 'rank', text: 'RANK ' + r.rank }),
        h('b', { text: r.name }),
        h('span', { class: 'val', text: formatMoney(r.implied_value_usd) }),
        h('span', { class: 'sub', text: formatMoney(r.tvl_usd) + ' TVL · ' + formatPct(r.change_7d) + ' 7d' })
      );
    });
    return h('section', { class: 'spotlight', 'aria-label': 'Top five by implied value' }, cards);
  }

  function filterBar() {
    var categories = Array.from(new Set(BOARD.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(BOARD.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();

    var search = h('input', {
      type: 'search',
      id: 'q',
      placeholder: 'Search name, category or chain',
      value: ui.q,
      'aria-label': 'Search the board'
    });
    search.addEventListener('input', function () {
      ui.q = search.value;
      saveStateToHash();
      paint();
    });

    var categoryOptions = [h('option', { value: 'all', text: 'All categories' })];
    categories.forEach(function (c) {
      categoryOptions.push(h('option', { value: c, text: c, selected: c === ui.category ? 'selected' : null }));
    });
    var select = h('select', { id: 'category', 'aria-label': 'Filter by category' }, categoryOptions);
    select.addEventListener('change', function () {
      ui.category = select.value;
      saveStateToHash();
      paint();
    });

    var chainOptions = [h('option', { value: 'all', text: 'All chains' })];
    chains.forEach(function (c) {
      chainOptions.push(h('option', { value: c, text: c, selected: c === ui.chain ? 'selected' : null }));
    });
    var chainSelect = h('select', { id: 'chain', 'aria-label': 'Filter by chain' }, chainOptions);
    chainSelect.addEventListener('change', function () {
      ui.chain = chainSelect.value;
      saveStateToHash();
      paint();
    });

    var wlInput = h('input', {
      type: 'checkbox',
      checked: ui.watchlistOnly ? 'checked' : null,
      'aria-label': 'Watchlist only'
    });
    wlInput.addEventListener('change', function (e) {
      ui.watchlistOnly = e.target.checked;
      saveStateToHash();
      paint();
    });
    var wl = h('label', { class: 'check' }, wlInput, 'Watchlist only');

    var pre = h('button', {
      type: 'button',
      'aria-pressed': ui.tab === 'pre-token' ? 'true' : 'false',
      text: 'Pre-token',
      onclick: function () { ui.tab = 'pre-token'; paint(); }
    });
    var live = h('button', {
      type: 'button',
      'aria-pressed': ui.tab === 'live' ? 'true' : 'false',
      text: 'Live token',
      onclick: function () { ui.tab = 'live'; paint(); }
    });
    var tabs = h('div', { class: 'tabs' }, pre, live);

    var countText = ui.tab === 'pre-token'
      ? visibleRows().length + ' rows shown'
      : BOARD.live.length + ' live-token protocols';

    return h('div', { class: 'controls' },
      h('div', { class: 'field' }, h('label', { for: 'q', text: 'Search' }), search),
      h('div', { class: 'field' }, h('label', { for: 'category', text: 'Category' }), select),
      h('div', { class: 'field' }, h('label', { for: 'chain', text: 'Chain' }), chainSelect),
      wl,
      h('div', { class: 'field' }, h('span', { class: 'sub', text: 'Token status' }), tabs),
      h('span', { class: 'count', text: countText })
    );
  }

  function sortButton(key, label) {
    var arrow = null;
    if (ui.sort === key) {
      arrow = h('span', { 'aria-hidden': 'true', text: ui.dir < 0 ? ' v' : ' ^' });
    }
    var button = h('button', {
      type: 'button',
      onclick: function () {
        if (ui.sort === key) ui.dir = -ui.dir;
        else { ui.sort = key; ui.dir = -1; }
        paint();
      }
    }, label, arrow);
    return h('th', { scope: 'col' }, button);
  }

  function chainLabel(r) {
    if (r.chains && r.chains.length) return r.chains.slice(0, 2).join(', ');
    return 'an unnamed chain';
  }

  function preTokenTable() {
    var list = sortVisible(visibleRows());
    if (list.length === 0) {
      var clear = h('button', {
        class: 'button primary',
        type: 'button',
        text: 'Clear filters',
        onclick: function () {
          ui.q = '';
          ui.category = 'all';
          ui.chain = 'all';
          ui.watchlistOnly = false;
          saveStateToHash();
          paint();
        }
      });
      var empty = h('div', { class: 'empty' },
        h('h2', { text: 'No protocol matches that filter' }),
        h('p', { text: 'Clear the search or pick another category to see the board again.' }),
        clear
      );
      return h('div', { class: 'panel' }, empty);
    }
    var max = list[0].implied_value_usd || 1;
    var tbody = h('tbody');
    list.forEach(function (r) {
      var growthText = r.change_7d === null ? 'n/a' : formatPct(r.change_7d);
      var growthClass = 'num ';
      if (r.change_7d !== null) growthClass += r.change_7d >= 0 ? 'pos' : 'neg';
      var barWidth = Math.max(3, Math.round((r.implied_value_usd / max) * 100));
      var sub = (r.category || 'Other') + ' on ' + chainLabel(r) + (onWatchlist(r) ? ' · watchlist' : '');
      var row = h('tr', {
        'data-selected': ui.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { showDetail(r.slug); },
        onkeydown: function (e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            showDetail(r.slug);
          }
        }
      },
        h('td', { class: 'num', text: String(r.rank) }),
        h('td', null, h('div', { class: 'name' },
          h('b', { text: r.name }),
          h('span', { class: 'sub', text: sub })
        )),
        h('td', { class: 'num', text: formatMoney(r.tvl_usd) }),
        h('td', { class: growthClass, text: growthText }),
        h('td', { class: 'num', text: formatAge(r.age_days) }),
        h('td', null, h('div', { class: 'implied' },
          h('div', { class: 'bar', 'aria-hidden': 'true' }, h('i', { style: 'width:' + barWidth + '%' })),
          h('span', { class: 'num', text: formatMoney(r.implied_value_usd) })
        )),
        h('td', null, h('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(row);
    });
    var head = h('thead', null, h('tr', null,
      sortButton('implied', 'Rank'),
      sortButton('name', 'Protocol'),
      sortButton('tvl', 'TVL'),
      sortButton('growth', '7d'),
      sortButton('age', 'Age'),
      sortButton('implied', 'Implied value'),
      h('th', { scope: 'col', text: 'Token' })
    ));
    var table = h('table', null,
      h('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
      head,
      tbody
    );
    return h('div', { class: 'panel' }, h('div', { class: 'table-wrap' }, table));
  }

  function liveTokenTable() {
    var tbody = h('tbody');
    BOARD.live.forEach(function (r) {
      var trend = r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg';
      tbody.appendChild(h('tr', null,
        h('td', { class: 'num', text: 'live' }),
        h('td', null, h('div', { class: 'name' },
          h('b', { text: r.name }),
          h('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + chainLabel(r) })
        )),
        h('td', { class: 'num', text: formatMoney(r.tvl_usd) }),
        h('td', { class: 'num ' + trend, text: formatPct(r.change_7d) }),
        h('td', { class: 'num', text: formatMoney(r.mcap_usd) }),
        h('td', null, h('span', { class: 'status live', text: 'already trades' }))
      ));
    });
    var head = h('thead', null, h('tr', null,
      h('th', { scope: 'col', text: 'Status' }),
      h('th', { scope: 'col', text: 'Protocol' }),
      h('th', { scope: 'col', text: 'TVL' }),
      h('th', { scope: 'col', text: '7d' }),
      h('th', { scope: 'col', text: 'Market cap' }),
      h('th', { scope: 'col', text: 'Token' })
    ));
    var table = h('table', null,
      h('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
      head,
      tbody
    );
    return h('div', { class: 'panel' }, h('div', { class: 'table-wrap' }, table));
  }

  function modelExplainer() {
    var m = BOARD.model;
    var sizeRefMillions = Math.round(m.size_ref_usd / 1e6);
    var firstLine = 'implied = round( tvl_usd x ' + m.base_multiple + ' x size x growth x maturity x reach )';
    var secondLine =
      'size = clamp((tvl_usd / $' + sizeRefMillions + 'M) ^ ' + m.size_exponent + ', ' + m.size_floor + ', ' + m.size_cap + ')  ·  ' +
      'growth = 1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + '  ·  ' +
      'maturity = ' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + '  ·  ' +
      'reach = 1 + min(chains - 1, ' + m.reach_max_chains + ') x ' + m.reach_per_chain;
    var explainer = 'Size has diminishing returns, so a small fast grower can outrank a large flat one. TVL and seven-day growth come from the snapshot. A protocol whose seven-day growth is not reported is treated as 0%: no bonus, no penalty, because unreported is not zero. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unknown age uses ' + m.unknown_age_days + ' days for maturity, a conservative default below the board\u2019s median age of 421 days. Age is shown rounded to one decimal in years in the table; the detail view gives the exact day count. Multipliers are shown rounded to six decimals, and the page recomputes each row from full precision. The implied range is the lowest and highest value across sensitivity runs that shift the growth weight (0.6 to 1.0), the unknown-age default (180 to 730 days) and the size exponent (-0.15 to -0.25); the top three never change across those runs. The main driver is the multiplier furthest from 1.0. Reach counts the chains a protocol runs on. The early radar is every pre-token protocol the watchlist leaves out that passes the same honesty test as the watchlist — no wrapped, staked or bridged product of a token that already trades — and the live-token protocols are set aside with their market caps shown.';
    return h('section', { class: 'panel model' },
      h('h2', { text: 'How implied value is computed' }),
      h('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      h('div', { class: 'formula' }, firstLine),
      h('div', { class: 'formula' }, secondLine),
      h('p', { class: 'sub', text: explainer })
    );
  }

  function honestyNote() {
    var text = 'Read it honestly: a protocol "records no token", never "has none" — its DefiLlama record may simply not carry one. Implied value is this entry\u2019s own claim from the snapshot\u2019s figures, never a price and never a prediction that a token is issued, or when. Farm plans are a starting point: check the protocol\u2019s own pages before you move money, and never pay anyone to claim.';
    return h('p', { class: 'note', text: text });
  }

  /* ---------------------------------------------------------------- */
  /* Detail dialog                                                    */
  /* ---------------------------------------------------------------- */

  var detailDialog = h('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  detailDialog.addEventListener('close', function () {
    ui.selected = null;
    saveStateToHash();
  });

  function showDetail(slug) {
    var match = BOARD.rows.filter(function (r) { return r.slug === slug; });
    var row = match[0];
    if (!row) return;
    ui.selected = slug;
    saveStateToHash();
    detailDialog.textContent = '';
    var steps = buildFarmPlan(row);
    var recomputed = recomputeImplied(row, BOARD.model);

    var headCopy = h('div', null,
      h('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + BOARD.board_size + (onWatchlist(row) ? ' · watchlist' : ' · early radar') }),
      h('h2', { id: 'detail-title', text: row.name }),
      h('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
    );
    var closeButton = h('button', {
      class: 'close',
      type: 'button',
      'aria-label': 'Close details',
      text: 'Close',
      onclick: function () { detailDialog.close(); }
    });
    detailDialog.appendChild(h('div', { class: 'detail-head' }, headCopy, closeButton));

    var ageText = (row.age_days === null || row.age_days === undefined)
      ? 'unknown (365d assumed for maturity)'
      : formatAgeExact(row.age_days);
    var growthText = (row.change_7d === null || row.change_7d === undefined)
      ? 'n/a (treated as 0%)'
      : formatPct(row.change_7d);
    var rangeText = formatMoney(row.implied_low) + ' – ' + formatMoney(row.implied_high);
    var driverText = row.driver + ' ×' + row.driver_multiplier;
    var equation = h('div', { class: 'equation' },
      h('div', null, h('span', { text: 'TVL' }), h('b', { class: 'num', text: formatMoney(row.tvl_usd) })),
      h('div', null, h('span', { text: 'Seven-day growth' }), h('b', { class: 'num', text: growthText })),
      h('div', null, h('span', { text: 'Age with no token' }), h('b', { class: 'num', text: ageText })),
      h('div', null, h('span', { text: 'Chains' }), h('b', { class: 'num', text: String((row.chains || []).length) })),
      h('div', null, h('span', { text: 'Size multiplier' }), h('b', { class: 'num', text: String(row.size_multiplier) })),
      h('div', null, h('span', { text: 'Growth multiplier' }), h('b', { class: 'num', text: String(row.growth_multiplier) })),
      h('div', null, h('span', { text: 'Maturity multiplier' }), h('b', { class: 'num', text: String(row.maturity_multiplier) })),
      h('div', null, h('span', { text: 'Reach multiplier' }), h('b', { class: 'num', text: String(row.reach_multiplier) })),
      h('div', null, h('span', { text: 'Implied value' }), h('b', { class: 'num', text: formatMoney(row.implied_value_usd) })),
      h('div', null, h('span', { text: 'Implied range' }), h('b', { class: 'num', text: rangeText })),
      h('div', null, h('span', { text: 'Main driver' }), h('b', { class: 'num', text: driverText }))
    );
    var checkText = 'Model ' + BOARD.model_version + ': the same function scores every protocol. The page recomputes this row as ' + formatMoney(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' The implied range is the lowest and highest value across sensitivity runs that shift the growth weight, the unknown-age default and the size exponent, and the main driver is the multiplier furthest from 1.0. This is an estimate, not a price.';
    if (row.change_7d === null || row.change_7d === undefined) {
      checkText += ' Seven-day growth was not reported, so the model gives no growth bonus or penalty (treated as 0%).';
    }
    if (row.age_days === null || row.age_days === undefined) {
      checkText += ' Age is unknown, so maturity uses the 365-day default.';
    }
    detailDialog.appendChild(h('section', { class: 'detail-section' },
      h('h3', { text: 'Implied value' }),
      equation,
      h('p', { class: 'sub', text: checkText })
    ));

    var stepItems = steps.map(function (s) {
      var cut = s.indexOf(' Cost: ');
      var action = cut >= 0 ? s.slice(0, cut) : s;
      var tail = cut >= 0 ? s.slice(cut + 1) : '';
      return h('li', null, h('b', { text: action }), h('span', { class: 'cost', text: tail }));
    });
    detailDialog.appendChild(h('section', { class: 'detail-section' },
      h('h3', { text: 'Farm plan' }),
      h('ol', { class: 'steps' }, stepItems)
    ));

    if (typeof detailDialog.showModal === 'function') {
      if (!detailDialog.open) detailDialog.showModal();
    } else {
      detailDialog.setAttribute('open', '');
    }
  }

  /* ---------------------------------------------------------------- */
  /* Render and boot                                                  */
  /* ---------------------------------------------------------------- */

  function paint() {
    mount.textContent = '';
    var shell = h('div', { class: 'shell' });
    shell.appendChild(topBar());
    shell.appendChild(intro());
    if (ui.tab === 'pre-token') shell.appendChild(topFive());
    shell.appendChild(filterBar());
    if (ui.tab === 'pre-token') shell.appendChild(preTokenTable());
    else shell.appendChild(liveTokenTable());
    if (ui.tab === 'pre-token') shell.appendChild(modelExplainer());
    shell.appendChild(honestyNote());
    mount.appendChild(shell);
    mount.setAttribute('aria-busy', 'false');
    if (!detailDialog.isConnected) mount.appendChild(detailDialog);
    if (ui.selected) showDetail(ui.selected);
  }

  loadStateFromHash();
  paint();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && detailDialog.open) detailDialog.close();
  });
})();
