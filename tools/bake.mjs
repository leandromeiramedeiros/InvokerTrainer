// Bake Dota 2 KV data into js/data/dota.js.
// Usage: node tools/bake.mjs [--sha <sha>] [--check]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseKV } from './vdf.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'js', 'data', 'dota.js');
const REPO = 'SteamDatabase/GameTracking-Dota2';
const UA = { 'User-Agent': 'invoker-trainer-bake' };

const args = process.argv.slice(2);
const argv = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const CHECK = args.includes('--check');

const ITEMS = ['item_refresher', 'item_rod_of_atos', 'item_sheepstick', 'item_shivas_guard', 'item_meteor_hammer',
  'item_black_king_bar', 'item_blink', 'item_ultimate_scepter', 'item_aghanims_shard', 'item_orchid', 'item_gungir',
  'item_travel_boots', 'item_travel_boots_2', 'item_boots', 'item_force_staff', 'item_cyclone', 'item_invis_sword', 'item_dust'];
const HERO_KEYS = ['AttackCapabilities', 'AttackDamageMin', 'AttackDamageMax', 'AttackDamageType', 'AttackRate',
  'BaseAttackSpeed', 'AttackAnimationPoint', 'AttackAcquisitionRange', 'AttackRange', 'ProjectileSpeed',
  'ArmorPhysical', 'MagicalResistance', 'MovementSpeed', 'MovementTurnRate', 'StatusHealth', 'StatusHealthRegen',
  'StatusMana', 'StatusManaRegen', 'AttributePrimary', 'AttributeBaseStrength', 'AttributeStrengthGain',
  'AttributeBaseAgility', 'AttributeAgilityGain', 'AttributeBaseIntelligence', 'AttributeIntelligenceGain',
  'VisionDaytimeRange', 'VisionNighttimeRange', 'BoundsHullName', 'RingRadius', 'ModelScale', 'Level'];
// Engine hull radii (not in KV): documented Dota values.
const HULL = { DOTA_HULL_SIZE_SMALL: 8, DOTA_HULL_SIZE_REGULAR: 16, DOTA_HULL_SIZE_SIEGE: 16, DOTA_HULL_SIZE_HERO: 24,
  DOTA_HULL_SIZE_HUGE: 80, DOTA_HULL_SIZE_BUILDING: 144, DOTA_HULL_SIZE_FILLER: 96, DOTA_HULL_SIZE_BARRACKS: 144,
  DOTA_HULL_SIZE_TOWER: 144 };

async function getJSON(url) {
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}
async function fetchFile(sha, rel, name) {
  const dir = path.join(ROOT, 'tools', '.cache', sha);
  const f = path.join(dir, name);
  if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8');
  const url = `https://raw.githubusercontent.com/${REPO}/${sha}/game/dota/pak01_dir/${rel}`;
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  const t = await r.text();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(f, t);
  return t;
}

const num = (s) => { if (typeof s !== 'string') return NaN; const t = s.trim(); return t !== '' && /^[+-]?(\d+\.?\d*|\.\d+)$/.test(t) ? parseFloat(t) : NaN; };
function numArr(s) {
  if (typeof s !== 'string') return null;
  const p = s.trim().split(/\s+/);
  const a = p.map(num);
  return a.length && a.every(Number.isFinite) ? a : null;
}
const strip = (s, pre) => (s || '').split('|').map((x) => x.trim()).filter(Boolean).map((x) => x.replace(pre, ''));
const DMG = { DAMAGE_TYPE_MAGICAL: 'magical', DAMAGE_TYPE_PHYSICAL: 'physical', DAMAGE_TYPE_PURE: 'pure' };

