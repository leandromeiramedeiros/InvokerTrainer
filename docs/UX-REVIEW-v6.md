# UX review v6 (#16a)

Method: browser walk at 1280x720 and 1920x1080, EN and PT, with an in-page audit (text < 11px, clipped text, page overflow) over title, Free Play (+ in-game pane), Scenarios, Shop, Stats, Settings, pause, intro, in-play HUD and enemy bar. Screenshots: `...\tool-results\mcp-Claude_Browser-blob-*.jpg` of the session (ids in the transcript); fixes live in `css/diffbar.css` (block "v6 #16a") plus in-place floor bumps in hud/sandbox/panels/v2.css.

Severity: S = broken/unreadable, M = clearly poor, L = polish.

| # | Screen | Size / lang | Issue | Sev | Fix |
|---|--------|-------------|-------|-----|-----|
| 1 | Title | all | Ribbon band spans the whole logo width, "TRAINER v6" text narrower than the band (director seed) | M | `.logo-b` fit-content, 1.9em, right padding offsets trailing letter-spacing |
| 2 | Scenarios | all | Tabs wrap to 2 lines, tag chips 3 lines of ~9px text, chip rows cramped (seed) | S | Tabs: one row, 0.88em, scroll if narrower. Tags: collapsible row behind a `Tags (n)` button (count kept), chips 0.85em in a framed scroll box. ANY/ALL toggle hidden until 2+ tags (was a dead disabled control) |
| 3 | Scenarios | all | Card name 0.8em, tag pills 0.62em, level badge small | M | 0.9em / 0.72em / 0.95em, brighter pill text |
| 4 | Title | all | Stats / Settings `slt sm` buttons tiny next to 1.4em big buttons (seed) | M | `.tmore .btn.slt` 1.2em, min-width 10em |
| 5 | Stats, Settings, Free Play, Scenarios | all | `.btn.sm` 0.85em / 0.8em (Reset, Back, Q/E, Clear, Fullscreen) | M | 0.95em, padding .4/1em; Stats buttons 1.1em |
| 6 | All | all | `--dim` #9a8fc0 (tagline, hints, footers, shop hint, relic header) low weight; 11 hard-coded copies | M | `#b4aadb` everywhere; tagline 1.15em, footer 0.9em |
| 7 | HUD (stats block, hotkeys, level badge, rank panel, step keys) | 1280 | Text floors 8-9px | M | floors raised to 10-11px (45+ rules), `.hc` >= 10px |
| 8 | Free Play side pane | all | Headers/tabs/names at 8-9px; chip keys 7px; kbd 8px | M | floors 10-11px; combo-guide chips 20-24px, keys 10px |
| 9 | Intro | 1280 | "Space / click: next  Esc: skip" hint drawn over the HP bar | M | hint moved to `bottom:26%`, 12px floor, brighter |
| 10 | Stats | 1280 | Relic names .74em, values .62em, badge .46em, header .72em | M | .84 / .76 / .56 / .8em, brighter value text |
| 11 | Stats | 1920 PT | "RELIQUIA ESPECIAL" badge 3px wider than its shield, clipped | M | tighter spacing/padding, `max-width:100%` + ellipsis |
| 12 | Settings | all | Key-group captions (Orbs, Invoke, ...) 9.8px, nav sub items dim, fine text dim | L | .8em, lighter grey |
| 13 | Splash | all | `.tl-sub` .66em grey | L | .76em, lighter |
| 14 | Shop, Pause, Title, Settings frame, Stats frame | both | Fit one screen, no overflow, ornaments consistent, no clipped text (EN + PT) | OK | none |
| 15 | Briefing countdown panel | 1280 | Briefing panel overlaps the countdown panel while it closes | L | Fixed in #16b |
| 16 | Pause | all | No on-screen hint that Esc resumes | L | Fixed in #16b |
| 17 | Between-round card, end splash tiers 1/4/7, Infinite Run, floating I/O panels, toasts | - | Not visually walked in this pass; only the shared font floors apply (`rccont`, toast, panel text all >= 10px) | - | Walked in #16b |

