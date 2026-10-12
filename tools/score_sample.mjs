// v6 medal: sample the per-run score (clear + relic parts) of full 8-turn ranked runs played headlessly by the scripted bot
// (the same step-following bot as tests/scenarios_v5.test.js, driving one world through the run's scenario swaps).
// Usage: node tools/score_sample.mjs [--seeds 8] [--set ramp,fixed] [--players clean,sloppy] [--json]  (also prints the mean relic points per relic over all runs)
//   ramp  = real ranked ramps (rampDiff from the rating band: ian / easy / common / hard start, +1 every 3 turns)
//   fixed = the whole run at one difficulty (ian .. bambam) -- the run's diffIndex is forced, the level ramp follows the matching rating band
//   clean = the bot as scripted (near-perfect); sloppy = an average player: 0.4..2.5 s hesitation before each step and a 15 % chance to drop a step
// Prints p10 / p50 / p90 / p95 of total, clear and relic per group, and the medal each percentile gets (IT.Ranks.fromRun).
// 'proj' = the run projected to 8/8 (the bot cannot clear every hard / bambam scenario): every turn cleared at the run's mean clear speed,
//   relics = the mean of its solved scenarios x 8 -- the "near-perfect player at that difficulty" estimate the thresholds are tuned on.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['js/data/dota.js', 'js/data/rules.js', 'js/data/game.js', 'js/data/daynight.js', 'js/data/map.js', 'js/data/dotaworld.js', 'js/data/maps.js',
  'js/data/i18n.js', 'js/data/i18n/s3.js', 'js/data/i18n/f1.js', 'js/data/i18n/scn.js', 'js/data/i18n/relics.js',
  'js/data/combos.js', 'js/data/scenarios.js', 'js/data/difficulty.js', 'js/data/ranks.js', 'js/data/relics.js',
  'js/sim/util.js', 'js/sim/values.js', 'js/sim/world.js', 'js/sim/status.js', 'js/sim/abilities.js', 'js/sim/combat.js',
  'js/sim/nav.js', 'js/sim/vision.js', 'js/sim/loadout.js', 'js/sim/hero.js', 'js/sim/invoke.js', 'js/sim/orders.js',
  'js/sim/units.js', 'js/sim/towers.js', 'js/sim/spells.js', 'js/sim/items.js', 'js/sim/combo.js', 'js/sim/ranked.js', 'js/sim/stats.js'];
function load() {
  const ctx = vm.createContext({ console, Math, JSON, Date, Map, Set, Array, Object, Number, String, Boolean, Error, Symbol, Promise, Float32Array, Float64Array, Int8Array, Int16Array, Int32Array, Uint8Array, Uint16Array, Uint32Array, Uint8ClampedArray, Infinity, NaN, isFinite, isNaN, parseInt, parseFloat });
  for (const f of FILES) if (fs.existsSync(path.join(ROOT, f))) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return ctx.IT;
}
const IT = load();
const R = IT.Ranked;

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const SEEDS = +arg('seeds', 8), SETS = arg('set', 'ramp,fixed').split(','), PLAYERS = arg('players', 'clean,sloppy').split(','), JSON_OUT = process.argv.includes('--json');
const RAMPS = { ian: 0, easy: 800, common: 2000, hard: 3500 };            // rating -> baseDiff 0..3
const FIXED = { ian: 0, easy: 800, common: 2000, hard: 3500, bambam: 3500 };