// modifier key -> src, or null to drop (facets etc.)
function modSrc(k) {
  if (/^special_bonus_scepter(_\d+)?$/.test(k)) return 'scepter';
  if (/^special_bonus_shard(_\d+)?$/.test(k)) return 'shard';
  if (/^special_bonus_facet/.test(k)) return null;
  if (/^special_bonus_/.test(k)) return k;
  return null;
}
function parseMod(src, raw) {
  if (typeof raw !== 'string') return null; // nested block (facet-only in this data)
  const t = raw.trim();
  const arr = numArr(t);
  if (arr && arr.length > 1) return { src, op: '=', v: arr };
  let m = /^([+-])\s*(\d*\.?\d+)%$/.exec(t);
  if (m) return { src, op: '+%', n: parseFloat(m[1] + m[2]) };
  m = /^x\s*(\d*\.?\d+)$/i.exec(t);
  if (m) return { src, op: 'x', n: parseFloat(m[1]) };
  m = /^=\s*([+-]?\d*\.?\d+)$/.exec(t);
  if (m) return { src, op: '=', n: parseFloat(m[1]) };
  m = /^([+-])\s*(\d*\.?\d+)$/.exec(t);
  if (m) return { src, op: m[1], n: parseFloat(m[2]) };
  m = /^(\d*\.?\d+)$/.exec(t);
  if (m) return { src, op: '+', n: parseFloat(m[1]) }; // plain = additive
  return null;
}
function parseValue(raw) {
  if (typeof raw === 'string') {
    const v = numArr(raw);
    return v ? { v, levelkey: null, mods: [] } : null;
  }
  const v = numArr(raw.value);
  if (!v) return null;
  const e = { v, levelkey: raw.levelkey || null, mods: [] };
  for (const [k, x] of Object.entries(raw)) {
    const lk = k.toLowerCase();
    if (lk === 'requiresscepter' && x === '1') e.requiresScepter = true;
    else if (lk === 'requiresshard' && x === '1') e.requiresShard = true;
    else { const s = modSrc(k); if (s) { const m = parseMod(s, x); if (m) e.mods.push(m); } }
  }
  return e;
}
function parseAbility(a) {
  const o = {};
  o.behavior = strip(a.AbilityBehavior, 'DOTA_ABILITY_BEHAVIOR_');
  o.targetTeam = strip(a.AbilityUnitTargetTeam, 'DOTA_UNIT_TARGET_TEAM_')[0] || null;
  o.targetType = strip(a.AbilityUnitTargetType, 'DOTA_UNIT_TARGET_');
  o.damageType = DMG[a.AbilityUnitDamageType] || null;
  o.spellImmunity = (a.SpellImmunityType || '').replace('SPELL_IMMUNITY_', '') || null;
  o.maxLevel = num(a.MaxLevel) || 1;
  o.innate = a.Innate === '1';
  const values = {};
  const AV = a.AbilityValues || {};
  for (const [k, raw] of Object.entries(AV)) { const e = parseValue(raw); if (e) values[k] = e; }
  const top = { castPoint: 'AbilityCastPoint', castRange: 'AbilityCastRange', cooldown: 'AbilityCooldown',
    manaCost: 'AbilityManaCost', channelTime: 'AbilityChannelTime', duration: 'AbilityDuration' };
  for (const [f, k] of Object.entries(top)) {
    const arr = values[k] ? values[k].v : numArr(a[k]);
    if (arr) o[f] = arr; else if (f !== 'duration') o[f] = [0];
  }
  if (a.ItemCost) o.cost = num(a.ItemCost);
  o.values = values;
  return o;
}

function pick(obj, keys) {
  const o = {};
  for (const k of keys) {
    if (obj[k] === undefined) continue;
    const n = num(obj[k]);
    o[k] = Number.isFinite(n) ? n : obj[k];
  }
  if (o.BoundsHullName && HULL[o.BoundsHullName] !== undefined) o.HullRadius = HULL[o.BoundsHullName];
  return o;
}

function ser(v, ind) {
  const pad = '  '.repeat(ind);
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) {
    if (v.every((x) => x === null || typeof x !== 'object')) return '[' + v.map((x) => JSON.stringify(x)).join(',') + ']';
    return '[\n' + v.map((x) => pad + '  ' + ser(x, ind + 1)).join(',\n') + '\n' + pad + ']';
  }
  const ks = Object.keys(v);
  if (!ks.length) return '{}';
  const flat = JSON.stringify(v);
  if (flat.length < 110) return flat;
  return '{\n' + ks.map((k) => pad + '  ' + JSON.stringify(k) + ': ' + ser(v[k], ind + 1)).join(',\n') + '\n' + pad + '}';
}

