'use strict';
// v6 #74 enemy ability bar (IT.HUD.enemyBar model + tooltips) and #75 blink telegraph (exec.blinkWarn, fx 'blinkWindup' timing).
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path');
const load = require('./_load.js');
const FILES = ['js/data/i18n.js', 'js/data/i18n/s3.js', 'js/data/i18n/f1.js', 'js/data/i18n/scn.js', 'js/data/i18n/n1.js', 'js/data/i18n/v6.js',
  'js/data/dota.js', 'js/data/rules.js', 'js/data/game.js', 'js/data/map.js', 'js/data/dotaworld.js', 'js/data/maps.js', 'js/data/difficulty.js', 'js/data/daynight.js',
  'js/data/combos.js', 'js/data/scenarios.js', 'js/data/ranks.js',
  'js/sim/util.js', 'js/sim/values.js', 'js/sim/world.js', 'js/sim/status.js', 'js/sim/abilities.js', 'js/sim/combat.js',
  'js/sim/nav.js', 'js/sim/vision.js', 'js/sim/loadout.js', 'js/sim/hero.js', 'js/sim/invoke.js', 'js/sim/orders.js',
  'js/sim/units.js', 'js/sim/belief.js', 'js/sim/spells.js', 'js/sim/items.js', 'js/sim/stats.js', 'js/sim/towers.js', 'js/sim/ranked.js',
  'js/art/art.js', 'js/art/icons.js', 'js/ui/hud.js'];
const IT = load(FILES);
const DF = IT.DIFFICULTY, R = IT.Ranked, H = IT.HUD, B = IT.GAME.ENEMY.blink;

function world() {
  const map = IT.Map.build(IT.MAPDEF);
  const lo = IT.Loadout.normalize(Object.assign({}, IT.Loadout.default(), { items: [] }));
  const w = IT.World.create({ seed: 3, map, loadout: lo, fog: false, autoAttack: false });
  const sp = map.spawns.hero, hero = IT.Hero.create(w, lo, sp.x, sp.y);
  w.step();
  return { w, hero, sp };
}
function foe(df, items, extra) {
  const m = world(), { w, sp } = m;
  const e = IT.Units.spawnEnemy(w, Object.assign({ x: sp.x + 900, y: sp.y, items, skin: 'default' }, extra || {}));
  e.exec = DF[df].exec; e.telegraph = DF[df].telegraph;
  w.step();
  return Object.assign(m, { e });
}

test('#75: blinkWarn per tier (ian 0.9 / easy 0.7 / common 0.5 / hard 0.3 / bambam 0.15), strictly falling; zero without a tier row', () => {
  assert.deepEqual(DF.order.map(id => DF[id].exec.blinkWarn), [0.9, 0.7, 0.5, 0.3, 0.15]);
  assert.equal(IT.Intent.execOf({}).blinkWarn, 0);
});

test('#74: model: innate blink first, then the items; cost / cooldown fraction / dagger lock / charges / mana', () => {
  const { w, e } = foe('common', ['blink', 'forcestaff', 'euls', 'bkb', 'dust']);
  e.innate = IT.Intent.newInnate(w);
  let bar = H.enemyBar(e, w);
  assert.deepEqual(bar.slots.map(s => s.id + (s.innate ? '*' : '')), ['blink*', 'blink', 'forcestaff', 'euls', 'bkb', 'dust']);
  assert.ok(bar.maxMana > 0 && bar.mana === bar.maxMana && bar.manaFrac === 1, 'real mana');
  assert.equal(bar.slots[0].cost, IT.Units.innateMana(e));
  assert.ok(bar.slots.every(s => s.ready && s.cdFrac === 0 && !s.locked), 'all ready');
  // cooldown sweep
  const f = bar.slots[3], cd = e.cd.euls = f.cdMax * 0.25; e.items.find(i => i && i.id === 'euls').cd = cd;
  bar = H.enemyBar(e, w);
  assert.ok(Math.abs(bar.slots[3].cdFrac - 0.25) < 1e-9 && !bar.slots[3].ready, 'euls cd fraction ' + bar.slots[3].cdFrac);
  // the dagger's 3 s damage lock: disabled with a red sweep fraction
  e._blinkLock = w.t + 1.5;
  bar = H.enemyBar(e, w);
  const d = bar.slots[1];
  assert.ok(d.locked && !d.ready && Math.abs(d.lockFrac - 0.5) < 0.02 && Math.abs(d.lockRem - 1.5) < 1e-6 && d.lockMax === 3, JSON.stringify(d));
  assert.ok(!bar.slots[0].locked, 'the innate blink works while damaged');
  e._blinkLock = w.t - 1;
  assert.ok(!H.enemyBar(e, w).slots[1].locked);
  // innate: cooldown after a blink, deny after a Cold Snap
  e.innate.readyAt = w.t + B.cd / 2; e.innate.denyUntil = w.t + B.deny;
  bar = H.enemyBar(e, w);
  assert.ok(Math.abs(bar.slots[0].cdFrac - 0.5) < 1e-6 && bar.slots[0].locked && Math.abs(bar.slots[0].lockFrac - 1) < 1e-6);
  // BKB uses + mana: below the cost the slot reads low-mana
  e.items.find(i => i && i.id === 'bkb').charges = 2;
  e.mana = 10;
  bar = H.enemyBar(e, w);
  assert.equal(bar.slots[4].charges, 2);
  assert.ok(bar.slots[0].lowMana && bar.slots[3].lowMana && bar.manaFrac < 0.05, 'low mana');
  assert.ok(bar.slots.length <= 6);
});

