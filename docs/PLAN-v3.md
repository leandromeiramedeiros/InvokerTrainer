# Invoker Trainer v3 — fix & feature plan

## Context
User reported 28 bugs/features after v2 phase 6. Confirmed in code: Forge Spirit count sums Quas+Exort counts (Dota uses the **lower**, [spells.js:347](js/sim/spells.js:347)); Shard is a single flag (Dota: pick one of Ghost Walk / EMP / Sun Strike upgrades); mode chosen inside Loadout; ESC only works in play; integer canvas scaling + no pointer capture break edge-scroll; v1 Noita sand sim (`sand.js`) was deleted, v2 only has a 2200-particle burst system; no music/volumes/camera speed; Alacrity has no self-cast or purple VFX; ranked mode, medals, Dota-style settings, cursors, dummy inspect don't exist. Goal: ship all items in **≤4 h**, Opus orchestrating, Sonnet for advanced work, Haiku for grunt work. [docs/PLAN-v3.md](docs/PLAN-v3.md) gets synced to this file at Phase 0.

### Added after review (#29–#33)
- **#29 Drag & drop inventory** in-game: drag item icons between the 6 slots to rearrange; item hotkeys follow the slot.
- **#30 Remove Power Treads** (no Invoker buys them): `GAME.ITEMS_EXTRA`, `items.js`, icon, i18n, `tools/bake.mjs` list + `js/data/dota.js` re-bake, tests, DECISIONS.
- **#31 Bindable keys**: `Settings.keyName` currently rejects CapsLock (treated as modifier) and most `ev.code` keys. Allow CapsLock, Mouse4/Mouse5, backquote/punctuation, numpad, F-keys (Tab/Esc stay reserved).
- **#32 Center/Select Hero (Dota behavior)**: 1st press selects hero (clears dummy selection); double press within timeout centers camera; holding keeps camera following hero until release.
- **#33 New items: Orchid Malevolence + Gleipnir** (`item_orchid`, `item_gungir`), baked from KV. Orchid: unit-target silence + damage-taken amp, burst on expire. Gleipnir: point AoE root (Eternal Chains) + damage, projectile. Plus combos/scenarios using them (Orchid > Cold Snap+Forge+Alacrity; Gleipnir > Sun Strike+Meteor+Blast; Gleipnir on clustered dummies) and pixel icons.

## Approved decisions
- **Ranked = persistent rating** (MMR-like), run delta clamp ±150, ~154/star: Herald 0–769 · Guardian 770–1539 · Crusader 1540–2309 · Archon 2310–3079 · Legend 3080–3849 · Ancient 3850–4619 · Divine 4620–5419 · Immortal 5420+ (no stars). Medal next to score.
- **Music = original procedural WebAudio**; themes menu/sandbox/practice/ranked (ranked tempo ramps last 30 s, stinger on medal change).
- **Practice scenarios (10):** Tornado>EMP>Meteor>Blast · ColdSnap+Forge+Alacrity · SS snipe fleeing · Blink>Meteor>Blast from fog · Atos/Hex>SS+Meteor · Tornado>SS timing · Refresher double M+B · Ice Wall+EMP pull · Ghost Walk escape · Cataclysm finish.
- **Difficulties:** Ianzinho > Easy > Normal > Hard > BAMBAM (stationary+hints+2x timer … 0.25 s reaction, fog, tight timer, lower orbs, dummy BKB).
- **Combo** = spells + movement/position + items used on dummy.
- **Cut order if late:** music depth first.

## Phase 0 — contract (Opus, 0:00–0:20)
Same working tree, strict file ownership. One commit with:
- `index.html` tags for all new files (empty stubs).
- `IT.i18nAdd({en,pt})` in `js/data/i18n.js`; each agent writes strings to its own `js/data/i18n/<agent>.js`.
- Settings defaults in `js/ui/settings.js` `defaults()`: `audio{master,music,sfx,ui,musicOn,muteUnfocused}`, `camSpeed`, `autoAttack:'always'|'never'`, `doubleTap`, `doubleTapTimeout:0.6`, `pointerLock`, `keys.common.attack:'A'`.
- Loadout (`js/sim/loadout.js` `normalize`): `shardSpell:'ghostwalk'|'emp'|'sunstrike'` required with shard (mirrors existing `scepterOrb` rule); Values applies `src:'shard'` mods only to that spell.
- Stubbed APIs: `IT.Ranks.fromRating`, `IT.Medals.canvas`, `IT.Music.play`, `IT.UISound.play`, `IT.Input.selected`, `IT.App.back()`, `IT.Items.swap(w, hero, i, j)`.
- Flow: Title → **RANKED** (direct) | **COMBO PRACTICE** (difficulty → run) | **SANDBOX** (loadout + scenario picker) | Stats | Settings.

## Phase 1 — parallel agents (0:20–2:30)

