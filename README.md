# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Owlvans/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Owlvans/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: it ranks the protocols that record no token yet by what a token would be worth if it launched on today's record, and gives each one a farm plan. The board carries all 40 of the snapshot's watchlist protocols plus 158 early finds — every other pre-token protocol down to the snapshot's $5M floor, leaving out the wrapped, staked and bridged products of tokens that already trade — 198 rows in all. The 144 protocols whose token already trades are never ranked; they are the reference set the model prices from, shown apart in the dashboard with their real market caps.

The model prices every row with one function and no name special-cased: implied value = TVL × peer multiple × age × momentum × reach. The multiple is the market-cap/TVL of traded peers, read at category level, then family (8 families over the 54 categories), then global (median 0.2138× over the 129 references with a positive market cap), each level shrunk toward the one above with a prior weight of 4, geometrically — in log space, because a multiple is a ratio and one peer trading at 400× its TVL must move a category by a factor, not by hundreds of turns. Age prices a longer tokenless run up gently (0.85 + 0.10·ln(1+years), capped at 1.25; no listing date recorded is a neutral 1.00, flagged, with confidence capped), momentum damps the seven-day TVL change (weight 0.35, clamped to 0.85–1.20; unreported is neutral), and reach adds 2% per extra chain up to 1.08. Every row carries a confidence tier, and the dashboard's detail view shows the multiple, the level it came from and every factor, so each number can be checked rather than merely read. Farm plans are written from each protocol's own record — its category sets the work, its first chain the gas cost, its TVL the position size, its age the holding window — five steps each, every step with its cost and its time.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /input/snapshot.json
```

`main.ts` (Node 22, standard library only) reads the sealed snapshot, writes `board.json` and `data.js` to the output directory, copies `dashboard/` and `screenshots/` into it, and writes `dossier.json` last with the vendored library. It runs offline and deterministically: two runs write the same bytes.

---

<sub>Entered on [make.fun](https://make.fun/?ref=owl&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
