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
| 15 | Briefing countdown panel | 1280 | Briefing panel overlaps the countdown panel while it closes | L | left (animation owner) |
| 16 | Pause | all | No on-screen hint that Esc resumes | L | left |
| 17 | Between-round card, end splash tiers 1/4/7, Infinite Run, floating I/O panels, toasts | - | Not visually walked in this pass; only the shared font floors apply (`rccont`, toast, panel text all >= 10px) | - | needs a follow-up walk |

Counts: S 1, M 10, L 3 (fixed: all S/M; L #12, #13 fixed, #15/#16 left).

Tests: `tests/ux_v6.test.js` (font floors >= 10px, dim colour, ribbon, buttons, Scenarios Tags row, hint position, i18n keys). `node --test tests/*.test.js` green.
