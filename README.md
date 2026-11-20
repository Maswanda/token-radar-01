# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Maswanda/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Maswanda/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar (radar-3) ranks pre-token DeFi protocols by an implied token value derived from a sealed DefiLlama snapshot. It covers the full 40-protocol watchlist plus the early radar of pre-token protocols the watchlist leaves out, gives every protocol a concrete eight-step farm plan with costs and times, states how uncertain each implied value is, and renders a dark, sortable, filterable dashboard with a detail view per protocol.

## Model (radar-3)

Every protocol is scored by the same formula — no protocol name is ever hard-coded, no outside data is used, and nothing touches the network:

```
implied = round(tvl × 0.25 × size × growthMult × maturityMult × reachMult)
size        = clamp((tvl / 1e8)^-0.2, 0.45, 1.5)   — diminishing returns on TVL
growthMult  = 1 + clamp(change_7d, -50, 150) / 100 × 0.8
maturityMult = 0.7 + min(age_days, 1095) / 1095 × 0.5
reachMult   = 1 + min(chains - 1, 4) × 0.05
```

- **Size** compresses TVL: a protocol ten times the TVL is not ten times the value, so a small fast grower can outrank a large flat one.
- **Growth** is the strongest signal (weight 0.8) and is clamped to −50%…+150%, so one outlier week cannot buy a top rank on its own. Without the clamp, shift-defi (+4,448.5% in seven days) would be worth $363,930,541 and take rank #2; clamped, it is $21,882,902 at rank 37.
- **Maturity** rewards time run with no token (0.7–1.2). An unknown listing date uses **365 days** — a conservative default below the board's median age of 421 days — and the dashboard says so wherever it applies.
- **Reach** adds 5% per extra chain, up to four extra chains (1.0–1.2).
- **Missing growth** is treated as 0%: no bonus, no penalty, because unreported is not zero. Only two board rows have unreported seven-day growth (estate-protocol, swan-dao).
- Multipliers are stored to **six decimals**, so multiplying the figures shown lands within a few hundred dollars of the implied value. Each row also names its **main driver** — the multiplier furthest from 1.0 (size drives 132 rows, maturity 36, reach 15, growth 14).

## Validation

The baseline constants (growth weight 0.8, unknown age 365 days, size exponent −0.2) were kept after holdout / leave-one-out validation on the sealed snapshot — no constant was changed, because no test supported changing one:

- **Leave-one-protocol-out (top 50):** max |Δrank| **1**, **0 inversions**, top-20 overlap **20/20**, top-50 overlap **50/50**, Spearman rho **1.0000**. Removing rank #1 only promotes #2 mechanically.
- **Leave-one-signal-out:** no single signal carries the ranking. Rank #1 (steakhouse-financial) survives all four ablations. Growth is the most disruptive to remove (max shift 63 — nuva 74→137, shift-defi 37→78; rho 0.9866); age moves the middle of the board most (mean shift 6.74, max 30); chains max 16; size max 10 (rho 0.9992).
- **Split-half holdout:** rho **1.0000** and **0 inversions** in all four halves (odd/even ranks, TVL above/below median).
- **Jackknife over the 9 sensitivity runs:** removing the baseline run shrinks **no** row's range at all — the baseline is an interior point, not a cherry-picked extreme. Removing any other single run shrinks total width by at most 3.5%.
- **Most fragile rows:** growth-clamped outliers (nuva, shift-defi, monolith-market, anemoy-capital) and unknown-age rows (plasma-one, range 41.1% wide; kava-mint; set-protocol; defi-saver-asset-management, rank 19 — the only top-20 row sensitive to the unknown-age default). Both causes are shown in the dashboard as the row's range and driver, not hidden.

Honest limit: every test above uses the same sealed snapshot, so this is **internal stability, not predictive power** — it says the ranking does not hinge on one protocol, one signal, or one constant, not which protocol will actually launch a token. Leave-one-protocol-out and split-half cannot reorder by construction (each protocol is scored independently); the evidence for the constants is the leave-one-signal-out and jackknife results.

