// v6 item 15: Skin SHOP data + state (pure logic, no DOM). Currency = relic POINTS (js/data/relics.js `points`, js/sim/stats.js): earned into the
// lifetime blob ('it2.stats' -> points), spent here (-> spent). Ownership / equipment live in their own key ('it2.shop').
// Categories: player (Invoker look + spell icon / VFX palette), enemy (ranked + Free Play foes), dummy (the training scarecrow).
// Free items cost 0 and are always owned. Ranked uses ONLY the owned enemy skins + 'default' (IT.Skins.pool('enemy'), js/data/game.js).
// Free Play reads IT.Shop.owned(skinId) to gate its enemy picker.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const STATS_KEY = 'it2.stats', KEY = 'it2.shop';

  // ---- pricing (see DECISIONS.md "Skin shop pricing"): a normal player earns REF_RUN points per 8-turn run (measured with tools/score_sample.mjs),
  // a run lasts RUN_MIN minutes; the whole catalogue costs TOTAL points = TOTAL / REF_RUN runs x RUN_MIN min = ~25 min of normal play.
  const PRICING = { REF_RUN: 200, RUN_MIN: 4.5, MIN: 20, MAX: 35 };
  const CATALOG = [
    { kind: 'player', skin: 'default', price: 0 },
    { kind: 'player', skin: 'kid', price: 80 },
    { kind: 'player', skin: 'dark', price: 200 },
    { kind: 'player', skin: 'exalted', price: 300 },
    { kind: 'enemy', skin: 'default', price: 0 },
    { kind: 'enemy', skin: 'renan', price: 100 },
    { kind: 'enemy', skin: 'pedro', price: 100 },
    { kind: 'enemy', skin: 'vitinho', price: 100 },
    { kind: 'enemy', skin: 'ianzinho', price: 110 },   // v6 #61, next to Vitinho
    { kind: 'enemy', skin: 'nando', price: 120 },
    { kind: 'enemy', skin: 'vitinian', price: 250 },   // v6 #63: premium two-headed ogre (Vitinho + Ianzinho), 34x28 frame + 48x32 portrait
    { kind: 'dummy', skin: 'scarecrow', price: 0 },
    { kind: 'dummy', skin: 'raven', price: 100 },
  ];
  const KINDS = ['player', 'enemy', 'dummy'];
  const find = (kind, skin) => CATALOG.find(c => c.kind === kind && c.skin === skin) || null;
  // owned(skin) with no kind: unique skin ids resolve to their item ('default' is free in every kind)
  const findAny = skin => CATALOG.find(c => c.skin === skin) || null;
  const total = () => CATALOG.reduce((a, c) => a + c.price, 0);
  const minutesToUnlockAll = (perRun, runMin) => total() / (perRun || PRICING.REF_RUN) * (runMin || PRICING.RUN_MIN);

  // ---- storage (try/catch everywhere; an in-memory copy keeps the session working when localStorage throws)
  let mem = null, memLife = null;
  const ls = () => { try { return G.localStorage || null; } catch (e) { return null; } };
  function readJson(key) { try { const s = ls(); return s ? JSON.parse(s.getItem(key)) : null; } catch (e) { return null; } }
  function writeJson(key, v) { try { const s = ls(); if (s) s.setItem(key, JSON.stringify(v)); return !!s; } catch (e) { return false; } }
  const blankState = () => ({ owned: {}, equip: { player: 'default', dummy: 'scarecrow' } });
  function load() {
    let st = readJson(KEY);
    if (!st || typeof st !== 'object') st = mem || blankState();
    st.owned = (st.owned && typeof st.owned === 'object') ? st.owned : {};
    st.equip = Object.assign({ player: 'default', dummy: 'scarecrow' }, st.equip || {});
    return st;
  }
  function save(st) { mem = st; writeJson(KEY, st); }
  // the lifetime blob holds points (earned) and spent; spending edits only `spent`
  function life() { return readJson(STATS_KEY) || memLife || { points: 0, spent: 0 }; }
  function saveLife(b) { memLife = b; writeJson(STATS_KEY, b); }

  const earned = () => Math.round(life().points || 0);
  const spent = () => Math.round(life().spent || 0);
  const balance = () => Math.max(0, earned() - spent());

  const isOwned = (kind, skin) => { const c = kind ? find(kind, skin) : findAny(skin); return !!c && (c.price === 0 || !!load().owned[c.kind + ':' + c.skin]); };
  function owned(skin, kind) { return isOwned(kind, skin); }
  function equipped(kind) {
    const st = load(), s = st.equip[kind];
    if (kind === 'enemy') return 'default';
    return s && isOwned(kind, s) ? s : (IT.Skins ? IT.Skins.FREE[kind] : 'default');
  }
  // state of a card: 'owned' | 'equipped' | 'buy' | 'poor' (not owned, not enough points)
  function stateOf(kind, skin) {
    const c = find(kind, skin);
    if (!c) return 'locked';
    if (!isOwned(kind, skin)) return balance() >= c.price ? 'buy' : 'poor';
    if (kind !== 'enemy' && equipped(kind) === skin) return 'equipped';
    return 'owned';
  }
  function buy(kind, skin) {
    const c = find(kind, skin);
    if (!c) return { ok: false, reason: 'unknown' };
    if (isOwned(kind, skin)) return { ok: false, reason: 'owned' };
    if (balance() < c.price) return { ok: false, reason: 'poor' };
    const b = Object.assign({ points: 0, spent: 0 }, life());
    b.spent = (b.spent || 0) + c.price;
    saveLife(b);
    const st = load(); st.owned[kind + ':' + skin] = 1; save(st);
    return { ok: true, price: c.price, balance: balance() };
  }
  function equip(kind, skin) {
    if (kind === 'enemy' || !find(kind, skin)) return false;
    if (!isOwned(kind, skin)) return false;
    const st = load(); st.equip[kind] = skin; save(st);
    return true;
  }
  // test / QA helper: credit points straight into the lifetime blob (same field the run merge uses)
  function grant(n) { const b = Object.assign({ points: 0, spent: 0 }, life()); b.points = Math.round((b.points || 0) + n); saveLife(b); return balance(); }
  function reset() { mem = null; memLife = null; try { const s = ls(); if (s) s.removeItem(KEY); } catch (e) { /* ignore */ } }

  IT.Shop = { CATALOG, KINDS, PRICING, find, total, minutesToUnlockAll, owned, equipped, stateOf, buy, equip, balance, earned, spent, grant, reset, price: (k, s) => (find(k, s) || {}).price };
})(typeof window !== 'undefined' ? window : globalThis);
