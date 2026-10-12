# CEO v6 PLAN (2026-10-12) — from the CEO playtest findings

Source: CEO PDF (text + screenshots). Order = bugs + gameplay correctness first, then menu/flow, then loadout widgets, then stats/relics, then render/feel, then polish.
Rules: tests green + browser load after each package, commit + push, no AI attribution. Max 2-3 agents concurrently; packages in the same batch never share files.
Game data: `js/data/dota.js` is baked from SteamDatabase/GameTracking-Dota2 @217732b2 (`tools/bake.mjs`). No DLLs in repo (CEO's "client/server DLL" cross-check is INFEASIBLE here; we cross-check against the KV text files via GitHub raw instead).

## Batch 1 (concurrent)

### WP1 GAMEPLAY-CORE (opus) — files: js/sim/ranked.js, js/data/scenarios.js, js/data/difficulty.js, js/sim/units.js (enemy AI only), js/sim/spells.js (sunstrike), js/sim/combat.js, js/sim/hero.js, js/data/i18n.js (cfail keys) + js/data/i18n/scn.js + s3.js, js/input.js (countdown skip rule only), tests/*
1. BUG `FAILED: cfail.caught`: every scenario fail reason (caught cross seen method escaped tower died time) has a `cfail.<reason>` EN/PT string.
2. Enemy HP / skills mandatory: for every kill-type scenario the foe's HP is derived from the scenario's own step list (sum of the listed spells' damage at the scenario hero level/orbs, x ~0.9 so the full combo kills, auto-attacks alone cannot within the timer). Every kill objective requires the listed spells to have HIT (method fail otherwise, toast says which spell was missing). Right-click-only wins are impossible; attacking is allowed as filler.
3. Invisibility-escape redesign: enemies have NO true sight. While the hero is in Ghost Walk (and not inside a living Dire tower's vision = true sight), chasers walk to the LAST SEEN point, then run a search pattern (fan out / wander around last seen), never path to the hero. `caught` = hero is VISIBLE to a chaser within CAUGHT range or takes damage. Optional higher-level variant: one chaser carries Dust and uses it at the last-seen point (hero must leave the dust radius / already be gone). ghost_escape, ghost_slip, plateau_escape, gauntlet reworked accordingly. Scripted test: an invisible hero standing still 400 u off the last-seen point is never caught in 12 s.
4. Tower timer math: tower_siege (and any destroyTower scenario) time limit = time to kill the tower WITH the listed combo x 1.25 (computed from the tower HP, hero + spirit DPS and Meteor Hammer burn, with building damage gating), and strictly LESS than attack-only time. Document the numbers in the scenario comment; a test asserts with-combo < limit < without-combo.
5. Boots in every scenario: each `hero.items` gets `boots` or `travels` (decide by the distance the scenario needs covered within par: > ~1200 u of required movement -> travels). Never exceed 6 slots.
6. No pre-invoked spells in ranked/scenarios: remove `preinvoked` application. The 10 s countdown: Q/W/E/R (orbs + invoke) do NOT start the run and are executed (so the player can prepare); move / cast / item / attack / stop / hold start it and execute. HUD countdown text explains this (i18n key, WP2 renders it: `rk.countdown.hint` = "Invoke your spells now. Moving or casting starts the round.").
7. Fog of war ON for all scenarios/ranked/infinite regardless of difficulty (difficulty `fog` flag removed or forced true; the 'fog' twist becomes a no-op or is removed).
8. Sun Strike is pure and pierces spell immunity (Dota: `SpellImmunityType SPELL_IMMUNITY_ENEMIES_YES`): full damage to BKB'd targets (hero NPC BKB reduce too). Verify in the KV (dota.js bake / GitHub raw); test.
9. More fun scenarios per run: ranked pick weights 'fog'/'invisible'/'river'/'prediction'-tagged scenarios (Sun Strike, Tornado, Deafening Blast from the fog) so each 8-turn run contains >= 4 of them (test over 50 seeds).
Acceptance: `node --test tests/*.test.js` green, new tests for 1,2,3,4,6,7,8,9. Enemy HP numbers come from `IT.Values` (never hand-typed).

### WP2 HUD-FIXES (sonnet) — files: js/ui/hud.js, js/ui/hudsteps.js, css/hud.css, js/ui/dummychat.js, js/ui/menus.js (toast), js/ui/settings.js (hudMode row only), js/data/i18n/n4.js, js/data/i18n/f1.js, js/render/fx.js (gate line only), js/render/render.js (gate line hook only)
1. Scenario HUD: one compact mode only (CEO: "no more 3 scenario HUDs, MINIMAL is the default"). Remove the hudMode setting (migrate silently). Panel <= ~22 % of viewport height before the round, shrinks to a one-line strip (name + objective + timer + step icons) the moment the round starts.
2. Recipe hints: orb recipe (3 mini orbs) drawn under every spell icon in the bottom HUD (always on; the 'Recipe hints' checkbox gets an in-game explainer tooltip or is removed if redundant).
3. Toast alignment: speech toasts (dummychat) anchored above the speaker with the tail pointing at it; the FAILED/Caught toasts centered and stacked, never overlapping each other.
4. Countdown hint: render `rk.countdown.hint` text under the countdown number (key provided by WP1; fall back to EN text if missing).
5. Hotkey tips: step chips / item slots show the bound key (items: the item-slot key as it is in the items pane, e.g. "1"), and ATK / MOVE / STOP steps use an icon (pixel art, drawn in js/art/icons.js style) instead of text.
6. "Cross the river" / gate scenarios: an animated dashed line / ring on the ground at `w.gate` (render/fx.js), visible through fog.
Acceptance: screenshots in the browser (launch config "invoker", port 8123) at 1280x720 and 1920x1080 showing the before/after of the HUD; tests green.

## Batch 2 (concurrent)

### WP3 MENU-FLOW (sonnet) — files: js/ui/loadout.js (mode/map/enemy sections only), css/loadout.css, css/menus.css, css/settings.css, js/ui/settings.js (layout), js/main.js (start flow), js/ui/endsplash.js (Infinite Run button only), i18n keys
1. Main menu: two big buttons FREE PLAY / SCENARIOS (ranked). Their options appear only after the click. Remove "Training grounds". Remove the Dummy panel entirely (skins/difficulty tiers Training-Standard-Expert gone; dummies are placed in-game).
2. Free Play: map picker + ENEMIES: "Add enemy" button -> a row with skin picker (Pedro/Renan/Vitinho...) + difficulty; up to 5; placed in-game. The loadout (level/orbs/talents/items/aghs) is Free Play only.
3. Scenarios: everything predefined; show a compact scenario grid (cards in a wrapped grid, not a vertical stack) with level badge + name; ranked START.
4. Everything fits one screen at 1280x720 and 1920x1080 without scrolling: main menu, Free Play, Scenarios, Settings (tabs/columns if needed).
5. Infinite Run: removed from the main menu; appears on the end splash only when 8/8 cleared, as a red emphasized button.
Acceptance: browser screenshots of each screen at both sizes; tests green.

### WP4 RENDER-UNITS (opus) — files: js/sim/units.js (spirit collision/selection), js/sim/orders.js, js/render/units.js, js/render/towers.js, js/sim/towers.js, js/art/dummies.js (spirit portrait), js/render/terrain.js, js/render/light.js, js/render/fog.js, js/ui/hud.js (selected-unit card only, after WP2 lands)
1. Forge Spirits have collision (units push apart, never stack), the hero too.
2. Selecting a Forge Spirit swaps the HUD to that unit (portrait sprite, HP, attack) like selecting an enemy; move/attack/cast orders while a spirit is selected go to the spirit (controllable unit) and do NOT re-select the hero. Spell keys always cast from the hero.
3. Building sprites: barracks, ancient, outposts, shrines/fountain (whatever `maps.js` has) each get their own sprite; all buildings clickable with a status card (name, HP, armor).
4. Brighter, more colorful game: raise terrain/light palette saturation and brightness (fog outside vision stays dark). Before/after screenshots.
Acceptance: tests green, screenshots.

## Batch 3 (concurrent)

### WP5 LOADOUT-WIDGETS (sonnet) — files: js/ui/loadout.js (orbs/talents/aghs/items sections), css/loadout.css, js/art/hood.js, js/sim/agh.js, i18n
1. Aghanim picker (CEO p04/p05): the HUD hood (scepter top gem / shard bottom gem) drawn big with the three orbs clickable inside it: click 1 = Scepter on that orb (top lights up), click 2 = Shard on that orb's shard spell (bottom lights up), click again removes; both on the same orb -> click removes both. Sand physics like in-game. Below: the upgraded spell icon + a one-line explainer per upgrade (texts from the Dota explainer, p04_2: Quas->Ice Wall, Wex->Tornado, Exort->Sun Strike/Cataclysm; Shard: Ghost Walk / EMP / Sun Strike).
2. Orb points: 7 steps per orb (not 8); the Scepter +1 is drawn as an extra bead beyond the 7 with sand physics.
3. Items: two rows of 3 like Dota; drag and drop between slots.
Acceptance: screenshots; tests green (loadout tests updated).

### WP6 STATS-RELICS (opus) — files: js/sim/stats.js, js/ui/endsplash.js, js/ui/statsscreen.js, js/ui/share.js, js/art/medals.js, js/data/relics.js (new), js/ui/relics.js (new), css/splash.css, js/sim/ranked.js (medal rule only, after WP1), tools/ (relic bake)
1. Research: fetch Dota relics for Invoker from GameTracking-Dota2 (hero relic definitions + localization). Record source URL + commit in DECISIONS.md. Implement the relic list that our sim can measure (damage by spell, stuns, kills with X, etc.); skip the rest.
2. Medal = per-run (no cumulative rating): tiers from one 8-turn run's score; difficulty of tiers rebalanced; splash says the medal of THIS run.
3. Splash stats: TOTAL DAMAGE, DAMAGE BY SPELL (only spells that hit), a PHYSICAL / MAGICAL / PURE bar chart; drop "Sun Strike hits %". Clickable RELICS PROGRESS panel: relics advanced this run and how far they are.
4. Relic toast inside ranked with SFX + bloom/fanfare when a relic tier completes.
5. Stats screen: scrap the combo-bolt-style stats; show relics gathered + what is missing.
Acceptance: tests, screenshots of the splash + stats screen.

## Batch 4 (polish, as budget allows)
- WP7 COMBO-SANDBOX PANE (sonnet): js/ui/combobar.js + css: scrollable, icons, buttons, sliders; the skills+combo pane redone.
- WP8 ICONS (sonnet): js/art/icons.js / tools/icons_from_ref.py: middle ground between the old charming pixel icons and the new reference-like ones.
- WP9 ORNAMENTS (sonnet): css/v2.css, hud.css: more intricate pixel-art frame ornaments (CEO ref p11: medieval corner brackets, ribbons, banners).
- WP10 MUSIC (sonnet): js/music.js: upbeat main-menu theme, situation-based tracks (countdown, play, escape, victory).

## Needs CEO decision
- "Client & server DLLs" are not in the repo; we cross-check the KV text files only.
- Relics: Dota relic progression is per-hero cosmetic tracking; our version is a sim-measured approximation (not every relic is measurable).
