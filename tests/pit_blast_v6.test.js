'use strict';
// v6 #67: pit_blast_in. A foe on the bank by the Roshan pit mouth; Deafening Blast shoves him in; the kill counts inside the crater
// (obj.how.inside + how.mouth: Ranked.MOUTH_TOL[tier] u of slack). Bot: blast, then Sun Strike on the landed foe, every tier.
const test = require('node:test');
const assert = require('node:assert');
const { IT, build, bot, prep } = require('./_funbot.js');
const R = IT.Ranked, TIERS = ['ian', 'easy', 'common', 'hard', 'bambam'];

// hero teleported to `deg` (0 = due west of the foe, + = south) at `dist` u, blasts toward the foe (+ aim error), Sun Strikes where he lands
function trial(df, seed, deg, dist, aim) {
  const m = build('pit_blast_in', df, seed), { w, h, run } = m, d = run.dummies[0];
  for (let i = 0; i < 600 && run.frozen(); i++) { prep(w, h, 'sunstrike'); prep(w, h, 'deafeningblast'); run.tick(1 / 30); }
  const a = Math.PI - deg * Math.PI / 180, hx = d.x + Math.cos(a) * dist, hy = d.y + Math.sin(a) * dist;
  if (!w.map.walkable(hx, hy)) return null;
  h.x = hx; h.y = hy;
  const ang = Math.atan2(d.y - h.y, d.x - h.x) + (aim || 0) * Math.PI / 180;
  IT.Orders.issue(w, h, { type: 'cast', ability: 'deafeningblast', x: h.x + Math.cos(ang) * 600, y: h.y + Math.sin(ang) * 600 });
  for (let k = 0; k < 120 && run.phase === 'play'; k++) w.step();
  IT.Orders.issue(w, h, { type: 'cast', ability: 'sunstrike', x: d.x, y: d.y });
  for (let k = 0; k < 240 && run.phase === 'play'; k++) w.step();
  return run.result && run.result.ok;
}
const window_ = (df, f) => { const ok = []; for (let a = -90; a <= 90; a += 5) if (f(a)) ok.push(a); return ok; };

test('pit_blast_in data: kill inside with mouth tolerance, Blast first, foe starts outside every tier tolerance', () => {
  const sc = IT.SCENARIOS.find(s => s.id === 'pit_blast_in');
  assert.ok(sc && sc.funBot && sc.tags.includes('pit') && sc.tags.includes('burst') && sc.tags.includes('fun'));
  assert.deepEqual(sc.obj, { type: 'kill', how: { inside: 'pit', mouth: true } });
  assert.equal(sc.steps[0].a, 'deafeningblast');
  assert.ok(IT.t('scn.pit_blast_in.name') && IT.t('scn.pit_blast_in.tip'));
  const t = TIERS.map(d => R.MOUTH_TOL[d]);
  assert.ok(t.every((v, i) => i === 0 || v < t[i - 1]), 'tolerance tightens ian -> bambam: ' + t);
  for (const df of TIERS) {
    const m = build('pit_blast_in', df, 1), f = m.run.dummies[0];
    assert.ok(!R.inPit(m.w.map, f.x, f.y) && R.pitGap(m.w.map, f.x, f.y) > R.MOUTH_TOL.ian + 30, df + ': starts clear of the mouth tolerance');
  }
});

test('pit_blast_in idle / plain attack never clears (foe is outside at the start)', () => {
  for (const df of TIERS) {
    const m = build('pit_blast_in', df, 1);
    for (let i = 0; i < 600 && m.run.frozen(); i++) m.run.tick(1 / 30);
    m.h.autoAttack = false; for (let k = 0; k < 30 * 60 && m.run.phase === 'play'; k++) m.w.step();
    assert.equal(m.run.result.ok, false, df);
  }
});

test('pit_blast_in: the bot (Blast, then Sun Strike) clears every tier, seeds 1-4', () => {
  for (const df of TIERS) for (let seed = 1; seed <= 4; seed++) { const r = bot('pit_blast_in', df, seed); assert.ok(r.ok, df + ' s' + seed + ' ' + JSON.stringify(r)); }
});

test('pit_blast_in: Blast from a wide arc lands him inside, every tier; the far side or the wrong side fails', () => {
  for (const df of TIERS) {
    const ok = window_(df, a => trial(df, 1, a, 650, 0) === true);
    assert.ok(ok.length >= 19 && ok.includes(0) && ok.includes(-30) && ok.includes(50), df + ' window ' + ok[0] + '..' + ok[ok.length - 1]);   // >= 95 deg of bearings
    assert.ok(!ok.includes(-90) && !ok.includes(90), df + ' pushed along the bank is no kill');
  }
  const hard = window_('hard', a => trial('hard', 1, a, 650, 0) === true), easy = window_('ian', a => trial('ian', 1, a, 650, 0) === true);
  assert.ok(hard.length < easy.length, 'tighter at hard than ian: ' + hard.length + ' < ' + easy.length);
});

test('pit_blast_in: the Blast aim tolerates +-15 deg at 650 u, every tier', () => {
  for (const df of TIERS) for (const aim of [-15, 15]) assert.equal(trial(df, 1, 0, 650, aim), true, df + ' aim ' + aim);
});