| Agent | Model | Owns | Delivers |
|---|---|---|---|
| S1 Input | Sonnet | `js/input.js`, `js/render/camera.js`, `js/ui/cursor.js` | Fullscreen button + fill-window scaling (replace `Math.floor` in `fit()` [main.js:15](js/main.js:15) via hook), edge-scroll at window edges, optional pointer lock w/ virtual cursor (#12). Dota pixel cursors default/red/cross (#5,#8). `A` attack-move. Double-tap + Alt self-cast: Alacrity self, Blink → bottom-left (#17,#18). Camera speed (#13). Repro test + fix for dropped fast-combo inputs: 60-u pick radius in `pickTarget`, out-of-range walk overridden, auto-attack priority, Alt/Ctrl drop at [input.js:161](js/input.js:161) (#20). Click dummy → `IT.Input.selected`, any action returns to hero (#21). Bindable CapsLock/Mouse4/5/punctuation via `keyName` (move key parsing here from settings.js) (#31). Select/Center Hero: tap selects, double-tap centers, hold follows (#32). |
| S2 Sim | Sonnet | `js/sim/{spells,units,hero,values,loadout,orders,items,world,abilities}.js` | Forge `min()` (#9). Shard choice effects (#28). Auto-attack never/always for hero+spirits via `idleAcquire` (#11). Lvl-30 stat audit (#6). Dummy items. Fix `emit` overwriting `payload.type`; fold `canUse` into `Abilities.check`. Remove Power Treads + re-bake via `tools/bake.mjs` (#30). Orchid + Gleipnir sim (KV-driven, BKB interactions) (#33). `IT.Items.swap` (#29). Tests. Also owns `tools/bake.mjs`, `js/data/dota.js`, `js/data/game.js`. |
| S3 Modes | Sonnet | `js/sim/combo.js`, `js/main.js`, `js/data/{combos,scenarios,difficulty}.js`, `js/sim/ranked.js`, `js/ui/{endscreen,statsscreen,modes}.js` | Mode-driven flow (#10). Scenarios + difficulties (#25). Sandbox full loadout + scenario picker (#26). Ranked: 5-min run, 5..1 frozen inspect countdown, per-scenario timer, ramp, rating (#27). Combo steps `move/position`, `itemOnDummy` (#22). New combos (#23) incl. Orchid/Gleipnir combos + scenarios (#33). `App.back()` (#1). |
| S4 VFX | Sonnet | `js/render/{fx,particles,render,light}.js`, `js/render/sand.js` | Visual-only Noita cellular layer (port ideas from deleted `git show 1d8ea16^:js/sand.js`): magma→stone, embers, lightning sparks, frost, wind dust; bloom, never lights fog (#7,#19). Alacrity purple flash + head sigil (#17). <3 ms/frame. |
| S5 Audio | Sonnet | `js/audio.js`, `js/sfx.js`, `js/music.js`, `js/ui/uisound.js` | Distinct per-spell synth voices (#19). UI hover/click sounds via delegation (#4). Procedural music (#14,#15). Mixer. |
| S6 Art | Sonnet | `js/art/medals.js`, `js/data/ranks.js`, `js/art/icons.js` | 8 pixel medals closely matching Dota references (original drawing, not Valve assets) + 5 star pips, Immortal none (#2). Orchid + Gleipnir pixel icons, drop treads icon (#30, #33). |
| H1 Settings | Haiku | `js/ui/settings.js` (panel), `css/settings.css` | Dota-like layout: left nav, QWER/D/F/R key row, Unit Orders groups, double-tap timeout slider, audio sliders, camera speed, fullscreen (#3). |
| H2 Loadout | Haiku | `js/ui/loadout.js`, `css/loadout.css` | Scepter one mini-icon toggle + orb picker; Shard one toggle + spell picker (#28). Remove mode selector, add scenario picker, drop dead `|| true`. |
| H3 HUD | Haiku | `js/ui/{hud,combobar}.js`, `css/hud.css` | Big minimap left; orbs above ability row (#16). Dummy inspect panel (#21). Ranked timer/countdown/medal. Drag & drop item slots calling `IT.Items.swap` (#29). |
| H4 Menus | Haiku | `js/ui/menus.js`, `css/menus.css` | RANKED "PLAY DOTA"-style button, slate secondary buttons (#27). Global ESC → `App.back()` (#1). Difficulty picker. |
| H5 Sweep | Haiku | `js/data/i18n/*`, `tests/*` | Phase 2: PT-BR check, missing keys, full test run. |

## Phase 2 — integrate (Opus, 2:30–3:30)
Resolve seams, run tests, browser-verify each item, fix gaps (re-dispatch Haiku/Sonnet for fixes in their own files).

## Phase 3 — QA + ship (Opus, 3:30–4:00)
`/code-review low` on diff, fix confirmed bugs, update DECISIONS.md/README, single commit, honest report of anything unfinished.

## Verification
- `node --test tests/*.test.js` green (new tests: forge count min, shard choice, auto-attack off, fast-combo input sequence, ranked rating math, ESC back chain).
- Browser preview (`.claude/launch.json`): Title → Ranked run (countdown, timer, medal + score at end) → Practice each difficulty → Sandbox loadout/scenario; Settings layout + volumes + camera speed; ESC from every screen; cursor states (default/red on enemy & A/cross aiming); fullscreen edge-scroll; Tornado+EMP+Meteor+Blast spam with no dropped casts; 8/8 Forge = 3 spirits; each shard effect; Alacrity double-tap/Alt self-cast + purple VFX; Blink double-tap → bottom-left; click dummy shows items; drag items between slots and hotkeys follow; Treads gone from loadout; bind CapsLock + Mouse4; Select Hero tap/double/hold; Orchid silence+burst and Gleipnir AoE root on dummies; spell sounds distinct; sand VFX visible and perf <3 ms (F3 debug overlay).