// ---------------------------------------------------------------- bot (tests/scenarios_v5.test.js, adapted to a shared ranked world)
function prep(w, h, ab) {
  if (!IT.GAME.SPELL_ORBS[ab] || h.inv.slots.includes(ab) || h.inv.invokeCd > 0) return;
  for (const ch of IT.GAME.SPELL_ORBS[ab]) IT.Invoke.orb(w, h, ch);
  IT.Invoke.invoke(w, h);
}
function playScenario(run, w, h, ctl, rnd, sloppy) {
  const live = () => run.phase === 'play' && !run.ended, sc = run.pr.sc;
  const trail = [];
  const step = n => { for (let i = 0; i < (n || 1) && live(); i++) { w.step(); trail.push(run.dummies.map(d => ({ x: d.x, y: d.y }))); if (trail.length > 10) trail.shift(); } };
  const al = () => run.dummies.filter(d => !d.dead);
  ctl.casts = 0; ctl.tornT = null;
  if (sc.fail.includes('method')) h.autoAttack = false;
  for (const s of sc.steps) {
    if (!live()) break;
    if (sloppy) {   // hesitation, and now and then a step forgotten
      for (let k = 0, n = Math.round(30 * (0.4 + 2.1 * rnd())); k < n && live(); k++) { prep(w, h, s.a); step(); }
      if (rnd() < 0.15) continue;
    }
    const until = w.t + (s.w || 0);
    while (live() && w.t < until - 1e-6) { prep(w, h, s.a); step(); }
    if (s.a === 'sunstrike' && ctl.tornT != null && w.t - ctl.tornT < 3) for (let k = 0; k < 30 * 3 && live() && !al().some(q => IT.Status.find(q, 'lift')); k++) { prep(w, h, s.a); step(); }
    if (s.a === 'sunstrike') for (let k = 0; k < 30 * 5 && live(); k++) { const f = al().find(q => IT.Status.find(q, 'lift')); if (!f || IT.Status.find(f, 'lift').until - w.t <= 1.62) break; prep(w, h, s.a); step(); }
    for (let k = 0; k < 400 && IT.GAME.SPELL_ORBS[s.a] && !h.inv.slots.includes(s.a) && live(); k++) { prep(w, h, s.a); step(); }
    const pickT = () => { const f = al().filter(q => !IT.Status.find(q, 'lift')), d = f.length ? f : al(); return s.at === 'd1' ? (d[1] || d[0]) : (d[0] || al()[0]); };
    if (s.near) for (let k = 0; k < 30 * 10 && live(); k++) { const q = pickT(); if (!q || Math.hypot(q.x - h.x, q.y - h.y) <= s.near) break; prep(w, h, s.a); step(); }
    if (s.a !== 'sunstrike' && s.a !== 'move' && s.a !== 'attack') for (let k = 0; k < 30 * 10 && live(); k++) { const q = pickT(); if (!q || !IT.Status.has(q, 'magicImmune')) break; prep(w, h, s.a); step(); }
    if (s.a === 'sunstrike' && s.at === 'd0') for (let k = 0; k < 90 && live(); k++) {
      const q = pickT(), o = q && trail[0] && trail[0][run.dummies.indexOf(q)];
      if (!q || !o || Math.hypot(q.x - o.x, q.y - o.y) / Math.max(1, trail.length - 1) * 30 < 40) break;
      step();
    }
    const unitT = (IT.Abilities.get(s.a) || {}).target === 'unit';
    if (unitT && (s.at === 'd0' || s.at === 'd1')) for (let k = 0; k < 30 * 8 && live(); k++) {
      const q = pickT(); if (!q || q.visible) break;
      if (k % 6 === 0) IT.Orders.issue(w, h, { type: 'move', x: q.x, y: q.y });
      prep(w, h, s.a); step();
    }
    const aim = () => {
      const d = al(), t0 = pickT();
      let t = t0 ? { x: t0.x, y: t0.y, id: t0.id } : null;
      if (s.at === 'self') t = { x: h.x, y: h.y, id: h.id };
      else if (s.at === 'mid' && d.length) t = { x: d.reduce((a, q) => a + q.x, 0) / d.length, y: d.reduce((a, q) => a + q.y, 0) / d.length };
      else if (s.at === 'gate' && w.gate) t = { x: w.gate.x, y: w.gate.y };
      else if (s.at === 'tower') { const tw = w.ents.filter(q => q.kind === 'tower' && q.team === 1 && !q.dead).sort((a, b) => Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(b.x - h.x, b.y - h.y))[0]; t = tw ? { x: tw.x, y: tw.y, id: tw.id } : null; }
      else if (s.at === 'lead' && t0) {
        const o = trail[0] && trail[0][run.dummies.indexOf(t0)] || t0, T = Math.max(1, trail.length - 1) / 30;
        t = { x: t0.x + (t0.x - o.x) / T * 1.75, y: t0.y + (t0.y - o.y) / T * 1.75 };
      }
      return t;
    };
    const t = aim();
    if (!t) break;
    if (s.a === 'move') { IT.Orders.issue(w, h, { type: 'move', x: t.x, y: t.y }); for (let k = 0; k < 30 * 8 && live() && Math.hypot(h.x - t.x, h.y - t.y) > 450; k++) step(); continue; }
    if (s.a === 'attack') { IT.Orders.issue(w, h, { type: 'attack', target: t.id }); continue; }
    const c0 = ctl.casts;
    IT.Orders.issue(w, h, { type: 'cast', ability: s.a, x: t.x, y: t.y, target: t.id });
    const moving = s.at === 'mid' || s.at === 'd0' || s.at === 'd1' || s.at === 'lead';
    for (let k = 0; k < 30 * 8 && live() && ctl.casts === c0; k++) {
      step();
      if (moving && k % 6 === 5 && ctl.casts === c0 && h.orders[0] && h.orders[0].type === 'cast' && !h.orders[0]._ph) { const q = aim(); if (q) IT.Orders.issue(w, h, { type: 'cast', ability: s.a, x: q.x, y: q.y, target: q.id }); }
    }
    step(4);
  }
  if (sc.obj.type === 'kill' && !sc.obj.how) for (let k = 0; k < 30 * 20 && live(); k += 15) {
    const f = al().sort((a, b) => Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(b.x - h.x, b.y - h.y))[0];
    if (f && f.visible && !(h.orders[0] && h.orders[0].type === 'attack' && h.orders[0].target === f.id)) IT.Orders.issue(w, h, { type: 'attack', target: f.id });
    step(15);
  }
  if (sc.obj.type === 'escape') for (let k = 0; k < 30 * 20 && live(); k += 10) {
    const f = al().sort((a, b) => Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(b.x - h.x, b.y - h.y))[0];
    if (f) { const a = Math.atan2(h.y - f.y, h.x - f.x), p = IT.Nav.nearestWalkable(w.map, h.x + Math.cos(a) * 500, h.y + Math.sin(a) * 500) || h; IT.Orders.issue(w, h, { type: 'move', x: p.x, y: p.y }); }
    step(10);
  }
  for (let k = 0; k < 30 * 60 && live(); k++) step();
}

