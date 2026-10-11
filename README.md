# Invoker Trainer

**Play: https://leandromeiramedeiros.github.io/InvokerTrainer/**

Top-down Dota 2 Invoker trainer in the browser. Build a loadout (hero level, orb points, talents, items, Aghanim's), then go ham on training dummies or run combo drills. Spell and item numbers are baked from the real game files.

## Data
Values come from `SteamDatabase/GameTracking-Dota2` (`npc_dota_hero_invoker.txt`, `items.txt`, `npc_units.txt`, hero base), pinned to commit `217732b2` (patch 6957, Oct 09 2026). Rebake with `node tools/bake.mjs`; `node tools/bake.mjs --check` diffs against the committed `js/data/dota.js`. Rule decisions and sources live in [DECISIONS.md](DECISIONS.md).

## Loadout rules
- Skill points: 1 per hero level, plus 1 extra at levels 6, 12 and 18.
- Orb level *n* needs hero level 2*n*−1, max 8. Invoke is innate; its cooldown is 7 s − 0.3 s per orb level.
- Talents at 10/15/20/25; the second talent of each tier unlocks at 27/28/29/30.
- Aghanim's Scepter: +1 level to one orb you pick, plus Cataclysm and the other Scepter upgrades. Shard: E.M.P. pull.
- Items: Refresher Orb, Rod of Atos, Scythe of Vyse, Shiva's Guard, Meteor Hammer, Black King Bar, plus Blink Dagger and boots.

## Controls (default)
| Key | Action |
|---|---|
| Q W E | Quas / Wex / Exort |
| R | Invoke (re-invoking a held spell just swaps slots) |
| D F | Cast invoked spell 1 / 2 (quick-cast at the cursor) |
| Z X C V B N | Items |
| Right click | Move / attack (Shift queues orders) |
| S / H | Stop / Hold |
| Space, L | Center camera, lock camera |
| Tab, F1, Esc | Live stats, cheat sheet, pause |

Settings: normal-cast mode (aim with range/AoE preview), the legacy one-key-per-spell scheme, and full rebinding with conflict detection. UI in English or Portuguese.

## Recipes
| Orbs | Spell |
|---|---|
| QQQ | Cold Snap |
| QQW | Ghost Walk |
| QQE | Ice Wall |
| WWW | E.M.P. |
| WWQ | Tornado |
| WWE | Alacrity |
| EEE | Sun Strike |
| EEQ | Forge Spirit |
| EEW | Chaos Meteor |
| QWE | Deafening Blast |

## Modes
- **Sandbox**: no prompts, 1–5 dummies, DPS meter, cooldown refresh.
- **Practice**: endless combo prompts your loadout can perform (or grant the missing items).
- **Timed**: 120 s of combos for score.

Dummies: Pedro, Renan and Vitinho, with Training (stationary), Standard (wander) and Expert (hides behind trees, dodges delayed spells) presets. Some combos have the dummy cast a stun bolt (counter it with BKB, a disable, or by leaving range) or blink away when hit (root it first, or Sun Strike the landing spot). Trees block vision, so fog of war is on.

## Run locally
Open `index.html` directly, or serve the folder. No build step. Tests: `node --test tests/*.test.js`.

Unofficial fan project. Dota 2 and Invoker are trademarks of Valve.
