'use strict';
// Invoker rules: orbs, invoke, 2 slots, cooldowns, settings/keymap. Globals: SPELLS, Inv, Settings
const SPELLS = [
  { id: 'coldsnap', name: 'Cold Snap', orbs: 'QQQ', key: 'y', cost: 40, cd: 8 },
  { id: 'ghostwalk', name: 'Ghost Walk', orbs: 'QQW', key: 'v', cost: 60, cd: 12 },
  { id: 'icewall', name: 'Ice Wall', orbs: 'QQE', key: 'g', cost: 80, cd: 14 },
  { id: 'emp', name: 'E.M.P.', orbs: 'WWW', key: 'c', cost: 100, cd: 10 },
  { id: 'tornado', name: 'Tornado', orbs: 'WWQ', key: 'x', cost: 90, cd: 9 },
  { id: 'alacrity', name: 'Alacrity', orbs: 'WWE', key: 'z', cost: 70, cd: 11 },
  { id: 'sunstrike', name: 'Sun Strike', orbs: 'EEE', key: 't', cost: 120, cd: 8 },
  { id: 'forgespirit', name: 'Forge Spirit', orbs: 'EEQ', key: 'f', cost: 100, cd: 16 },
  { id: 'chaosmeteor', name: 'Chaos Meteor', orbs: 'EEW', key: 'd', cost: 110, cd: 9 },
  { id: 'deafeningblast', name: 'Deafening Blast', orbs: 'QWE', key: 'b', cost: 100, cd: 12 },
];
const SPELL = Object.fromEntries(SPELLS.map(s => [s.id, s]));
const RECIPE = Object.fromEntries(SPELLS.map(s => [s.orbs.split('').sort().join(''), s.id]));

const Settings = {
  scheme: 'legacy', invokeCD: 1, bloom: true, sound: true, hints: true, book: true,
  keys: { q: 'q', w: 'w', e: 'e', r: 'r', slot1: 'd', slot2: 'f', ...Object.fromEntries(SPELLS.map(s => [s.id, s.key])) },
  load() { try { const o = JSON.parse(localStorage.getItem('invoker_settings') || '{}'); Object.assign(this, o, { keys: { ...this.keys, ...(o.keys || {}) } }); } catch (e) { /* ignore */ } SFX.enabled = this.sound; },
  save() { try { localStorage.setItem('invoker_settings', JSON.stringify({ scheme: this.scheme, invokeCD: this.invokeCD, bloom: this.bloom, sound: this.sound, hints: this.hints, book: this.book, keys: this.keys })); } catch (e) { /* ignore */ } },
  // key -> action: {t:'orb',c}|{t:'invoke'}|{t:'cast',id}|{t:'slot',n}
  lookup(k) {
    const K = this.keys;
    if (k === K.q) return { t: 'orb', c: 'Q' };
    if (k === K.w) return { t: 'orb', c: 'W' };
    if (k === K.e) return { t: 'orb', c: 'E' };
    if (k === K.r) return { t: 'invoke' };
    if (this.scheme === 'slot') { if (k === K.slot1) return { t: 'slot', n: 0 }; if (k === K.slot2) return { t: 'slot', n: 1 }; return null; }
    for (const s of SPELLS) if (k === K[s.id]) return { t: 'cast', id: s.id };
    return null;
  },
  // label of the key that casts spell currently in slot n (for HUD)
  slotLabel(n, id) { return (this.scheme === 'slot' || !id ? this.keys[n ? 'slot2' : 'slot1'] : this.keys[id]).toUpperCase(); },
};

const Inv = {
  orbs: [], slots: [null, null], cd: {}, invokeCd: 0, mana: 500, maxMana: 500, useCd: true, useMana: false,
  ev: {}, // callbacks: orb(c), invoke(id), cast(id) , fail(why)
  reset(useCd, useMana) { this.orbs = []; this.slots = [null, null]; this.cd = {}; this.invokeCd = 0; this.mana = this.maxMana; this.useCd = useCd; this.useMana = useMana; },
  orb(c) { this.orbs.push(c); if (this.orbs.length > 3) this.orbs.shift(); SFX.play('orb' + c); this.ev.orb && this.ev.orb(c); },
  currentRecipe() { return this.orbs.length === 3 ? RECIPE[this.orbs.slice().sort().join('')] : null; },
  invoke() {
    const id = this.currentRecipe();
    if (!id) { SFX.play('fail'); return null; }
    const i = this.slots.indexOf(id);
    if (i === 0) return id; // already first
    if (i === 1) { this.slots = [id, this.slots[0]]; SFX.play('invoke'); this.ev.invoke && this.ev.invoke(id); return id; } // re-invoke: swap, no CD
    if (this.invokeCd > 0) { SFX.play('fail'); this.ev.fail && this.ev.fail('Invoke on cooldown'); return null; }
    this.slots = [id, this.slots[0]]; this.invokeCd = Settings.invokeCD;
    SFX.play('invoke'); this.ev.invoke && this.ev.invoke(id); return id;
  },
  cast(id) {
    if (!this.slots.includes(id)) { SFX.play('fail'); this.ev.fail && this.ev.fail(SPELL[id].name + ' not invoked'); return false; }
    const s = SPELL[id];
    if (this.useCd && this.cd[id] > 0) { SFX.play('fail'); this.ev.fail && this.ev.fail('On cooldown'); return false; }
    if (this.useMana && this.mana < s.cost) { SFX.play('fail'); this.ev.fail && this.ev.fail('Not enough mana'); return false; }
    if (this.useMana) this.mana -= s.cost;
    if (this.useCd) this.cd[id] = s.cd;
    SFX.play('cast_' + id); this.ev.cast && this.ev.cast(id); return true;
  },
  castSlot(n) { const id = this.slots[n]; if (!id) { SFX.play('fail'); this.ev.fail && this.ev.fail('Empty slot'); return false; } return this.cast(id); },
  tick(dt, haste) {
    const k = haste ? 1.7 : 1;
    this.invokeCd = Math.max(0, this.invokeCd - dt);
    for (const id in this.cd) this.cd[id] = Math.max(0, this.cd[id] - dt * k);
    if (this.useMana) this.mana = Math.min(this.maxMana, this.mana + 8 * dt);
  },
};
