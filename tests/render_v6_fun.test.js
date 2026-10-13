'use strict';
// v6 item 28 render/art: Roshan / Aegis / rune sheets, ally + Roshan unit drawing, TP channel + pickup + Roshan-death fx (headless, stub canvas).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');

let ops = 0;
const mkCtx = () => new Proxy({ globalAlpha: 1 }, {
  get(t, k) {
    if (k in t) return t[k];
    if (k === 'createImageData') return (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
    if (k === 'measureText') return () => ({ width: 5 });
    return () => { ops++; };
  },
  set(t, k, v) { t[k] = v; return true; },
});
const mkCv = () => ({ width: 0, height: 0, getContext: () => mkCtx() });
const ctx = vm.createContext({ console, Math, Map, Set, Array, Object, Number, String, Boolean, JSON, Date, Symbol, Uint8Array, Uint32Array, Float32Array, Uint8ClampedArray, Infinity, NaN, isFinite, isNaN, parseInt, parseFloat, document: { createElement: mkCv } });
for (const f of ['js/sim/util.js', 'js/render/pixel.js', 'js/art/art.js', 'js/art/dummies.js', 'js/render/particles.js', 'js/render/shadows.js', 'js/render/units.js', 'js/render/fx.js'])
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
const IT = ctx.IT; IT.GAME = IT.GAME || { UNIT_PX: 6 }; IT.Particles && IT.Particles.init && IT.Particles.init(480, 270);
const A = IT.Art, FX = IT.FX, UD = IT.UnitDraw, SH = IT.Shadows;

const dims = rows => [rows[0].length, rows.length];

test('Roshan sheet: 44x46 frames, every anim in s/n/e, portrait 32x32, anchor inside the frame', () => {
  const s = A.sheets.roshan;
  assert.ok(s, 'sheet registered');
  const want = { idle: 4, walk: 4, attack: 3, stunned: 2, death: 4 };
  for (const an in want) for (const d of ['s', 'n', 'e']) {
    assert.strictEqual(A.count('roshan', an, d), want[an], an + '_' + d);
    for (let i = 0; i < want[an]; i++) assert.deepStrictEqual(dims(s.frames[`${an}_${d}_${i}`]), [44, 46], `${an}_${d}_${i}`);
  }
  assert.deepStrictEqual(dims(s.frames.portrait), [32, 32]);
  assert.ok(s.anchor[0] > 0 && s.anchor[0] < 44 && s.anchor[1] > 0 && s.anchor[1] < 46);
  assert.ok(A.canvas('roshan', 'idle_s_0'), 'canvas builds');
  assert.ok(A.canvas('roshan', 'idle_e_0', true), 'mirrored canvas builds');
});

test('Roshan is about twice a hero: taller silhouette than the default grunt (24 px)', () => {
  const rows = A.sheets.roshan.frames.idle_s_0;
  const top = rows.findIndex(r => /[^.]/.test(r)), bot = rows.length - 1 - [...rows].reverse().findIndex(r => /[^.]/.test(r));
  assert.ok(bot - top + 1 >= 40, 'height ' + (bot - top + 1));
  const dh = A.sheets.default.frames.idle_s_0;
  assert.ok(rows.length >= dh.length * 1.7);
});

test('Aegis (16x20, 2 shine frames) and rune orbs (14x14, 7 hues x 2 frames) exist', () => {
  const a = A.sheets.aegis;
  assert.ok(a);
  assert.deepStrictEqual(dims(a.frames.shield_0), [16, 20]); assert.deepStrictEqual(dims(a.frames.shield_1), [16, 20]);
  assert.notDeepStrictEqual(a.frames.shield_0, a.frames.shield_1, 'shine frame differs');
  for (let i = 0; i < 7; i++) {
    const r = A.sheets['rune' + i];
    assert.ok(r, 'rune' + i);
    for (const f of ['orb_0', 'orb_1']) assert.deepStrictEqual(dims(r.frames[f]), [14, 14]);
  }
  assert.notDeepStrictEqual(A.sheets.rune0.pal.c, A.sheets.rune2.pal.c, 'hues differ');
});

test('UnitDraw: ally and roshan are units; names fall back to Ally/Aliado + Roshan when no i18n key', () => {
  assert.ok(UD.isUnit({ kind: 'ally' })); assert.ok(UD.isUnit({ kind: 'roshan' }));
  assert.ok(!UD.isUnit({ kind: 'pickup' }));
  assert.ok(!UD.isFoe({ kind: 'ally' }));
  IT.t = k => k; IT.lang = 'en';
  assert.strictEqual(UD.allyName(), 'Ally'); assert.strictEqual(UD.roshName(), 'Roshan');
  IT.lang = 'pt'; assert.strictEqual(UD.allyName(), 'Aliado');
  IT.t = k => k === 'unit.ally' ? 'Amigo' : k; assert.strictEqual(UD.allyName(), 'Amigo');
  delete IT.t; delete IT.lang;
});

// ---- stub renderer ----
function mkR(ents, o) {
  o = o || {};
  const handlers = {};
  const w = { ents, t: o.t || 0, fog: false, byId: new Map(ents.map(e => [e.id, e])), get(id) { return this.byId.get(id); }, hero: null, on(n, f) { (handlers[n] = handlers[n] || []).push(f); }, emit(n, p) { (handlers[n] || []).forEach(f => f(p)); }, _h: handlers };
  const R = {
    cx: mkCtx(), w, P: 6, VW: 480, VH: 270, camX: 0, camY: 0, time: o.time || 1, simT: 0, ix: 0, iy: 0, iz: 0, fog: null,
    interp(e) { R.ix = e.x; R.iy = e.y; R.iz = e.z || 0; },
    glow() { ops++; }, light() { ops++; }, edgeArrow() {},
  };
  return R;
}
const U = o => Object.assign({ id: 1, kind: 'enemy', team: 1, x: 1800, y: 1200, z: 0, radius: 36, facing: 0, statuses: [], dead: false, visible: true, hp: 100, maxHp: 100 }, o);
const sortedDraw = (R) => { const items = []; FX.sorted(R, (y, fn, arg) => items.push({ y, fn, arg })); ops = 0; items.forEach(i => i.fn(i.arg, R)); return items; };

test('fx.init registers the item-28 handlers', () => {
  const R = mkR([]); FX.clear(); FX.init(R);
  for (const n of ['channelStart', 'channelEnd', 'pickup', 'roshanDown', 'fx']) assert.ok(R.w._h[n] && R.w._h[n].length, n);
});

test('TP channel: ground ring + air column + lights draw while e.channel is set; nothing without it; interrupt/complete events puff', () => {
  const e = U({ id: 5, channel: { kind: 'tp', t0: 0, dur: 3, x: 400, y: 400 } });
  const R = mkR([e], { t: 1.2 }); FX.clear(); FX.init(R);
  FX.update(R, 0.016);
  ops = 0; FX.ground(R); const g = ops; ops = 0; FX.air(R); const a = ops; ops = 0; FX.lights(R); const l = ops;
  assert.ok(g > 10 && a > 10 && l >= 2, `ground ${g} air ${a} lights ${l}`);
  delete e.channel; FX.update(R, 0.016);
  ops = 0; FX.ground(R); FX.air(R); FX.lights(R);
  assert.strictEqual(ops, 0, 'idle unit draws no tp fx');
  // interrupted: puff one-shots appear (ground waves + lights flash)
  e.channel = { kind: 'tp', t0: 0, dur: 3, x: 400, y: 400 }; FX.update(R, 0.016);
  R.w.emit('channelEnd', { unit: 5, kind: 'tp', interrupted: true });
  delete e.channel;
  ops = 0; FX.ground(R); assert.ok(ops > 10, 'cancel puff ground'); ops = 0; FX.lights(R); assert.ok(ops > 0, 'cancel flash');
  // completed: departure flash
  const R2 = mkR([U({ id: 6, channel: { kind: 'tp', t0: 0, dur: 3, x: 1900, y: 1300 } })], { t: 2 }); FX.clear(); FX.init(R2); FX.update(R2, 0.016);
  R2.w.emit('channelEnd', { unit: 6, kind: 'tp', interrupted: false });
  ops = 0; FX.lights(R2); assert.ok(ops > 0);
  assert.doesNotThrow(() => R2.w.emit('channelEnd', { unit: 999, kind: 'tp', interrupted: true }), 'unknown unit tolerated');
});

test('TP channel hidden foe (fog) draws no column', () => {
  const e = U({ id: 7, visible: false, channel: { kind: 'tp', t0: 0, dur: 3, x: 400, y: 400 } });
  const R = mkR([e], { t: 1 }); R.w.fog = true; R.fog = { levelAt: () => 0 };
  FX.clear(); FX.init(R); FX.update(R, 0.016);
  ops = 0; FX.air(R); assert.strictEqual(ops, 0);
});

test('pickups: rune + aegis (pickKind or pick.kind) draw ground ring, a sorted bobbing sprite and a light; pickup event pulses', () => {
  const rune = U({ id: 10, kind: 'pickup', team: 0, pickKind: 'rune', radius: 100 }), aeg = U({ id: 11, kind: 'pickup', team: 0, pick: { kind: 'aegis' }, radius: 100, x: 2000 });
  const R = mkR([rune, aeg]); FX.clear(); FX.init(R); FX.update(R, 0.016);
  assert.strictEqual(FX.pkKind(rune), 'rune'); assert.strictEqual(FX.pkKind(aeg), 'aegis');
  ops = 0; FX.ground(R); assert.ok(ops > 10, 'ground');
  const items = sortedDraw(R); assert.strictEqual(items.length, 2); assert.ok(ops > 2, 'sprites blitted');
  ops = 0; FX.lights(R); assert.ok(ops >= 2, 'lights');
  // colour cycling: different hue pairs over time, smooth blend in [0,1]
  const seen = new Set();
  for (let t = 0; t < 12; t += 0.25) { R.time = t; const h = FX.runeHue(R, 10); seen.add(h.i0); assert.ok(h.u >= 0 && h.u <= 1); assert.match(h.hex, /^#[0-9a-f]{6}$/); }
  assert.strictEqual(seen.size, 7, 'cycles through all 7 hues');
  // picked up: entity removed first, then the event (position from cache)
  R.time = 1;
  R.w.ents.splice(0, 1); R.w.byId.delete(10);
  R.w.emit('pickup', { unit: 1, kind: 'rune', id: 10 });
  ops = 0; FX.ground(R); FX.air(R); assert.ok(ops > 10, 'pickup ring / rise');
  ops = 0; FX.lights(R); assert.ok(ops > 0, 'pickup flash');
  assert.doesNotThrow(() => R.w.emit('pickup', { unit: 77, kind: 'aegis', id: 99 }), 'unknown pickup tolerated');
});

test('roshanDown: death sprite (death frames) + dust + aegis glow lifecycle; deduped between event and fx', () => {
  const R = mkR([U({ id: 20, kind: 'roshan', team: 2, radius: 90, facing: 0.4 })]); FX.clear(); FX.init(R); FX.update(R, 0.016);
  R.w.ents.length = 0; R.w.byId.clear();         // roshan removed from the sim
  R.w.emit('roshanDown', { unit: 20 });
  R.w.emit('fx', { name: 'roshanDown', x: 1800, y: 1200 });    // second signal for the same death
  R.time = 1.05;
  const items = sortedDraw(R); assert.strictEqual(items.length, 1, 'one corpse sprite (deduped)'); assert.ok(ops > 0, 'sprite drawn');
  R.time = 1.6; ops = 0; FX.ground(R); assert.ok(ops > 5, 'aegis glow ring'); R.time = 2.1; ops = 0; FX.air(R); assert.ok(ops > 3, 'aegis beam'); R.time = 1.6; ops = 0; FX.lights(R); assert.ok(ops > 0, 'light');
  R.time = 5; FX.update(R, 0.016);
  assert.strictEqual(sortedDraw(R).length, 0, 'corpse gone after its duration');
});

test('shadows: pickups and Roshan cast a blob; ally too', () => {
  const draws = [];
  const mk = ents => { const R = mkR(ents); R.cx = { globalAlpha: 1, fillRect() {}, drawImage(cv) { draws.push(cv.width); } }; R.fog = { levelAt: () => 3 }; return R; };
  for (const e of [U({ id: 30, kind: 'pickup', team: 0, pickKind: 'aegis' }), U({ id: 31, kind: 'roshan', team: 2, radius: 90 }), U({ id: 32, kind: 'ally', team: 0 })]) {
    draws.length = 0; SH.ground(mk([e]));
    assert.strictEqual(draws.length, 1, e.kind);
  }
  const rosh = (draws.length = 0, SH.ground(mk([U({ id: 33, kind: 'roshan', team: 2, radius: 90 })])), draws[0]);
  const ally = (draws.length = 0, SH.ground(mk([U({ id: 34, kind: 'ally', team: 0 })])), draws[0]);
  assert.ok(rosh > ally, 'Roshan blob is wider');
});

test('Roshan + ally draw through UnitDraw.draw / hud without throwing (fog-gated roshan fades in)', () => {
  const ents = [U({ id: 40, kind: 'roshan', team: 2, radius: 90 }), U({ id: 41, kind: 'ally', team: 0, x: 1900, name: '' })];
  const R = mkR(ents); R.fog = { levelAt: () => 3 }; R.w.fog = true;
  for (let i = 0; i < 12; i++) {
    R.time += 0.05;
    for (const e of ents) if (UD.isUnit(e) && UD.visible(R, e)) { assert.doesNotThrow(() => UD.draw(R, e, false)); assert.doesNotThrow(() => UD.lights(R, e)); assert.doesNotThrow(() => UD.hud(R, e)); }
  }
  assert.ok(UD.visible(R, ents[0]), 'lit roshan becomes visible');
  R.fog = { levelAt: () => 0 };
  for (let i = 0; i < 30; i++) R.time += 0.05, UD.visible(R, ents[0]);
  assert.ok(!UD.visible(R, ents[0]), 'unlit roshan fades out');
  assert.ok(UD.visible(R, ents[1]), 'ally is never fogged');
});
