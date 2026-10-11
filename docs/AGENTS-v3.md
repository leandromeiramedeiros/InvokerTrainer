# v3 agent rules (shared by all Phase 1 agents)

Project: Invoker Trainer — vanilla JS browser game, no build step. Modules are IIFEs on the `IT` namespace (`(function (G) { 'use strict'; const IT = G.IT = G.IT || {}; ... })(typeof window !== 'undefined' ? window : globalThis);`). Sim (`js/sim/*`) is pure (no DOM). Internal canvas 480x270 (`IT.GAME.VIEW_W/H`), 1 screen px = 6 Dota units (`UNIT_PX`). Read `docs/PLAN-v3.md` (approved plan), `js/sim/CONTRACT.md`, `DECISIONS.md` as needed.

**Up to 10 agents edit this same working tree at the same time.**
1. Edit ONLY files you own (your prompt lists them). Need a change elsewhere? Don't edit — put the exact change under `REQUESTS` in your final report.
2. No state-changing git (no commit/stash/checkout/reset/add/restore). Read-only git is fine (e.g. `git show 1d8ea16^:js/sand.js`).
3. If an Edit fails because the file changed, re-Read and retry; never overwrite whole files you didn't create unless you own them.
4. UI strings: only in your own `js/data/i18n/<id>.js` via `IT.i18nAdd({ en: {...}, pt: {...} })` with real PT-BR. Read via `IT.t(key, vars)`. Prefix keys with your area (e.g. `rank.`, `set.`, `hud.`).
5. Style: match surrounding code — terse, dense, short comments, 2-space indent, no frameworks, no new dependencies.
6. Tests: `node --test tests/*.test.js` (`tests/_load.js` loads scripts into a vm; see existing tests). Add tests for sim/data logic you change. A failure in a file you don't own is probably another agent mid-edit: ignore it, mention it.
7. Don't start servers. A static server already runs at http://localhost:8123 (dev only).
8. Time box ≈ 90 min of work. Do items in listed order. If something can't be finished, ship a simpler working version and say so.
9. Final report ≤ 250 words: files changed, what each item does, public APIs added, `REQUESTS` for other owners, known gaps.

## Shared contract (Phase 0, commit 45e361b)
- Settings (`IT.Settings.get()`): existing `castMode, scheme, autoAttack(bool), camLock, edgeScroll, bloom, sound, hints, lang` + new `camSpeed (0.5..2)`, `doubleTap (bool)`, `doubleTapTimeout (0.2..1, default 0.6)`, `pointerLock (bool)`, `audio {master, music, sfx, ui (0..1), musicOn, muteUnfocused}`, new key action `attack` (default `A`). React to changes with `IT.Settings.onChange(fn)`.
- Loadout: `shard` + `shardSpell: 'ghostwalk'|'emp'|'sunstrike'` (validate errors if shard without spell); `IT.Loadout.SHARD_SPELLS`; `ctx.shardSpell` in `IT.Values.ctx`.
- `IT.Ranks.fromRating(r) -> {tier 0..7, stars 1..5 (0 for Immortal), name, id, next}` (js/data/ranks.js, done).
- `IT.Medals.canvas(tier, stars, px) -> canvas` (S6).
- `IT.Music.play(theme 'menu'|'sandbox'|'practice'|'ranked')`, `.stop()`, `.intensity(0..1)`, `.stinger('up'|'down'|'start'|'success'|'fail')` (S5).
- `IT.UISound.play('hover'|'click'|'back'|'start'|'error')` (S5).
- `IT.Cursor.set('default'|'attack'|'aim')` (S1). `IT.Input.toggleFullscreen()` (S1). `IT.Input.selected` = unit id shown in HUD, null = hero (S1 sets, H3 renders).
- `IT.App.back()` = ESC one level up (S3). `IT.App.go(name)` names: `'title'|'ranked'|'practice'|'sandbox'|'stats'|'settings'`.
- `IT.Items.swap(w, hero, i, j)` (done) — emits `itemSwap`.
- `IT.Ranked.profile() -> {rating, peak, games, last:{delta,score}}` and `IT.Ranked.hud(w) -> null | {phase:'countdown'|'play'|'result', countdown, timeLeft, runLeft, score, scenario (name), objective (text)}` (S3).
- Minimap (S4, render.js): 135x75 px at bottom-left (x=3, y=VH-78). HUD bottom bar (H3) starts right of it (left ≥ 30%).
- Item ids: `orchid`, `gleipnir` added; `treads` removed (S2 sim/data, S6 icons).