Counts: S 1, M 10, L 3 (fixed: all S/M; L #12, #13 fixed; #15/#16 fixed in the #16b follow-up).

Tests: `tests/ux_v6.test.js` (font floors >= 10px, dim colour, ribbon, buttons, Scenarios Tags row, hint position, i18n keys). `node --test tests/*.test.js` green.

## Follow-up walk (#16b)

Method: same in-page audit. Browser: splash tiers 1/4/7 + Infinite, toasts (generic, relic), pause, I/O panels, ranked/infinite intro+HUD at 1280 and 1920, EN and PT. Result card (`rccont`, 12 failure reasons + success) audited by injected DOM at 1280 EN/PT only (1920 scales proportionally; real play phase not reachable, rAF throttled). #15 verified by code only.

| # | Screen | Size / lang | Issue | Sev | Fix |
|---|--------|-------------|-------|-----|-----|
| 18 | End splash | 1280, EN+PT | Tiles, damage legend/labels, kicker, tier-list text .78em, under 11px | M | 11px floors, lighter grey (`css/diffbar.css`) |
| 19 | End splash | all | "none" / "on" notes under 11px | L | 11px floor |
| 20 | Result card / HUD | 1280 | `.hc` 10px, `.chead span` small | M | 11px floors |
| 21 | Relic toast / special panel | 1280 | `small`, points line, value text under 11px | M | 11px floors |
| 22 | Briefing | 1280 | #15 panel overlaps countdown while closing | L | `.rkp.cd` fade delayed .28s (after .25s close) |
| 23 | Pause | all | #16 no Esc hint | L | `.ph-hint` "Esc: resume" / "Esc: continuar" (`pause.hint`) |
| 24 | Between-round card, Infinite screen/HUD, I/O panels, generic toast | both | Clean | OK | none |

Counts: S 0, M 4, L 2 found and fixed (+ #15, #16 closed).


## Free Play panel redesign (#77 I9)

**I9 fix.** Roster rows (and `EnemyCard.place/spawnAll`) now build through `EnemyCard.build`: `spawnEnemy` + the tier's `exec` (item chance, prediction, jitter, dodge...) + `msMul` on move speed, mirroring `ranked.js apply`. Changing a row's difficulty re-spawns it with the new tier's execution. Before, every Free Play foe ran perfect EXEC0 (itemP 1, predict 1) at full speed whatever the bar said.

**Before** (one long scrolling column, ~8 stacked blocks): map line, DPS meter + sparkline, 4 tool icons, Time of day (Day / Night / Cycle + slider), "Enemies and dummies" (add buttons + rows), "Combos" header + search, tier chips, combo list. At the default 118x172 panel the combo list got ~14 em of what was left and the user scrolled past time of day and roster to reach it.

**After** (fixed header + 3 tabs, active tab body is the only scrolling area):
- Header, always visible: map line, DPS / peak / total numbers, tools strip (refresh, auto-refresh, reset targets, grant items).
- Tab **Roster**: + Enemy / + Dummy (n/max) and the rows (skin picker, remove X, DiffBar on enemies). The old "Enemies and dummies" heading is dropped (the tab names it).
- Tab **Match**: Time of day (Day / Night / Cycle + slider) and the damage graph (sparkline, redrawn only while shown).
- Tab **Combos**: count + search, tier chips, the list taking all the height; click pins the compact guide strip (#33).
- Tabs are a real `tablist` (arrow keys, `aria-selected`); the last tab is remembered (`it2.fp.tab`), default Roster.

**Rationale.** One concern visible at a time: fewer simultaneous controls, no scrolling past unrelated blocks, a taller combo list. Frequent actions (tools, DPS) stay one click away; rarely changed ones (time of day) move to Match. Strings: `js/data/i18n/fp.js` (EN + PT). Sparkline moved out of the header so a narrow panel keeps height for the tab body.

**What stayed.** Panel system (#10: drag, resize 104x96 .. 240x262, persisted, open button), `DiffBar` as the only difficulty control (same component, tooltip and labels), time-of-day controls and behaviour, the combo guide strip, pin/unpin logic, tool keys. Sizes: all text is em-based on `--u` and `max(.., 11px)`, so 1280x720 (u small) and 1920x1080 (u 1.5x) scale the same; `fit` scaling not used since the tab body scrolls. Reduced motion: transitions/animations in the panel, DiffBar and guide strip are off under `prefers-reduced-motion`.
