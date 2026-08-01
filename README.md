# Pal Trait Calculator

Unofficial Palworld breeding / trait calculator for **Palworld 1.0+**.

## Feature map

Compared against the two reference tools:

| Feature | palbreeding.com | paldb.cc | This app |
| --- | --- | --- | --- |
| Find parents for a target | ✓ | ✓ | ✓ |
| Find child from two parents | ✓ | ✓ | ✓ |
| Difficulty / progression filter | — | — | removed |
| Trending quick picks | ✓ | — | ✓ + icons |
| Browse all Pals + work stats | ✓ | wiki-wide | ✓ |
| Save preferences locally | ✓ | — | ✓ |
| Shortest path / breed tree | — | ✓ | ✓ |
| Include target as parent | — | ✓ | ✓ |
| Hide Terraria monsters | — | ✓ | ✓ |
| Multi-pal owned breeder (1st–3rd gen) | — | ✓ | ✓ |
| Mutation species table | notes only | ✓ UI | Overlay + passives* |

\*Official 1.0 notes say Mutation does **not** change child species. We show the same-species mutation overlay and the Mutation passives from the dump, rather than inventing an alternate species table.

## Data source

| Field | Value |
| --- | --- |
| Source | [tylercamp/palcalc](https://github.com/tylercamp/palcalc) **v1.18.3** |
| Published | 2026-07-31 (after Palworld **1.0.2**) |
| Dump DB version | `v27` |
| Coverage | 299 Pals · 44,851 combos |

## Scripts

```bash
npm run data:fetch   # download palcalc dumps
npm run data         # normalize into public/data
npm run dev
npm run build
```

## Disclaimer

Fan-made tool, not affiliated with Pocketpair. Breeding data derived from palcalc (MIT) game-file extraction.