// one full ranked run -> the modeEnd summary
function ranked(seed, rating, fixedIdx, sloppy) {
  R.reset();
  const run = R.create({ mode: 'ranked', seed, rating });
  if (fixedIdx != null) run.diffIndex = () => fixedIdx;
  const pr = run.next(), map = IT.Maps.get(pr.sc.map || 'grounds');
  const w = IT.World.create({ seed, map, loadout: pr.lo, fog: R.worldFog({ mode: 'ranked' }, pr), tod: 'day' });
  if (IT.DayNight && IT.DayNight.attach) IT.DayNight.attach(w, { tod: 'day' });
  const h = IT.Hero.create(w, pr.lo, map.spawns.hero.x, map.spawns.hero.y);
  IT.StatsCollector.create(w);
  let sum = null;
  w.on('modeEnd', p => { sum = p; });
  const ctl = { casts: 0, tornT: null };
  w.on('cast', p => { if (p.unit === h.id) { ctl.casts++; if (p.ability === 'tornado') ctl.tornT = w.t; } });
  // per-scenario log for the 8/8 projection: speed factor of each clear (points / streak / difficulty bonus / 100) + the relics it earned
  const solvedLog = [], idx = [];
  let relAt = {};
  const snap = () => Object.assign({}, w._stats.data.relics);
  w.on('scnStart', () => { relAt = snap(); idx.push(run.diffIndex()); });
  w.on('scnResult', p => {
    if (!p.ok) return;
    const now = snap(), d = {};
    for (const k in now) if (now[k] - (relAt[k] || 0) > 0) d[k] = now[k] - (relAt[k] || 0);
    solvedLog.push({ speed: p.points / R.streakMult(run.streak - 1) / R.diffBonus(run.pr.df) / 100, rel: d });
  });
  run.attach(w);
  const rnd = IT.U.mulberry32(seed * 7919 + 13);
  for (let guard = 0; guard < 200000 && !run.ended; guard++) {
    if (run.phase === 'countdown') {
      const open = run.pr.sc.steps.map(s => s.a).filter((a, i, l) => IT.GAME.SPELL_ORBS[a] && l.indexOf(a) === i).slice(0, 2).reverse();
      for (const a of open) prep(w, h, a);
      run.tick(1 / 30);
    } else if (run.phase === 'play') playScenario(run, w, h, ctl, rnd, sloppy);
    else run.tick(1 / 30);
  }
  // projected 8/8 run: every turn cleared at this run's mean clear speed, relics = the solved scenarios' mean x 8
  let proj = null;
  if (solvedLog.length) {
    const sp = solvedLog.reduce((a, q) => a + q.speed, 0) / solvedLog.length, rel = {};
    for (const q of solvedLog) for (const k in q.rel) rel[k] = (rel[k] || 0) + q.rel[k] * 8 / solvedLog.length;
    let clear = 0;
    for (let k = 0; k < 8; k++) clear += Math.round(100 * R.diffBonus(IT.DIFFICULTY.get(fixedIdx != null ? fixedIdx : R.rampDiff(rating, k))) * sp * R.streakMult(k));
    const relic = IT.StatsCollector.relicScore(rel).score;
    proj = { clear, relic, score: clear + relic };
  }
  sum.proj = proj;
  return sum;
}