test('#74: enemy item casts spend real mana; the bar follows; mana regenerates', () => {
  const { w, e } = foe('bambam', ['euls', 'forcestaff']);
  e.telegraph = 0;
  const m0 = e.mana, cost = IT.Abilities.get('euls').manaCost(w, e);
  assert.ok(cost > 0 && e.maxMana > 0 && e.manaRegen > 0);
  assert.ok(IT.Units.useItem(w, e, 'euls', {}), 'cast');
  assert.ok(Math.abs(e.mana - (m0 - cost)) < 0.5, 'spent ' + (m0 - e.mana));
  const bar = H.enemyBar(e, w), s = bar.slots.find(x => x.id === 'euls');
  assert.ok(s.cd > 0 && s.cdFrac > 0.9 && s.cdMax > 0);
  assert.ok(Math.abs(bar.mana - e.mana) < 1e-9);
});

test('#74: tooltips: name, description, cast point, range, cooldown, mana (en + pt); eb.* parity', () => {
  const { w, e } = foe('common', ['blink', 'forcestaff', 'euls', 'bkb', 'dust']);
  e.innate = IT.Intent.newInnate(w);
  const bar = H.enemyBar(e, w);
  for (const lang of ['en', 'pt']) {
    IT.setLang(lang);
    for (const s of bar.slots) {
      const tip = H.enemyTip(s, e, w), L = tip.split('\n');
      assert.ok(L.length >= 5 && !/undefined|eb\./.test(tip), lang + ' ' + s.id + ': ' + tip);
    }
  }
  IT.setLang('en');
  const src = fs.readFileSync(path.join(__dirname, '..', 'js/data/i18n/v6.js'), 'utf8');
  const keys = [...new Set([...src.matchAll(/'(eb\.[\w.]+)'/g)].map(m => m[1]))];
  assert.ok(keys.length >= 14, 'keys ' + keys.length);
  IT.setLang('en'); const en = keys.map(k => IT.t(k, { n: 7 })); IT.setLang('pt'); const pt = keys.map(k => IT.t(k, { n: 7 })); IT.setLang('en');
  keys.forEach((k, i) => { assert.ok(en[i] && pt[i] && en[i] !== k && pt[i] !== k, k); assert.ok(!/\{n\}/.test(en[i] + pt[i]), k); });
});

test('#75: Blink Dagger warning = max(item telegraph, blinkWarn): turn to face, fx blinkWindup (dest ghost), blinks at the end; a stun cancels it', () => {
  const { w, e } = foe('bambam', ['blink']);
  e.telegraph = 0; e.facing = Math.PI;
  const fx = []; w.on('fx', p => { if (p.unit === e.id) fx.push(Object.assign({ t: w.t }, p)); });
  const tx = e.x - 600, ty = e.y + 300, ang = Math.atan2(ty - e.y, tx - e.x), x0 = e.x, y0 = e.y, t0 = w.t;
  assert.ok(IT.Units.useItem(w, e, 'blink', { x: tx, y: ty }));
  assert.ok(e.tele && Math.abs(e.tele.until - t0 - DF.bambam.exec.blinkWarn) < 1e-6, 'lead ' + (e.tele && e.tele.until - t0));
  assert.ok(Math.abs(e.facing - ang) < 1e-6, 'faces the target');
  const wu = fx.find(p => p.name === 'blinkWindup');
  assert.ok(wu && wu.innate === false && Math.abs(wu.dur - 0.15) < 1e-6 && Math.abs(Math.hypot(wu.tx - x0, wu.ty - y0) - Math.hypot(tx - x0, ty - y0)) < 1e-6, JSON.stringify(wu));
  let n = 0; while (e.x === x0 && n++ < 40) w.step();
  assert.ok(e.x !== x0 && w.t - t0 >= 0.15 - 1e-6 && w.t - t0 < 0.15 + 0.12, 'blinked after the warning ' + (w.t - t0));
  // a longer item telegraph wins (easy: 1.0 s > 0.7 s warn)
  const b = foe('easy', ['blink']);
  const u0 = b.w.t; IT.Units.useItem(b.w, b.e, 'blink', { x: b.e.x - 500, y: b.e.y });
  assert.ok(Math.abs(b.e.tele.until - u0 - 1.0) < 1e-6);
  // Cold Snap / a stun during the warning: no blink
  const c = foe('common', ['blink']); c.e.telegraph = 0;
  const cx = c.e.x, ev = []; c.w.on('fx', p => { if (p.unit === c.e.id) ev.push(p.name); }); c.w.on('blink', p => { if (p.unit === c.e.id) ev.push('blink'); });
  assert.ok(IT.Units.useItem(c.w, c.e, 'blink', { x: cx - 500, y: c.e.y }));
  c.w.step();
  IT.Status.add(c.w, c.e, 'stun', 1.5, { src: c.hero.id, ability: 'coldsnap' });
  for (let k = 0; k < 40; k++) c.w.step();
  assert.ok(c.e.x === cx && !c.e.tele && !ev.includes('blink') && ev.includes('blinkDenied'), ev.join(' ') + ' ' + (c.e.x - cx));
});