## Uncertainty

Each row carries an **implied range** — the union of the 9 parameter-sensitivity runs (growth weight 0.6/1.0, unknown age 180/730 days, size exponent −0.15/−0.25, plus the two combined extremes) and 2 input-noise corners (TVL ±5%; seven-day growth ±2 points when reported, ±25 points when not reported; age ±30 days when known, 180–730 days when unknown). The point estimate always lies inside its own range.

- Median relative width: **15.7%** (v2 reported 9.9% from sensitivity runs alone; v3 adds input noise, so ranges are wider and more honest).
- Widest rows: **swan-dao** (rank 194, 52.6% — unreported growth and age 2 days) and **estate-protocol** (rank 122, 50.6% — unreported growth). The two unreported-growth rows span 50.6–52.6%; unknown-age rows have a median width of 41.3%. No row's range exceeds 53%.
- Rank #1, steakhouse-financial: **$344,703,536–$470,021,429** around a point estimate of $396,446,551. It is #1 in all 9 sensitivity runs, as are #2 (sentora-curator) and #3 (gauntlet).

## Farm plan (cost/ROI)

Each protocol gets an **8-step farm plan** derived from its own record (category, chains, TVL, age). Total cost is gas across every transaction in the plan, at the midpoint of the gas band for its chain, plus a **$1 withdrawal fee**. Capital is **not** a cost — it stays in the position and comes back on withdrawal. The plan holds 30 days for protocols aged ≥1 year (or unknown age), 45 days for 180–364 days, and 60 days for under 180 days — **9, 11, or 13 transactions** respectively.

Gas midpoints per transaction: Ethereum $6, Solana $0.01, BNB $0.20, Polygon $0.05, Avalanche $0.30, Tron $1, Bitcoin $2, Ton $0.10, Near/Cosmos $0.05, other chains $0.30. Capital per position follows TVL: $50 below $100M, $100 at $100M+, $150 at $1B+, $250 at $5B+.

Cost distribution across the board (total cost, gas + $1 fee):

| Capital tier | n | Median cost | Max cost |
|---|---:|---:|---:|
| $50 | 161 | $4.30 | $79 |
| $100 | 31 | $4.90 | $79 |
| $150 | 5 | $3.70 | $55 |
| $250 | 0 | — | — (max board TVL is $2.76B) |

Examples (cost : implied value is a scale check, never a promised return):

| Rank | Protocol | Capital | Total cost | Implied value | Ratio |
|---:|---|---|---:|---:|---:|
| 1 | steakhouse-financial | $150 | $3.70 | $396,446,551 | 1 : $107,147,716 |
| 99 | drakewell | $50 | $4.90 | $7,382,283 | 1 : $1,506,588 |
| 197 | monarq | $50 | $4.90 | $1,197,735 | 1 : $244,436 |

The last step of every plan states the category's main risk (liquidation, impermanent loss, bridge stranding, slashing, depegging, and so on — or the plain contract risk when no category matches) and when to skip the protocol outright. **Implied value is the whole protocol's modelled value, not a farmer's payout, and an airdrop is never guaranteed.**

## Coverage

- **197 rows:** the watchlist **40/40** plus **157** early-radar protocols that pass the same honesty test as the watchlist (pre-token, and not a wrapped, staked, or bridged product of a token that already trades). Ranks 1–197 are exact and implied values are non-increasing.
- **24 live-token protocols** are set aside, sorted by market cap descending, and shown with the market's own values — never mixed into the ranked board.
- Rank #1 is **steakhouse-financial** ($396,446,551 implied), stable across all sensitivity runs and all validation ablations.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/snapshot.json
```

Node 22, standard library only, no network. `main.ts` reads the sealed snapshot, builds the board (`out/board.json`), the dashboard data (`out/dashboard/data.js`), and the dossier — running it twice produces byte-identical output. Open `out/dashboard/index.html` in a browser to explore the board; no server is needed.

---

<sub>Entered on [make.fun](https://make.fun/?ref=y6c0jsf3&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