const pct = (a, p) => { const s = a.slice().sort((x, y) => x - y); if (!s.length) return 0; const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return Math.round(s[lo] + (s[hi] - s[lo]) * (i - lo)); };
const medal = (score, solved) => { const r = IT.Ranks.fromRun({ score, solved, turns: 8 }); return r.name + (r.stars ? ' ' + r.stars : ''); };
const groups = [], PARTS = {};
let RUNS = 0;
const t0 = Date.now();
for (const set of SETS) {
  const table = set === 'ramp' ? RAMPS : FIXED;
  Object.keys(table).forEach((df, i) => {
    for (const pl of PLAYERS) {
      const rows = [];
      for (let s = 1; s <= SEEDS; s++) {
        const m = ranked(1000 + s * 37, table[df], set === 'fixed' ? IT.DIFFICULTY.get(df).idx : null, pl === 'sloppy');
        rows.push({ seed: s, score: m.score, clear: m.clearScore, relic: m.relicScore, solved: m.solved, medal: medal(m.score, m.solved), proj: m.proj });
        for (const q of m.relicParts || []) { const a = PARTS[q.id] || (PARTS[q.id] = { runs: 0, pts: 0, v: 0 }); a.runs++; a.pts += q.pts; a.v += q.v; }
        RUNS++;
      }
      const sc = rows.map(r => r.score), solved = rows.map(r => r.solved), perfect = rows.filter(r => r.solved >= 8);
      const g = {
        set, diff: df, player: pl, n: rows.length, perfect: perfect.length,
        solvedP50: pct(solved, 0.5),
        total: [0.1, 0.5, 0.9, 0.95].map(p => pct(sc, p)), clear: [0.1, 0.5, 0.9].map(p => pct(rows.map(r => r.clear), p)), relic: [0.1, 0.5, 0.9].map(p => pct(rows.map(r => r.relic), p)),
        perfectTotal: perfect.length ? [0.5, 0.95].map(p => pct(perfect.map(r => r.score), p)) : null,
        medals: rows.map(r => r.medal),
        proj: rows.some(r => r.proj) ? [0.1, 0.5, 0.95].map(p => pct(rows.filter(r => r.proj).map(r => r.proj.score), p)) : null,
        projClear: rows.some(r => r.proj) ? pct(rows.filter(r => r.proj).map(r => r.proj.clear), 0.5) : null,
        projRelic: rows.some(r => r.proj) ? pct(rows.filter(r => r.proj).map(r => r.proj.relic), 0.5) : null,
      };
      groups.push(g);
      if (!JSON_OUT) console.log(`${set.padEnd(5)} ${df.padEnd(6)} ${pl.padEnd(6)} n=${g.n} 8/8=${g.perfect} solved50=${g.solvedP50} | total p10/50/90/95 ${g.total.join('/')} | clear ${g.clear.join('/')} | relic ${g.relic.join('/')} | perfect p50/p95 ${g.perfectTotal ? g.perfectTotal.join('/') : '-'} | p50 medal ${medal(g.total[1], g.solvedP50)} | 8/8 proj p10/50/95 ${g.proj ? g.proj.join('/') + ' (clear ' + g.projClear + ' + relic ' + g.projRelic + ') -> ' + medal(g.proj[1], 8) + ' / ' + medal(g.proj[2], 8) : '-'}`);
    }
  });
}
if (JSON_OUT) console.log(JSON.stringify(groups, null, 1));
else {
  console.log('relic parts (all runs): id  runs-with  mean-pts/run  mean-value-when-earned');
  for (const id of Object.keys(PARTS).sort((a, b) => PARTS[b].pts - PARTS[a].pts)) { const a = PARTS[id]; console.log('  ' + id.padEnd(16), String(a.runs).padStart(4), (a.pts / RUNS).toFixed(1).padStart(7), (a.v / a.runs).toFixed(1).padStart(9)); }
}
if (!JSON_OUT) console.log(`${groups.length} groups, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