// innate blink on the real scenario: wind-up = turn + cast point + warn; the fx carries the three parts; mana is spent
function blinker(df, seed) {
  const run = R.create({ mode: 'practice', diff: df, scenario: 'qop_blink_snipe', seed });
  const pr = run.next(), m0 = IT.Maps.get('grounds');
  const w = IT.World.create({ seed, map: m0, loadout: pr.lo, fog: pr.fog });
  IT.DayNight.attach(w, { scenario: 'qop_blink_snipe' });
  const h = IT.Hero.create(w, pr.lo, m0.spawns.hero.x, m0.spawns.hero.y);
  run.attach(w);
  const e = run.dummies[0], fx = [];
  e.exec = Object.assign({}, e.exec, { itemP: 1 });   // no hesitation roll: the timing is the test
  w.on('fx', p => { if (p.unit === e.id && p.name === 'blinkWindup') fx.push(Object.assign({ t: w.t }, p)); });
  for (let i = 0; i < 600 && run.frozen(); i++) run.tick(1 / 30);
  return { run, w, h, e, fx };
}
test('#75: innate blink: fx.dur = turn + cast point + warn per tier (cue timing), mana spent, bar shows the cast', () => {
  const durs = {};
  for (const df of ['ian', 'common', 'bambam']) {
    const m = blinker(df, 2), { w, e, h } = m, X = DF[df].exec, mana0 = e.mana;
    IT.Combat.damage(w, { src: h.id, target: e, ability: 'sunstrike', type: 'pure', amount: 30 });
    for (let k = 0; k < 150 && !m.fx.length; k++) w.step();
    const f = m.fx[0];
    assert.ok(f && f.innate === true, df + ' fx');
    assert.ok(Math.abs(f.dur - (f.turn + f.cast + f.warn)) < 1e-9 && f.warn === X.blinkWarn && f.cast === X.blinkCast, df + ' ' + JSON.stringify(f));
    assert.ok(Math.abs(e.mana - (mana0 - IT.Units.innateMana(e))) < 2, df + ' mana ' + (mana0 - e.mana));
    const s = H.enemyBar(e, w).slots[0];
    assert.ok(s.innate && s.casting && !s.ready, 'casting state');
    durs[df] = f.dur - f.turn;
  }
  assert.ok(durs.ian > durs.common && durs.common > durs.bambam, JSON.stringify(durs));
});

test('#75: a stun / Cold Snap during the innate warning still interrupts and denies it (bar shows the deny)', () => {
  const m = blinker('easy', 1), { w, e, h } = m, ev = [];
  w.on('innateBlink', p => { if (p.unit === e.id) ev.push(p.phase + (p.interrupted ? '!' : '')); });
  IT.Combat.damage(w, { src: h.id, target: e, ability: 'sunstrike', type: 'pure', amount: 30 });
  for (let k = 0; k < 150 && !e.innate.wind; k++) w.step();
  assert.ok(e.innate.wind);
  for (let k = 0; k < 8; k++) w.step();   // into the warning part
  IT.Status.add(w, e, 'stun', 1, { src: h.id, ability: 'coldsnap' });
  w.step(); w.step();
  assert.ok(ev.includes('denied!'), ev.join(' '));
  const s = H.enemyBar(e, w).slots[0];
  assert.ok(s.locked && s.lockRem > 0 && !s.ready);
});