async function bake(sha) {
  const P = 'game/dota/pak01_dir/scripts/npc/';
  const [inv, base, units, items] = await Promise.all([
    fetchFile(sha, P + 'heroes/npc_dota_hero_invoker.txt', 'npc_dota_hero_invoker.txt'),
    fetchFile(sha, P + 'heroes/npc_dota_hero_base.txt', 'npc_dota_hero_base.txt'),
    fetchFile(sha, P + 'npc_units.txt', 'npc_units.txt'),
    fetchFile(sha, P + 'items.txt', 'items.txt'),
  ]);
  const steam = await fetchSteamInf(sha);
  const kv = (t) => parseKV(t);
  const hb = kv(base).DOTAHeroes.npc_dota_hero_base;
  const hi = kv(inv).DOTAHeroes.npc_dota_hero_invoker;
  const hero = pick({ ...hb, ...hi }, HERO_KEYS);
  const slots = [];
  for (let i = 1; i <= 25; i++) slots.push([i, hi['Ability' + i] || '']);
  hero.abilities = slots.filter(([i, n]) => i <= 16 && n).map(([, n]) => n);
  const tStart = num(hi.AbilityTalentStart) || 17;
  const tl = [];
  for (let i = tStart; i < tStart + 8; i++) tl.push(hi['Ability' + i] || '');
  // KV order: Ability17/19/21/23 = tier "right" talent, 18/20/22/24 = tier "left" (Valve convention: first of each
  // pair is the right-hand talent). Emitted as [left,right] per tier.
  hero.talents = [0, 1, 2, 3].map((t) => [tl[t * 2 + 1], tl[t * 2]]);

  const defs = hi.AbilityDefinitions;
  const abilities = {};
  for (const [n, a] of Object.entries(defs)) {
    if (n.endsWith('_ad') || n === 'invoker_attribute_bonus' || n === 'invoker_mastermind' || n === 'invoker_empty1' || n === 'invoker_empty2') continue;
    abilities[n] = parseAbility(a);
  }
  // talents: reverse index from modifiers (talent abilities have no AbilityValues of their own in the KV)
  const talents = {};
  const addT = (name) => { if (!talents[name]) talents[name] = { affects: [] }; return talents[name]; };
  tl.forEach((n, i) => { if (n) { const t = addT(n); t.tier = [10, 15, 20, 25][i >> 1]; t.side = i % 2 === 0 ? 'right' : 'left'; } });
  for (const [an, a] of Object.entries(abilities)) {
    for (const [k, e] of Object.entries(a.values)) {
      for (const m of e.mods) {
        if (m.src === 'scepter' || m.src === 'shard') continue;
        const t = addT(m.src);
        t.affects.push({ ability: an, key: k, ...(m.v ? { op: m.op, v: m.v } : { op: m.op, n: m.n }) });
      }
    }
  }
  for (const n of Object.keys(talents)) talents[n].inTree = tl.includes(n);

  const su = kv(units).DOTAUnits || kv(units).DOTAAbilities || Object.values(kv(units))[0];
  const fs0 = su.npc_dota_invoker_forged_spirit;
  if (!fs0) throw new Error('forged spirit unit missing');
  const unit = pick(fs0, HERO_KEYS.filter((k) => !k.startsWith('Attribute')));
  const it = kv(items).DOTAAbilities;
  const itemsOut = {};
  for (const n of ITEMS) { if (!it[n]) throw new Error('item missing ' + n); itemsOut[n] = parseAbility(it[n]); }

  const dota = { meta: { source: REPO, sha, patch: steam.patch, versionDate: steam.date }, hero, abilities, talents,
    items: itemsOut, units: { npc_dota_invoker_forged_spirit: unit } };
  return '// GENERATED by tools/bake.mjs — do not edit\n(function(G){ const IT = G.IT = G.IT || {}; IT.DOTA = '
    + ser(dota, 0) + '; })(typeof window!==\'undefined\'?window:globalThis);\n';
}

async function fetchSteamInf(sha) {
  const t = await fetchFile(sha, '../steam.inf', 'steam.inf').catch(() => null);
  const s = t || '';
  const g = (k) => (new RegExp('^' + k + '=(.*)$', 'm').exec(s) || [])[1];
  return { patch: (g('ClientVersion') || '').trim(), date: (g('VersionDate') || '').trim() };
}

const out0 = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : null;
let sha = argv('--sha');
if (CHECK) {
  const m = out0 && /"sha": "([0-9a-f]{40})"/.exec(out0) || (out0 && /"sha":"([0-9a-f]{40})"/.exec(out0));
  if (!m) { console.error('check: no sha in committed dota.js'); process.exit(1); }
  sha = m[1];
} else if (!sha) {
  sha = (await getJSON(`https://api.github.com/repos/${REPO}/commits/master`)).sha;
}
const text = await bake(sha);
if (CHECK) {
  if (text === out0) { console.log('check ok ' + sha.slice(0, 10)); process.exit(0); }
  const a = out0.split('\n'), b = text.split('\n');
  let d = 0;
  for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) { if (d++ < 5) console.error(`line ${i + 1}:\n- ${a[i]}\n+ ${b[i]}`); }
  console.error(`check FAILED: ${d} differing lines`);
  process.exit(1);
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, text);
console.log(`baked ${sha} -> ${path.relative(ROOT, OUT)} (${text.length} bytes)`);
