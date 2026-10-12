# Invoker Trainer — Change Plan (minified)
Abbrev: RMB=right click, LMB=left, SB=sandbox, CS=COMBO SANDBOX, FP=FREE PLAY, ench=enemy, dmy=dummy, HUD=top hud. Source of truth = this list; items are independent unless linked.

## A. BUGS
- A1 Char sometimes disappears between load/reload of game modes.
- A2 Ench/dmy flash in/out (disappear) when many onscreen.
- A3 RMB must not cancel attack orders like STOP does. Spam RMB → attack still goes through.
- A4 Units caught in tornado: lower section invisible while spinning.

## B. MODES / MENU
- B1 REMOVE combo practice. Only: RANKED, COMBO SANDBOX (CS).
- B2 CS: user picks SCENARIO **xor** FREE PLAY (never both). Scenario overrides everything (levels, skills, talents, maps…). FP only if no scenario: map picker, manual ench spawn, place-dummy (button → click map to spawn), ench pane (config + spawn).
- B3 (BIG) Easy→advanced progression. Add advanced combos (none now) + harder/creative scenarios: movement, high/low ground, vision, awareness, reaction time.
- B4 Menu option: "Unified unit orders w/ CTRL": while CTRL held, Invoker+Forges attack/move/stop/hold together.
- B5 Menu option: HUD mode (see F1).

## C. RANKED
- C1 Defined scenarios, sensible randomness, increasing difficulty, each w/ fitting map. Make MANY scenarios.
- C2 Pre-start 10s countdown: user reads flavor text/inspects surroundings. Skippable via action button; inspecting ench + camera drag do NOT skip.
- C3 Some scenarios start w/ skills pre-invoked; otherwise give enough time after countdown to invoke+cast (scale w/ difficulty & invoker level / invoke cd).
- C4 Ranked = fixed # of turns → medal rank at end.
- C5 End: colorful splash: medal, sand particles, bloom, music. Stats screen: ONLY relevant info (no garbage; design carefully). Shareable PNG of stats w/ laurels+ornaments, beauty scales w/ rank. Buttons: PLAY AGAIN / INFINITE RUN / GO BACK.
- C6 INFINITE RUN: loop of extreme-difficulty scenarios until user fails one → splash w/ #completed + stats.
- C7 Difficulty tiers (ranked + CS): IAN > EASY > COMMON > HARD > BAMBAM (w/ per-scenario randomness). Badge beside scenario. Hover explains tier.

## D. ENTITIES
**Dummy**: scarecrow look; no HP; stationary; casts nothing; only takes dmg/statuses. Easiest difficulty. In ranked + CS.
**Enemy**: capable NPC; 3 default skins (existing). Variable awareness. Behaviors: stationary / wandering / escaping / disable-you-then-escape / use items to defend. Configurable HP, can die → objectives often kill or escape (Ghost Walk = leave invisible). CS: manual spawn only if no scenario.
**Not selectable by drag** (towers, dmy, ench); click-select only; accept no orders; any action returns focus to invoker.
- D1 Ench items (ONLY these 5; research true values):
  - BKB: magic-immune to CC, much less magic dmg; turns yellow + bigger for duration.
  - Blink Dagger: blinks if not taking dmg.
  - Shadow Blade: invisible (player must buy detection); evades dangerous scenarios.
  - Eul's: self-cyclone, dispels, invulnerable.
  - Force Staff: evasive dash.
  - Combos allowed (e.g. Eul's → then try Blink away from skills). Invoker ground skills tick each server tick → ench can't blink out of well-timed ones (tornado, deafening blast).
- D2 Ranked/CS telegraph item use: "!" next to item icon above head. Duration ∝ difficulty (easy=long, hard≈0).
- D3 FP loadout: player configures everything about ench; build proper ench card to spawn them.

## E. CONTROLS
- E1 LMB drag → green outline rect; all units inside selected (forges selectable; orders: stop/hold/attack/move). Forges autogrouped.
- E2 TAB cycles selected units/groups (invoker ↔ forges group). Rebind old TAB action to another sensible key.

## F. HUD / UI
- F1 Scenario top-HUD, 3 modes (menu setting, think hard):
  - MINIMAL (= current ranked): only skill/move/item/attack icons.
  - DEFAULT: like current sandbox skill picker (bigger skill name + bigger icon, e.g. "Alacrity BASIC" + orb keys).
  - STEP BY STEP: DEFAULT + below it a concise timeline of presses (inputs + orb icons for each step: skill, movement, attack…); each step flashes and falls as done.
  - ALL modes show: brief scenario explanation, wind conditions, lose conditions.
- F2 Combo-explanation text is too small → much bigger.
- F3 Aghanim's UI redo: current icons tiny, descriptions confusing. Replace w/ Aghanim's Hood picker (orb-based art; sand physics on pick). 1st click orb = Scepter upgrade, 2nd click orb = Shard upgrade; click again on orb to remove; same orb for both → removes both.
- F4 Minimap prettier, w/ borders.
- F5 Hover tooltips (small toast) on nearly all HUD: abilities/items (usage+status), scenarios (explain difficulty), etc.
- F6 Icons: redo ALL to match Dota 2 originals (shapes, outlines, colors). Sources: liquipedia.net/commons/Category:Dota_2_Invoker_ability_icons and /Category:Dota_2_item_icons. Reason: playtesters can't recognize current ones; icons must identify scenario fast.

## G. PROGRESSION (Invoker)
- G1 Invoke CD by orb level (w/ Aghs scepter in parens): L3 6.1(5.8) · L6 4.9(4.6) · L9 4.0(3.7) · L12 2.8(2.5) · L15 1.9(1.6) · L18 0.7(0.4) · L21 0 (L20 w/ Aghs; scepter orb = +1 lvl). (−0.3s/orb lvl; orb lvl=Q+W+E sum)
- G2 Bonus ability point for orbs at hero lvl 6, 12, 18.
- G3 No ult. Only Q/W/E learnable; Invoke innate (unleveled); 10 spells scale from orb lvls. Orbs start locked (locked=unusable), 1 pt@lvl1, max lvl 7 (8 w/ scepter). Gate until lvl 13: orb lvl N needs hero lvl ≥2N−1 (lvls 1/3/5/7/9/11/13) → lvl 2 can't raise same orb, only unlock another; unspent pts bank. Assume 6/12/18 bonus pts gated too. Lvl 14+ unrestricted.
- G4 Lvl 27+: may pick other talents; all granted at 30.

## H. SCENARIO DESIGN
- H1 Each scenario: flair text + description. Examples: "Blink behind enemy tower and kill him with any combo" · "Kill 2 enemies with one skill" · "Don't let enemies cross the river" · "Finish the enemy with your forge spirits while invisible" · "Kill a fleeing target with Sun Strike" · "Kill an enemy from lower ground" · "Kill an enemy from the fog using Tornado + Sun Strike" · "Push 2+ enemies with one Deafening Blast".
- H2 Include elevation-centric scenarios (high ground, pathing) so Blink Dagger / Force Staff / pathing matter.

## User addenda (2026-10-12)
- Enemies that don't see the player have slower reaction times (awareness).
- Detection = Dust of Appearance; must be available in the Shadow Blade scenario(s).
- Force Staff and Dust of Appearance usable by the player in scenarios that need mobility; selectable in Free Play.
- Player has access to Shiva's Guard.
- Research Shiva's Guard and Gleipnir AoE (spells + mechanics). Show the ability rangefinder / AoE preview while aiming so the
  user sees the AoE before committing.
- Earlier batch still open: sand particles persist too long (distracting); tornado-lifted units must be more obvious.
