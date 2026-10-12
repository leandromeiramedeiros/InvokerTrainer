# v4 contract (plan: invoker_plan_min.md A–H + user addenda)

Source of truth for the user's wishes: the plan items quoted in each agent brief. This file is the shared contract between agents.
Conventions: classic IIFE scripts on `IT`, no build step, sim stays pure (no DOM). Keep line endings (CRLF files stay CRLF —
check with `file x.js`; use the Edit tool or Python normalize/restore). Tests: `node --test tests/*.test.js` must stay green;
add your tests in your OWN new test file. Never commit (orchestrator commits). index.html: add `<script>` lines with the Edit
tool only (never rewrite the file); new files go right after their closest sibling. i18n: only your own `js/data/i18n/<agent>.js`
(`IT.i18nAdd({ en:{...}, pt:{...} })`, PT-BR). View size is live: use `IT.GAME.VIEW_W/VIEW_H` at call time (scroll-wheel zoom),
HUD/screen layout uses base 480x270 (`--u`).

## Entities (owner: ENT)
- Foe test everywhere: `IT.Units.isFoe(e)` === `e.kind === 'dummy' || e.kind === 'enemy'`. Replace raw `kind === 'dummy'` checks in
  your own files with it when the code means "any target unit".
- **Dummy** `kind:'dummy'`: scarecrow; stationary, no AI, casts/uses nothing; takes damage + statuses, never dies (hp refills,
  emits 'refill'); `noHpBar:true`. `IT.Units.spawnDummy(w, { x, y })`.
- **Enemy** `kind:'enemy'`: NPC hero. `IT.Units.spawnEnemy(w, { x, y, skin, hp, armor, magicRes, ms, behavior, items, awareness,
  reaction, telegraph, preset })` -> ent. Dies at 0 hp (emits 'kill' {unit, by}); `behavior`: 'stationary' | 'wander' | 'escape' |
  'disable_escape' | 'defend'. `items` ⊆ ['bkb','blink','shadowblade','euls','forcestaff'] (Dota values, baked into
  js/data/dota.js where possible). `awareness`: 0..1; `e.aware` (bool, updated each think) = enemy team currently sees the hero
  (`IT.Vision.teamSees(w, 1, hero)`) or was hit in the last 2 s. Unaware enemies react slower (reaction x2.5, assumption logged).
- **Telegraph** (D2): before an enemy uses an item it sets `e.tele = { item, at, until }` and emits 'telegraph' {unit, item, lead};
  the item fires at `until`. `lead` = difficulty `telegraph` seconds (easy long … bambam ~0).
- Player items (selectable in Free Play, granted by scenarios that need mobility/detection): 'forcestaff', 'dust' (Dust of
  Appearance, reveals invisible in radius for its duration), 'shiva' (exists), 'gleipnir', 'orchid', 'blink', … `IT.Status.revealed(e)`
  true while dusted; `IT.Vision.canSee` must treat revealed invisible units as visible.
- Selection: towers / dummies / enemies are click-select only (never box-select), accept no orders; any action returns focus to Invoker.

## Progression (owner: PROG) — plan G1–G4
- `IT.Hero.levelInfo(lvl, orbs, scepter)`; orbs Q/W/E 0..7 (8 with scepter orb +1); invoke CD from orb-level sum table G1; bonus
  orb point at hero lvl 6/12/18; gate until lvl 13: orb lvl N needs hero lvl ≥ 2N−1; talents pickable from 27, all at 30.
- Loadout keeps `{ lvl, orbs:{q,w,e}, talents, items, scepter, scepterOrb, shard, shardSpell }`; `IT.Loadout.normalize` enforces rules.

## Orders / control (owners: PROG sim side, INPUT input side)
- A3: a move (RMB) issued while an attack order is in its wind-up does NOT cancel the attack (only Stop/Hold do).
- Units the player commands: hero + spirits. `IT.Orders.issueGroup(w, units, order)`. Selection state lives in input.js:
  `IT.Input.sel = { units:[ids], group:'hero'|'spirits'|'all' }`; TAB cycles hero ↔ spirits group; CTRL held (setting
  `unifiedOrders`) sends orders to hero + spirits together. Settings: `unifiedOrders:true`, `hudMode:'default'|'minimal'|'steps'`.

## Scenarios v4 (owner: MODES format/engine, CONTENT fills)
```
{ id, level 1..10 (progression), tags:['movement','highground','vision','awareness','reaction','burst','multi','escape',...],
  name:{en,pt}, flair:{en,pt} (1-line story), desc:{en,pt} (what to do), win:{en,pt}, lose:{en,pt},
  map:'id' (IT.Maps id), countdown:10,
  hero:{ lvl, style?, orbs?, items:[...], scepter?, scepterOrb?, shard?, shardSpell?, preinvoked:[spell,spell?], at?:{x,y}|'spawn' },
  units:[ { type:'dummy'|'enemy', dx, dy | at:{x,y}, ...spawnEnemy opts, mot? } ],
  obj:{ type:'kill'|'killN'|'killOne'|'escape'|'hold'|'push'|'kill_with'|'destroyTower', ... },
  fail:[ 'time'|'died'|'cross'|'escaped'|'seen' ...], par (s), steps:[{a, at?, label?}] (STEP-BY-STEP HUD + test bot),
  rand:{ ... per-scenario randomness ranges } }
```
Difficulty tiers (C7): ids `['ian','easy','common','hard','bambam']`, `IT.DIFFICULTY.get(id)` adds `telegraph`, `awareness`,
`reaction`, `hpMul`, `armorAdd`, `timer`, `hints`, `fog`, `desc:{en,pt}` (hover text).

## Maps (owner: MAPS) — docs/MAPS-v3.md stays valid (towers merged into MAPS). Cut: ≥10 maps (not 20).

## Modes (owner: MODES) — B1/B2/C*
Title: RANKED | COMBO SANDBOX | Stats | Settings. Combo Practice removed. Sandbox = Scenario picker XOR Free Play
(map picker, place-dummy, enemy card + spawn). Ranked: fixed turns (8), 10 s skippable countdown, medal at end, splash + stats +
PNG share, PLAY AGAIN / INFINITE RUN / GO BACK. Infinite run: extreme scenarios until first fail.
