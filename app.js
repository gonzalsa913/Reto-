/* ==========================================================================
   Reto 5 USD — app.js
   JavaScript vanilla, sin dependencias. Datos en localStorage.
   ========================================================================== */
'use strict';
(() => {

/* --------------------------------------------------------------------------
   Constantes
   -------------------------------------------------------------------------- */
const APP_VERSION = '1.0.0';
const LS_DATA = 'reto5:data';
const LS_BACKUP = 'reto5:backup';
const LS_CACHE = 'reto5:cache:';
const TTL = 15 * 60 * 1000;
const TTL_ETF = 30 * 60 * 1000; // SPY/QQQ usan créditos de Twelve Data: guardamos más tiempo
// Clave incluida para que SPY y QQQ funcionen sin configurar nada.
// Si cargás tu propia clave en Ajustes, se usa esa.
const BUILTIN_TD_KEY = 'ceeb81257b2e4b738fc29f8bf6a352f8';
const MILESTONES = [25, 50, 75, 100];
const RM = window.matchMedia('(prefers-reduced-motion: reduce)');
const reduced = () => RM.matches;

const ASSETS = {
  SPY: { sym: 'SPY', name: 'S&P 500', kind: 'etf', dec: 4 },
  QQQ: { sym: 'QQQ', name: 'Nasdaq 100', kind: 'etf', dec: 4 },
  BTC: { sym: 'BTC', name: 'Bitcoin', kind: 'crypto', cg: 'bitcoin', dec: 6 },
  ETH: { sym: 'ETH', name: 'Ethereum', kind: 'crypto', cg: 'ethereum', dec: 5 },
};
const ASSET_KEYS = Object.keys(ASSETS);
const SOURCES = ['dolar', ...ASSET_KEYS];

const FREQS = {
  diaria: { label: 'Diaria', days: 1 },
  semanal: { label: 'Semanal', days: 7 },
  quincenal: { label: 'Quincenal', days: 15 },
  mensual: { label: 'Mensual', days: 30 },
};
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

const DEFAULT_RULES = {
  buyDay: { on: true },
  deviation: { on: true },
  cryptoVol: { on: true, drop30: 20, fromMax: 40 },
  behind: { on: true, days: 7 },
  fee: { on: true, pct: 2 },
  gap: { on: true, pct: 8 },
  milestone: { on: true },
  monthly: { on: true },
};

/* --------------------------------------------------------------------------
   Utilidades
   -------------------------------------------------------------------------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = () => toISO(new Date());
const parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const isISO = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && toISO(parseISO(s)) === s;
const dayNum = (s) => { const [y, m, d] = s.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 864e5); };
const daysBetween = (a, b) => dayNum(b) - dayNum(a);
const addDays = (s, n) => { const d = parseISO(s); d.setDate(d.getDate() + n); return toISO(d); };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const sum = (arr, f = (x) => x) => arr.reduce((a, x) => a + f(x), 0);
const isNum = (v) => typeof v === 'number' && isFinite(v);
const raf2 = (fn) => requestAnimationFrame(() => requestAnimationFrame(fn));

function parseNum(str) {
  if (typeof str === 'number') return str;
  let s = String(str || '').trim().replace(/\s|US\$|\$/g, '');
  if (!s) return NaN;
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(',', '.');
  return /^-?\d*\.?\d+$/.test(s) ? parseFloat(s) : NaN;
}
const numToInput = (v) => (isNum(v) ? String(+v.toFixed(8)).replace('.', ',') : '');

/* Formatos (es-AR) */
const NF = {};
const nf = (min, max) => NF[min + '-' + max] || (NF[min + '-' + max] = new Intl.NumberFormat('es-AR', { minimumFractionDigits: min, maximumFractionDigits: max }));
const MINUS = '−';
const n2 = (v) => nf(2, 2).format(v);
const sign = (v, eps) => (v > eps ? '+' : v < -eps ? MINUS : '');
const FMT = {
  usd: (v) => n2(v),
  usd0: (v) => nf(0, 0).format(v),
  ars: (v) => n2(v),
  pct0: (v) => nf(0, 0).format(v),
  pct1: (v) => nf(1, 1).format(v),
  spct1: (v) => sign(v, 0.049) + nf(1, 1).format(Math.abs(v)) + ' %',
  susd: (v) => sign(v, 0.0049) + n2(Math.abs(v)),
  int: (v) => nf(0, 0).format(Math.round(v)),
};
const usd = (v) => 'US$ ' + n2(v);
const usd0 = (v) => 'US$ ' + nf(0, 2).format(v);
const pct = (v, d = 1) => nf(0, d).format(v) + ' %';
const spct = (v) => FMT.spct1(v).replace(' ', ' ');
const fmtQty = (v, a) => nf(2, ASSETS[a].dec).format(v);
const fmtPrice = (v) => (v >= 100 ? n2(v) : nf(2, 4).format(v));
const fmtDay = (s) => parseISO(s).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }).replace('.', '');
const fmtDayFull = (s) => parseISO(s).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtMonth = (s) => parseISO(s).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
const monthOnly = (s) => parseISO(s).toLocaleDateString('es-AR', { month: 'long' });
function ago(t) {
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 1) return 'recién';
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

/* --------------------------------------------------------------------------
   Estado y persistencia
   -------------------------------------------------------------------------- */
function defaultSettings() {
  return {
    daily: 5, startDate: todayStr(), cryptoTarget: 20, deviation: 5,
    frequency: 'semanal', buyDay: 1, minAmount: 10, tdKey: '',
    rules: JSON.parse(JSON.stringify(DEFAULT_RULES)),
  };
}
function defaultState() {
  return { version: 1, settings: defaultSettings(), purchases: [], dismissed: {}, milestones: [], demo: false };
}

function numIn(v, min, max, def) { const n = parseNum(v); return isNum(n) && n >= min && n <= max ? n : def; }

function sanitizeSettings(s) {
  const d = defaultSettings();
  if (!s || typeof s !== 'object') return d;
  const out = {
    daily: numIn(s.daily, 0.5, 1000, d.daily),
    startDate: isISO(s.startDate) ? s.startDate : d.startDate,
    cryptoTarget: numIn(s.cryptoTarget, 0, 100, d.cryptoTarget),
    deviation: numIn(s.deviation, 1, 50, d.deviation),
    frequency: FREQS[s.frequency] ? s.frequency : d.frequency,
    buyDay: Math.round(numIn(s.buyDay, 0, 28, d.buyDay)),
    minAmount: numIn(s.minAmount, 0, 10000, d.minAmount),
    tdKey: typeof s.tdKey === 'string' ? s.tdKey.trim().slice(0, 100) : '',
    rules: JSON.parse(JSON.stringify(DEFAULT_RULES)),
  };
  if (out.frequency === 'semanal' && out.buyDay > 6) out.buyDay = 1;
  if (out.frequency === 'mensual' && out.buyDay < 1) out.buyDay = 1;
  const r = s.rules && typeof s.rules === 'object' ? s.rules : {};
  for (const k of Object.keys(out.rules)) {
    const src = r[k] && typeof r[k] === 'object' ? r[k] : {};
    if (typeof src.on === 'boolean') out.rules[k].on = src.on;
  }
  out.rules.cryptoVol.drop30 = numIn(r.cryptoVol?.drop30, 5, 90, 20);
  out.rules.cryptoVol.fromMax = numIn(r.cryptoVol?.fromMax, 5, 95, 40);
  out.rules.behind.days = numIn(r.behind?.days, 1, 90, 7);
  out.rules.fee.pct = numIn(r.fee?.pct, 0.1, 20, 2);
  out.rules.gap.pct = numIn(r.gap?.pct, 1, 100, 8);
  return out;
}

function purchaseError(p) {
  if (!p || typeof p !== 'object') return 'formato inválido';
  if (!isISO(p.date)) return 'fecha inválida';
  if (!ASSETS[p.asset]) return 'activo desconocido';
  const amount = +p.amount, price = +p.price, fee = +(p.fee || 0);
  if (!isNum(amount) || amount <= 0) return 'el monto tiene que ser mayor a 0';
  if (!isNum(price) || price <= 0) return 'el precio tiene que ser mayor a 0';
  if (!isNum(fee) || fee < 0) return 'la comisión no puede ser negativa';
  if (fee >= amount) return 'la comisión tiene que ser menor al monto';
  return null;
}

function validateData(obj) {
  const fail = (error) => ({ ok: false, error });
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return fail('El archivo no tiene el formato esperado.');
  if (!Array.isArray(obj.purchases)) return fail('El archivo no tiene una lista de compras.');
  const seen = new Set();
  const purchases = [];
  for (let i = 0; i < obj.purchases.length; i++) {
    const p = obj.purchases[i];
    const e = purchaseError(p);
    if (e) return fail(`Compra ${i + 1}: ${e}.`);
    let id = typeof p.id === 'string' && p.id ? p.id.slice(0, 40) : uid();
    while (seen.has(id)) id = uid();
    seen.add(id);
    purchases.push({ id, date: p.date, asset: p.asset, amount: +p.amount, price: +p.price, fee: +(p.fee || 0) });
  }
  const dismissed = {};
  if (obj.dismissed && typeof obj.dismissed === 'object') {
    for (const [k, v] of Object.entries(obj.dismissed)) if (v === true && k.length < 80) dismissed[k] = true;
  }
  return {
    ok: true,
    data: {
      version: 1,
      settings: sanitizeSettings(obj.settings),
      purchases,
      dismissed,
      milestones: Array.isArray(obj.milestones) ? obj.milestones.filter((m) => MILESTONES.includes(m)) : [],
      demo: obj.demo === true,
    },
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(LS_DATA);
    if (raw) { const r = validateData(JSON.parse(raw)); if (r.ok) return r.data; }
  } catch (e) { /* datos corruptos: arrancamos limpio */ }
  return defaultState();
}
let state = loadState();
function save() {
  try { localStorage.setItem(LS_DATA, JSON.stringify(state)); }
  catch (e) { toast('No se pudo guardar en este dispositivo.'); }
}
const sortedPurchases = () => state.purchases.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
const qtyOf = (p) => (p.amount - p.fee) / p.price;

/* --------------------------------------------------------------------------
   Datos de mercado (cache 15 min + respaldo "viejo")
   -------------------------------------------------------------------------- */
const market = {};
SOURCES.forEach((k) => { market[k] = { status: 'idle' }; });

function readCache(key) {
  try { const r = JSON.parse(localStorage.getItem(LS_CACHE + key)); if (r && r.t && r.data) return r; } catch (e) { /* nada */ }
  return null;
}
function writeCache(key, data) {
  try { localStorage.setItem(LS_CACHE + key, JSON.stringify({ t: Date.now(), data })); } catch (e) { /* lleno */ }
}
async function fetchJSON(url, ms = 12000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally { clearTimeout(id); }
}
async function cached(key, url, parse, force, ttl = TTL) {
  const c = readCache(key);
  if (!force && c && Date.now() - c.t < ttl) return { data: c.data, t: c.t, status: 'ok' };
  try {
    const data = parse(await fetchJSON(url));
    writeCache(key, data);
    return { data, t: Date.now(), status: 'ok' };
  } catch (e) {
    if (c) return { data: c.data, t: c.t, status: 'stale', error: e.message };
    throw e;
  }
}

function parseDolar(json) {
  if (!Array.isArray(json)) throw new Error('Formato inesperado');
  const by = {};
  json.forEach((x) => { if (x && x.casa) by[x.casa] = x; });
  const pick = (k) => (by[k] && isNum(+by[k].venta) ? { c: +by[k].compra || null, v: +by[k].venta, f: by[k].fechaActualizacion || null } : null);
  const out = { mep: pick('bolsa'), ccl: pick('contadoconliqui'), oficial: pick('oficial'), blue: pick('blue') };
  if (!out.mep && !out.ccl && !out.oficial && !out.blue) throw new Error('Sin cotizaciones');
  return out;
}
function parseCG(json) {
  if (!json || !Array.isArray(json.prices)) throw new Error('Formato inesperado');
  const map = new Map();
  json.prices.forEach(([t, p]) => { if (isNum(t) && isNum(p) && p > 0) map.set(toISO(new Date(t)), p); });
  const s = Array.from(map, ([d, p]) => ({ d, p })).sort((a, b) => (a.d < b.d ? -1 : 1));
  if (s.length < 10) throw new Error('Serie corta');
  return s;
}
function parseTD(json) {
  if (!json || json.status === 'error' || !Array.isArray(json.values)) throw new Error((json && json.message) || 'Twelve Data');
  const s = json.values
    .map((v) => ({ d: String(v.datetime).slice(0, 10), p: parseFloat(v.close) }))
    .filter((x) => isISO(x.d) && isNum(x.p) && x.p > 0)
    .sort((a, b) => (a.d < b.d ? -1 : 1));
  if (s.length < 10) throw new Error('Serie corta');
  return s;
}

function sourceDef(name) {
  if (name === 'dolar') return { key: 'dolar', url: 'https://dolarapi.com/v1/dolares', parse: parseDolar };
  const a = ASSETS[name];
  if (a.cg) return { key: 'cg:' + name, url: `https://api.coingecko.com/api/v3/coins/${a.cg}/market_chart?vs_currency=usd&days=365&interval=daily`, parse: parseCG };
  const k = state.settings.tdKey.trim() || BUILTIN_TD_KEY;
  return { key: 'td:' + name, url: k ? `https://api.twelvedata.com/time_series?symbol=${name}&interval=1day&outputsize=400&apikey=${encodeURIComponent(k)}` : null, parse: parseTD, ttl: TTL_ETF };
}

/* Hidratar desde cache al arrancar para pintar sin esperar */
function hydrateMarket() {
  SOURCES.forEach((name) => {
    const def = sourceDef(name);
    const c = readCache(def.key);
    if (c) market[name] = { data: c.data, t: c.t, status: Date.now() - c.t < (def.ttl || TTL) ? 'ok' : 'stale' };
    else if (!def.url) market[name] = { status: 'nokey' };
  });
}

async function loadSource(name, force) {
  const def = sourceDef(name);
  if (!def.url) {
    const c = readCache(def.key);
    market[name] = c ? { data: c.data, t: c.t, status: 'stale' } : { status: 'nokey' };
    notifyMarket();
    return;
  }
  market[name] = { ...market[name], status: 'loading' };
  notifyMarket();
  try { market[name] = await cached(def.key, def.url, def.parse, force, def.ttl); }
  catch (e) {
    const prev = market[name];
    market[name] = prev.data ? { ...prev, status: 'stale', error: e.message } : { status: 'error', error: e.message };
  }
  notifyMarket();
}
let marketPromise = null;
function loadMarket(force) {
  marketPromise = Promise.allSettled(SOURCES.map((n) => loadSource(n, force)));
  return marketPromise;
}

/* Series de prueba deterministas (solo con datos de prueba y sin datos reales) */
const DEMO = {
  BTC: { p: 91800, vol: 0.52, drift: 0.05, seed: 35 },
  ETH: { p: 3140, vol: 0.7, drift: 0.02, seed: 34 },
  SPY: { p: 671.4, vol: 0.15, drift: 0.11, seed: 1 },
  QQQ: { p: 603.2, vol: 0.2, drift: 0.14, seed: 10 },
};
const demoCache = {};
function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function demoSeries(a) {
  const today = todayStr();
  if (demoCache[a] && demoCache[a].end === today) return demoCache[a].s;
  const { p, vol, drift, seed } = DEMO[a];
  const rnd = mulberry32(seed);
  const n = 400, dt = 1 / 365;
  let x = 0;
  const xs = [0];
  for (let i = 1; i < n; i++) {
    const z = Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(2 * Math.PI * rnd());
    x += (drift - (vol * vol) / 2) * dt + vol * Math.sqrt(dt) * z;
    xs.push(x);
  }
  const last = xs[n - 1];
  const s = xs.map((v, i) => ({ d: addDays(today, i - (n - 1)), p: +(p * Math.exp(v - last)).toFixed(2) }));
  demoCache[a] = { end: today, s };
  return s;
}
function demoDolar() {
  const f = new Date().toISOString();
  return { mep: { c: 1428.4, v: 1446.9, f }, ccl: { c: 1452.1, v: 1471.3, f }, oficial: { c: 1385, v: 1435, f }, blue: { c: 1405, v: 1425, f } };
}

function getSeries(a) {
  const m = market[a];
  if (m && m.data) return m.data;
  if (state.demo) return demoSeries(a);
  return null;
}
const isDemoSource = (a) => !(market[a] && market[a].data) && state.demo;
function getDolar() {
  if (market.dolar.data) return market.dolar.data;
  return state.demo ? demoDolar() : null;
}

function lastPurchasePrice(a, upTo) {
  let p = null, first = null;
  for (const x of sortedPurchases()) {
    if (x.asset !== a) continue;
    if (first === null) first = x.price;
    if (!upTo || x.date <= upTo) p = x.price;
  }
  return p !== null ? p : first;
}
function currentPrice(a) {
  const s = getSeries(a);
  if (s && s.length) return { p: s[s.length - 1].p, src: 'market' };
  const p = lastPurchasePrice(a);
  return p !== null ? { p, src: 'purchase' } : null;
}
function priceAt(a, d, s = getSeries(a)) {
  if (s && s.length && d >= s[0].d) {
    let lo = 0, hi = s.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (s[mid].d <= d) lo = mid; else hi = mid - 1; }
    return s[lo].p;
  }
  const p = lastPurchasePrice(a, d);
  return p !== null ? p : 0;
}
const isLoadingAsset = (a) => !getSeries(a) && ['loading', 'idle'].includes(market[a].status);

/* --------------------------------------------------------------------------
   Cálculos
   -------------------------------------------------------------------------- */
function portfolio() {
  const per = {};
  let invested = 0, value = 0, fees = 0, etf = 0, crypto = 0, fallback = false, loading = false;
  for (const a of ASSET_KEYS) per[a] = { qty: 0, invested: 0, fees: 0, n: 0, value: 0, price: null, src: null };
  for (const p of state.purchases) {
    const h = per[p.asset];
    h.qty += qtyOf(p); h.invested += p.amount; h.fees += p.fee; h.n++;
  }
  for (const a of ASSET_KEYS) {
    const h = per[a];
    invested += h.invested; fees += h.fees;
    if (h.n === 0) continue;
    if (isLoadingAsset(a)) loading = true;
    const cp = currentPrice(a);
    if (cp) { h.price = cp.p; h.src = cp.src; h.value = h.qty * cp.p; if (cp.src === 'purchase') fallback = true; }
    h.pl = h.value - h.invested;
    h.plPct = h.invested ? (h.pl / h.invested) * 100 : 0;
    value += h.value;
    if (ASSETS[a].kind === 'crypto') crypto += h.value; else etf += h.value;
  }
  const pl = value - invested;
  return {
    per, invested, value, fees, etf, crypto, fallback, loading,
    pl, plPct: invested ? (pl / invested) * 100 : 0,
    cryptoPct: value > 0 ? (crypto / value) * 100 : 0,
  };
}

function progress() {
  const s = state.settings;
  const today = todayStr();
  const goal = s.daily * 365;
  const invested = sum(state.purchases, (p) => p.amount);
  const elapsed = daysBetween(s.startDate, today) + 1;
  const day = clamp(elapsed, 0, 365);
  const accrued = day * s.daily;
  const reserved = Math.max(0, accrued - invested);
  return { goal, invested, day, accrued, reserved, pct: goal > 0 ? invested / goal : 0, notStarted: elapsed < 1, ended: elapsed > 365 };
}

function metrics(series, kind) {
  if (!series || series.length < 2) return null;
  const last = series[series.length - 1];
  const from = addDays(last.d, -365);
  const yr = series.filter((x) => x.d >= from);
  const max = Math.max(...yr.map((x) => x.p));
  const ps = series.map((x) => x.p);
  const smaN = 200;
  const sma = ps.length >= smaN ? sum(ps.slice(-smaN)) / smaN : null;
  const tail = ps.slice(-31);
  const rets = [];
  for (let i = 1; i < tail.length; i++) rets.push(Math.log(tail[i] / tail[i - 1]));
  const mean = sum(rets) / rets.length;
  const sd = rets.length > 1 ? Math.sqrt(sum(rets, (r) => (r - mean) ** 2) / (rets.length - 1)) : null;
  const ann = kind === 'crypto' ? 365 : 252;
  const p30 = priceAt(null, addDays(last.d, -30), series);
  return {
    last: last.p,
    lastDate: last.d,
    dd: (last.p / max - 1) * 100,
    sma: sma ? (last.p / sma - 1) * 100 : null,
    vol: sd !== null ? sd * Math.sqrt(ann) * 100 : null,
    chg30: p30 ? (last.p / p30 - 1) * 100 : null,
    chg1y: (last.p / yr[0].p - 1) * 100,
  };
}

function isBuyDay(dStr) {
  const s = state.settings;
  const d = parseISO(dStr);
  switch (s.frequency) {
    case 'diaria': return true;
    case 'semanal': return d.getDay() === s.buyDay;
    case 'quincenal': return d.getDate() === 1 || d.getDate() === 15;
    case 'mensual': return d.getDate() === s.buyDay;
    default: return false;
  }
}
function nextBuyDay(from) {
  for (let i = 1; i <= 32; i++) { const d = addDays(from, i); if (isBuyDay(d)) return d; }
  return null;
}

/* Reparto sugerido para acercarse al objetivo con lo reservado */
function suggestSplit(R, pf) {
  const s = state.settings;
  const t = s.cryptoTarget / 100;
  const total = pf.etf + pf.crypto + R;
  let cry = clamp(t * total - pf.crypto, 0, R);
  let etf = R - cry;
  const min = s.minAmount;
  if (cry > 0 && etf > 0 && (cry < min || etf < min)) {
    const defCry = t * total - pf.crypto;
    const defEtf = (1 - t) * total - pf.etf;
    if (defCry > defEtf) { cry = R; etf = 0; } else { etf = R; cry = 0; }
  }
  return { etf, cry };
}

/* --------------------------------------------------------------------------
   Recomendaciones: cada regla es una función en RULES
   -------------------------------------------------------------------------- */
const I = {
  cal: '<path d="M4 8.5h16M8 3.5v3M16 3.5v3"/><rect x="4" y="5.5" width="16" height="15" rx="4"/>',
  scale: '<path d="M12 4v16M5 20h14M6 8l-3 6a3 3 0 0 0 6 0zM18 8l-3 6a3 3 0 0 0 6 0zM6 8h12"/>',
  wave: '<path d="M3 12c2.5-5 5-5 7.5 0s5 5 7.5 0 2.5-2.5 3-2.5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  receipt: '<path d="M6 3.5h12v17l-3-2-3 2-3-2-3 2z"/><path d="M9 8.5h6M9 12h6"/>',
  swap: '<path d="M7 7h12l-3-3M17 17H5l3 3"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  chart: '<path d="M4 19h16M7 15v-3M12 15V8M17 15v-5"/>',
  check: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.2l2.3 2.3 4.7-4.8"/>',
};
const icon = (k, cls = 'rec__icon') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${I[k]}</svg>`;

const RULES = [
  {
    id: 'milestone', label: 'Hitos de progreso', hint: 'Al llegar al 25, 50, 75 y 100 %',
    fn({ prog }) {
      const reached = MILESTONES.filter((m) => prog.pct * 100 >= m);
      if (!reached.length) return null;
      const m = reached[reached.length - 1];
      const copy = {
        25: 'Un cuarto del camino. Lo más difícil, que es arrancar y sostenerlo, ya lo estás haciendo.',
        50: 'La mitad del reto, hecha con constancia. Seguí a tu ritmo.',
        75: 'Tres cuartos del camino. Ya es un hábito.',
        100: 'Completaste el reto. Un año de constancia, aporte por aporte.',
      };
      return { key: 'milestone:' + m, tone: 'accent', icon: 'flag', title: `¡Llegaste al ${m} %!`, body: `Ya invertiste ${usd(prog.invested)} de ${usd0(prog.goal)}. ${copy[m]}` };
    },
  },
  {
    id: 'buyDay', label: 'Día de compra', hint: 'Con reparto sugerido según tu objetivo',
    fn({ s, prog, pf, today }) {
      if (prog.notStarted || prog.ended) return null;
      const boughtToday = state.purchases.some((p) => p.date === today);
      if (isBuyDay(today)) {
        if (boughtToday) return { key: 'buyDay:done:' + today, tone: 'calm', icon: 'check', title: 'Compra de hoy, hecha', body: 'Ya registraste tu compra. Lo que sigue es paciencia.' };
        const R = prog.reserved;
        if (R < Math.max(s.minAmount, 0.01)) {
          return { key: 'buyDay:' + today, tone: 'calm', icon: 'cal', title: 'Hoy es día de compra', body: `Tenés ${usd(R)} reservados y tu monto mínimo es ${usd(s.minAmount)}. Podés esperar a la próxima y juntar un poco más.` };
        }
        const sp = suggestSplit(R, pf);
        return {
          key: 'buyDay:' + today, tone: 'accent', icon: 'cal', title: 'Hoy toca comprar',
          body: `Tenés ${usd(R)} reservados. Para acercarte a tu reparto objetivo (${pct(100 - s.cryptoTarget, 0)} ETF · ${pct(s.cryptoTarget, 0)} cripto), podrías repartirlo así:`,
          split: [{ label: 'ETF', v: sp.etf, sub: 'SPY · QQQ' }, { label: 'Cripto', v: sp.cry, sub: 'BTC · ETH' }],
        };
      }
      if (s.frequency === 'diaria') return null;
      const next = nextBuyDay(today);
      if (!next) return null;
      const projected = Math.min(prog.reserved + daysBetween(today, next) * s.daily, Math.max(0, prog.goal - prog.invested));
      return { key: 'buyDay:next:' + next, tone: 'calm', icon: 'cal', title: `Próxima compra: ${fmtDayFull(next)}`, body: `Para ese día vas a tener unos ${usd(projected)} reservados.` };
    },
  },
  {
    id: 'deviation', label: 'Desvío del reparto', hint: 'Usa el umbral de desvío del plan',
    fn({ s, pf, week }) {
      if (pf.value < 1 || pf.loading) return null;
      const diff = pf.cryptoPct - s.cryptoTarget;
      if (Math.abs(diff) < s.deviation) return null;
      const over = diff > 0;
      return {
        key: 'deviation:' + week, tone: 'accent', icon: 'scale', title: 'Tu reparto se corrió un poco',
        body: `Hoy tenés ${pct(pf.cryptoPct)} en cripto y tu objetivo es ${pct(s.cryptoTarget, 0)}. No hace falta vender nada: alcanza con orientar las próximas compras hacia ${over ? 'ETF' : 'cripto'}.`,
      };
    },
  },
  {
    id: 'cryptoVol', label: 'Cripto muy volátil', thresholds: [['drop30', 'Caída en 30 días', '%'], ['fromMax', 'Caída desde el máximo', '%']],
    fn({ r, btc, week }) {
      if (!btc) return null;
      const d30 = btc.chg30 !== null && btc.chg30 <= -r.drop30;
      const dmax = btc.dd <= -r.fromMax;
      if (!d30 && !dmax) return null;
      const what = d30 ? `Bitcoin bajó ${pct(Math.abs(btc.chg30), 0)} en los últimos 30 días` : `Bitcoin está ${pct(Math.abs(btc.dd), 0)} debajo de su máximo del último año`;
      return { key: 'cryptoVol:' + week, tone: 'calm', icon: 'wave', title: 'El mercado cripto está movido', body: `${what}. En este activo los movimientos fuertes son habituales. Tu plan no depende de adivinar el momento: seguí con tu reparto de siempre.` };
    },
  },
  {
    id: 'behind', label: 'Atraso del reto', thresholds: [['days', 'Avisar desde', 'días']],
    fn({ s, r, prog, week }) {
      if (prog.notStarted) return null;
      const period = FREQS[s.frequency].days;
      const behindDays = prog.reserved / s.daily - period;
      if (behindDays < r.days) return null;
      const d = Math.round(prog.reserved / s.daily);
      return { key: 'behind:' + week, tone: 'calm', icon: 'clock', title: `Tenés un atraso de ${d} días`, body: `Vas ${usd(prog.reserved)} por debajo de lo previsto a hoy. Sin apuro: podés sumarlo de a poco en las próximas compras.` };
    },
  },
  {
    id: 'fee', label: 'Comisión alta', thresholds: [['pct', 'Más de', '%']],
    fn({ r }) {
      const last = sortedPurchases().pop();
      if (!last) return null;
      const f = (last.fee / last.amount) * 100;
      if (f <= r.pct) return null;
      return { key: 'fee:' + last.id, tone: 'warn', icon: 'receipt', title: 'La última comisión fue alta', body: `En tu compra de ${last.asset} del ${fmtDay(last.date)}, la comisión fue ${pct(f)} del monto. Juntar un poco más por compra suele bajar ese porcentaje.` };
    },
  },
  {
    id: 'gap', label: 'Brecha MEP/CCL alta', thresholds: [['pct', 'Desde', '%']],
    fn({ r, today }) {
      const d = getDolar();
      if (!d || !d.mep || !d.ccl) return null;
      const g = (d.ccl.v / d.mep.v - 1) * 100;
      if (g < r.pct) return null;
      return { key: 'gap:' + today, tone: 'calm', icon: 'swap', title: 'La brecha MEP–CCL está alta', body: `Hoy el CCL está ${pct(g)} por encima del MEP. Si comprás CEDEARs en pesos, su precio refleja el CCL; tenelo en cuenta al decidir con qué moneda operar.` };
    },
  },
  {
    id: 'monthly', label: 'Resumen de fin de mes', hint: 'Los últimos y primeros 3 días del mes',
    fn({ today }) {
      const d = parseISO(today);
      const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      let ref;
      if (d.getDate() > lastDay - 3) ref = today;
      else if (d.getDate() <= 3) ref = toISO(new Date(d.getFullYear(), d.getMonth() - 1, 1));
      else return null;
      const ym = ref.slice(0, 7);
      const ps = state.purchases.filter((p) => p.date.startsWith(ym));
      const m = monthOnly(ref);
      if (!ps.length) return { key: 'monthly:' + ym, tone: 'calm', icon: 'chart', title: `Resumen de ${m}`, body: `No registraste compras en ${m}. Cuando quieras, retomás.` };
      const tot = sum(ps, (p) => p.amount), fees = sum(ps, (p) => p.fee);
      return { key: 'monthly:' + ym, tone: 'accent', icon: 'chart', title: `Resumen de ${m}`, body: `Invertiste ${usd(tot)} en ${ps.length} ${ps.length === 1 ? 'compra' : 'compras'}. Comisiones: ${usd(fees)} (${pct((fees / tot) * 100)}).` };
    },
  },
];

function isoWeek(dStr) {
  const d = parseISO(dStr);
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return t.getUTCFullYear() + '-W' + Math.ceil(((t - y0) / 864e5 + 1) / 7);
}

function recommendations(pf, prog) {
  const s = state.settings;
  const today = todayStr();
  const btcS = getSeries('BTC');
  const ctx = { s, pf, prog, today, week: isoWeek(today), btc: btcS ? metrics(btcS, 'crypto') : null };
  const out = [];
  for (const rule of RULES) {
    const cfg = s.rules[rule.id];
    if (!cfg || !cfg.on) continue;
    try {
      const rec = rule.fn({ ...ctx, r: cfg });
      if (rec && !state.dismissed[rec.key]) out.push(rec);
    } catch (e) { /* una regla rota nunca rompe la pantalla */ }
  }
  return out;
}

/* --------------------------------------------------------------------------
   Componentes animados
   -------------------------------------------------------------------------- */
const prevVals = {};

/* Count-up: los números cuentan hacia su valor */
function cnt(key, value, fmt = 'usd', cls = '') {
  const from = prevVals[key];
  return `<span class="num ${cls}" data-count="${key}" data-fmt="${fmt}" data-v="${value}">${FMT[fmt](isNum(from) ? from : 0)}</span>`;
}
const money = (key, value, fmt = 'usd') => `<span class="cur">US$</span>${cnt(key, value, fmt)}`;

function runCounts(root) {
  $$('[data-count]', root).forEach((el) => {
    const key = el.dataset.count, to = +el.dataset.v, f = FMT[el.dataset.fmt];
    const from = prevVals[key];
    if (reduced() || !isNum(from) || Math.abs(from - to) < 1e-9) {
      if (!isNum(from) && !reduced()) { prevVals[key] = 0; return runOne(el, key, 0, to, f); }
      el.textContent = f(to); prevVals[key] = to; return;
    }
    runOne(el, key, from, to, f);
  });
}
function runOne(el, key, from, to, f) {
  const dur = 950, t0 = performance.now();
  const step = (now) => {
    if (!el.isConnected) return;
    const k = Math.min(1, (now - t0) / dur);
    const e = 1 - Math.pow(1 - k, 4);
    const v = k < 1 ? from + (to - from) * e : to;
    prevVals[key] = v;
    el.textContent = f(v);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* Anillo de progreso */
const RING_R = 88, RING_C = 2 * Math.PI * RING_R;
function ringSVG(key, p) {
  const prev = isNum(prevVals['ring:' + key]) ? prevVals['ring:' + key] : 0;
  const ticks = [0.25, 0.5, 0.75].map((t) => {
    const a = t * 2 * Math.PI;
    return `<circle cx="${(100 + RING_R * Math.cos(a)).toFixed(2)}" cy="${(100 + RING_R * Math.sin(a)).toFixed(2)}" r="1.6" style="fill:var(--surface)"/>`;
  }).join('');
  return `<svg class="ring" viewBox="0 0 200 200" aria-hidden="true">
    <circle class="ring__track" cx="100" cy="100" r="${RING_R}" fill="none" stroke-width="11"/>
    <circle class="ring__bar" cx="100" cy="100" r="${RING_R}" fill="none" stroke-width="11"
      stroke-dasharray="${RING_C.toFixed(2)}" style="stroke-dashoffset:${(RING_C * (1 - Math.min(1, prev))).toFixed(2)};opacity:${prev > 0 ? 1 : 0}"
      data-ring="${key}" data-v="${p}"/>${ticks}</svg>`;
}
function runRings(root) {
  $$('[data-ring]', root).forEach((el) => {
    const key = 'ring:' + el.dataset.ring, to = +el.dataset.v;
    prevVals[key] = to;
    raf2(() => {
      el.style.opacity = to > 0.001 ? 1 : 0;
      el.style.strokeDashoffset = (RING_C * (1 - Math.min(1, to))).toFixed(2);
    });
  });
  $$('.progress-line > i[data-scale]', root).forEach((el) => raf2(() => { el.style.transform = `scaleX(${el.dataset.scale})`; }));
  $$('[data-alloc]', root).forEach((el) => raf2(() => { el.style.transform = `scaleX(${el.dataset.alloc})`; }));
}

/* Gráfico de línea con trazado animado y cursor que sigue el dedo */
let chartSeq = 0;
function drawChart(host, { a, b, tip, animate }) {
  const w = host.clientWidth, h = host.clientHeight;
  if (!w || !h || !a.length) return;
  const n = a.length;
  const all = b ? a.concat(b) : a;
  let min = Math.min(...all), max = Math.max(...all);
  if (max - min < 1e-9) { max += Math.abs(max) * 0.05 || 1; min -= Math.abs(min) * 0.05 || 1; }
  const span = max - min;
  min -= span * 0.08; max += span * 0.06;
  const padT = 14, padB = 6;
  const X = (i) => (n === 1 ? w / 2 : (i / (n - 1)) * w);
  const Y = (v) => padT + (1 - (v - min) / (max - min)) * (h - padT - padB);
  const line = (arr) => arr.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(v).toFixed(1)).join('');
  const id = 'cg' + ++chartSeq;
  const area = line(a) + `L${X(n - 1).toFixed(1)},${h}L${X(0).toFixed(1)},${h}Z`;
  const grid = [0.25, 0.5, 0.75].map((t) => `<line class="chart__grid" x1="0" x2="${w}" y1="${(padT + t * (h - padT - padB)).toFixed(1)}" y2="${(padT + t * (h - padT - padB)).toFixed(1)}"/>`).join('');
  const doAnim = animate && !reduced();
  host.classList.toggle('is-drawn', !doAnim);
  host.innerHTML = `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" style="stop-color:var(--accent);stop-opacity:.18"/><stop offset="1" style="stop-color:var(--accent);stop-opacity:0"/>
    </linearGradient></defs>
    ${grid}
    <path class="chart__area" d="${area}" style="fill:url(#${id})"/>
    ${b ? `<path class="chart__line chart__line--2" d="${line(b)}"/>` : ''}
    <path class="chart__line chart__draw" pathLength="1" d="${line(a)}"/>
    <g class="chart__cursor"><line x1="0" x2="0" y1="0" y2="${h}"/>${b ? '<circle class="chart__dot chart__dot--2" r="3.5" cx="0"/>' : ''}<circle class="chart__dot chart__dot--1" r="4.5" cx="0"/></g>
  </svg><div class="chart__tip"></div>`;
  if (doAnim) raf2(() => host.classList.add('is-drawn'));

  const g = $('.chart__cursor', host), d1 = $('.chart__dot--1', host), d2 = $('.chart__dot--2', host), tipEl = $('.chart__tip', host);
  let lastI = -1;
  const show = (clientX) => {
    const r = host.getBoundingClientRect();
    const x = clamp(clientX - r.left, 0, w);
    const i = n === 1 ? 0 : Math.round((x / w) * (n - 1));
    host.classList.add('is-scrub');
    if (i === lastI) return;
    lastI = i;
    const xi = X(i);
    g.setAttribute('transform', `translate(${xi.toFixed(1)},0)`);
    d1.setAttribute('cy', Y(a[i]).toFixed(1));
    if (d2) d2.setAttribute('cy', Y(b[i]).toFixed(1));
    tipEl.innerHTML = tip(i);
    const tw = tipEl.offsetWidth;
    tipEl.style.transform = `translate3d(${clamp(xi - tw / 2, 6, w - tw - 6).toFixed(1)}px,-100%,0)`;
  };
  const hide = () => { host.classList.remove('is-scrub'); lastI = -1; };
  host.onpointerdown = (e) => show(e.clientX);
  host.onpointermove = (e) => { if (e.pointerType === 'mouse' || e.buttons || host.classList.contains('is-scrub')) show(e.clientX); };
  host.onpointerleave = hide;
  host.onpointercancel = hide;
  host.onpointerup = (e) => { if (e.pointerType !== 'mouse') setTimeout(hide, 900); };
}

function sparkSVG(series, i) {
  const pts = series.slice(-90).map((x) => x.p);
  if (pts.length < 2) return '';
  const w = 88, h = 34;
  const min = Math.min(...pts), max = Math.max(...pts), sp = max - min || 1;
  const d = pts.map((v, k) => (k ? 'L' : 'M') + ((k / (pts.length - 1)) * w).toFixed(1) + ',' + (3 + (1 - (v - min) / sp) * (h - 6)).toFixed(1)).join('');
  return `<svg class="spark ${pts[pts.length - 1] < pts[0] ? 'is-down' : ''}" viewBox="0 0 ${w} ${h}" style="--i:${i}" aria-hidden="true"><path pathLength="1" d="${d}"/></svg>`;
}

/* FLIP: anima reacomodos de listas usando solo transform */
function flip(root, mutate) {
  const pos = (el) => {
    const anc = el.parentElement && el.parentElement.closest('[data-key]');
    return el.getBoundingClientRect().top - (anc && root.contains(anc) ? anc.getBoundingClientRect().top : 0);
  };
  const before = new Map();
  $$('[data-key]', root).forEach((el) => before.set(el.dataset.key, pos(el)));
  mutate();
  if (reduced()) return;
  $$('[data-key]', root).forEach((el) => {
    const b = before.get(el.dataset.key);
    if (b === undefined) {
      el.animate([{ opacity: 0, transform: 'translateY(-6px) scale(0.98)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.22,1,.36,1)' });
      return;
    }
    const dy = b - pos(el);
    if (Math.abs(dy) > 0.5) el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 460, easing: 'cubic-bezier(.22,1,.36,1)' });
  });
}
function fadeOut(el, cb) {
  if (reduced()) return cb();
  el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.96)' }], { duration: 180, easing: 'ease-in', fill: 'forwards' }).onfinish = cb;
}

/* Deslizar: "reveal" (borrar) o "dismiss" (descartar) */
let openSwipe = null;
function makeSwipe(content, opts) {
  let sx = 0, sy = 0, dx = 0, lock = null, pid = null, base = 0, t0 = 0, w = 0;
  const set = (x, anim) => {
    content.classList.toggle('is-settling', !!anim);
    content.style.transform = x ? `translate3d(${x.toFixed(1)}px,0,0)` : '';
  };
  const api = {
    content,
    close() { content._open = false; set(0, true); if (openSwipe === api) openSwipe = null; },
  };
  content.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (openSwipe && openSwipe !== api) openSwipe.close();
    sx = e.clientX; sy = e.clientY; dx = 0; lock = null; pid = e.pointerId;
    base = content._open ? -opts.reveal : 0; t0 = performance.now(); w = content.offsetWidth;
    content.classList.remove('is-settling');
    content.style.transition = '';
  });
  content.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pid) return;
    const mx = e.clientX - sx, my = e.clientY - sy;
    if (!lock) {
      if (Math.abs(mx) > 8 && Math.abs(mx) > Math.abs(my) * 1.2) {
        lock = 'x';
        try { content.setPointerCapture(pid); } catch (err) { /* nada */ }
      } else if (Math.abs(my) > 8) { lock = 'y'; pid = null; return; } else return;
    }
    dx = mx;
    let x = base + dx;
    if (opts.mode === 'reveal') {
      if (x > 0) x *= 0.2;
      if (x < -opts.reveal) x = -opts.reveal + (x + opts.reveal) * 0.3;
    }
    set(x);
    if (e.cancelable) e.preventDefault();
  });
  const end = (e) => {
    if (e.pointerId !== pid) return;
    pid = null;
    if (lock !== 'x') return;
    content._swiped = true;
    setTimeout(() => { content._swiped = false; }, 60);
    const v = dx / Math.max(1, performance.now() - t0);
    if (opts.mode === 'reveal') {
      const x = base + dx;
      if (x < -opts.reveal / 2 || v < -0.5) { content._open = true; set(-opts.reveal, true); openSwipe = api; }
      else api.close();
    } else if (Math.abs(dx) > w * 0.32 || Math.abs(v) > 0.6) {
      const dir = Math.sign(dx) || 1;
      content.style.transition = reduced() ? 'opacity 150ms linear' : 'transform 280ms cubic-bezier(.22,1,.36,1), opacity 280ms ease';
      content.style.transform = reduced() ? '' : `translate3d(${dir * (w + 40)}px,0,0)`;
      content.style.opacity = '0';
      setTimeout(opts.onDismiss, 260);
    } else set(0, true);
  };
  content.addEventListener('pointerup', end);
  content.addEventListener('pointercancel', end);
  content.addEventListener('click', (e) => {
    if (content._swiped) { e.stopPropagation(); e.preventDefault(); return; }
    if (content._open) { e.stopPropagation(); api.close(); }
  }, true);
  return api;
}
document.addEventListener('pointerdown', (e) => {
  if (openSwipe && !openSwipe.content.parentElement.contains(e.target)) openSwipe.close();
}, true);

/* Toasts */
function toast(msg, opts = {}) {
  const host = $('#toasts');
  host.innerHTML = '';
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.innerHTML = `<span>${esc(msg)}</span>${opts.action ? `<button class="press" type="button">${esc(opts.action)}</button>` : ''}`;
  host.append(el);
  let done = false;
  const close = () => { if (done) return; done = true; el.classList.add('is-out'); setTimeout(() => el.remove(), 240); };
  if (opts.action) $('button', el).onclick = () => { opts.onAction(); close(); };
  setTimeout(close, opts.duration || (opts.action ? 5000 : 2600));
}

/* Hoja de confirmación */
function confirmSheet({ title, body, confirm, danger }) {
  return new Promise((resolve) => {
    const scrim = document.createElement('div');
    scrim.className = 'sheet-scrim';
    const sheet = document.createElement('div');
    sheet.className = 'sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.innerHTML = `<h3>${esc(title)}</h3><p>${esc(body)}</p><div class="sheet__actions">
      <button class="btn btn--block ${danger ? 'btn--danger' : 'btn--primary'}" data-ok type="button">${esc(confirm)}</button>
      <button class="btn btn--block btn--ghost" data-no type="button">Cancelar</button></div>`;
    document.body.append(scrim, sheet);
    const close = (val) => {
      scrim.classList.add('is-out'); sheet.classList.add('is-out');
      setTimeout(() => { scrim.remove(); sheet.remove(); }, 230);
      document.removeEventListener('keydown', onKey);
      resolve(val);
    };
    const onKey = (e) => { if (e.key === 'Escape') close(false); };
    document.addEventListener('keydown', onKey);
    scrim.onclick = () => close(false);
    $('[data-no]', sheet).onclick = () => close(false);
    $('[data-ok]', sheet).onclick = () => close(true);
    $('[data-ok]', sheet).focus({ preventScroll: true });
  });
}

/* Tilde que se dibuja */
function doneMark(text) {
  const el = document.createElement('div');
  el.className = 'done';
  el.innerHTML = `<div class="done__card"><svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="28" pathLength="1"/><path d="M20 33l8 8 16-17" pathLength="1"/></svg><span>${esc(text)}</span></div>`;
  document.body.append(el);
  setTimeout(() => { el.classList.add('is-out'); setTimeout(() => el.remove(), 280); }, 1150);
}

/* Celebración de hito: partículas chicas */
function celebrate(anchor) {
  if (reduced() || !anchor) return;
  const r = anchor.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2, R = r.width / 2;
  const N = 26;
  for (let i = 0; i < N; i++) {
    const p = document.createElement('i');
    p.className = 'particle';
    const ang = (i / N) * Math.PI * 2 + Math.random() * 0.25;
    const size = 3 + Math.random() * 4;
    const d0 = R * 0.92, d1 = R + 18 + Math.random() * 46;
    p.style.cssText = `left:${cx - size / 2}px;top:${cy - size / 2}px;width:${size}px;height:${size}px;${i % 3 === 0 ? 'background:var(--text-3);' : ''}`;
    document.body.append(p);
    p.animate([
      { transform: `translate(${Math.cos(ang) * d0}px,${Math.sin(ang) * d0}px) scale(.4)`, opacity: 0 },
      { transform: `translate(${Math.cos(ang) * (d0 + 8)}px,${Math.sin(ang) * (d0 + 8)}px) scale(1)`, opacity: 1, offset: 0.15 },
      { transform: `translate(${Math.cos(ang) * d1}px,${Math.sin(ang) * d1 + 14}px) scale(0)`, opacity: 0 },
    ], { duration: 1000 + Math.random() * 500, easing: 'cubic-bezier(.22,1,.36,1)', delay: Math.random() * 80 }).onfinish = () => p.remove();
  }
}

/* Indicador "actualizado hace X min" */
function freshState() {
  const ms = SOURCES.map((k) => market[k]);
  const loading = ms.some((m) => m.status === 'loading');
  const ts = ms.filter((m) => m.t).map((m) => m.t);
  const stale = ms.some((m) => m.status === 'stale' || m.status === 'error');
  return { loading, stale, t: ts.length ? Math.max(...ts) : null };
}
function freshHTML() { return '<span class="fresh" data-fresh aria-live="polite"></span>'; }
function updateFresh() {
  const f = freshState();
  let text, cls = '';
  if (f.loading && !f.t) { text = 'Actualizando…'; cls = 'is-loading'; }
  else if (!f.t) { text = state.demo ? 'Datos de prueba' : 'Sin datos de mercado'; cls = 'is-stale'; }
  else if (f.loading) { text = 'Actualizando…'; cls = 'is-loading'; }
  else if (f.stale) { text = `Datos viejos · ${ago(f.t)}`; cls = 'is-stale'; }
  else text = `Actualizado ${ago(f.t)}`;
  $$('[data-fresh]').forEach((el) => { el.className = 'fresh ' + cls; el.innerHTML = `<i></i>${text}`; });
  $$('[data-refresh]').forEach((el) => el.classList.toggle('is-spinning', f.loading));
}

/* Control segmentado con indicador deslizante */
function segHTML(name, options, value) {
  const idx = Math.max(0, options.findIndex((o) => o.v === value));
  return `<div class="seg" data-seg="${name}" role="group">
    <span class="seg__ind" style="width:calc((100% - 6px) / ${options.length});transform:translateX(${idx * 100}%)"></span>
    ${options.map((o) => `<button type="button" data-v="${o.v}" aria-pressed="${o.v === value}">${o.label}${o.sub ? `<small>${o.sub}</small>` : ''}</button>`).join('')}
  </div>`;
}
function bindSeg(el, onChange) {
  const btns = $$('button', el), ind = $('.seg__ind', el);
  btns.forEach((b, i) => b.addEventListener('click', () => {
    btns.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    ind.style.transform = `translateX(${i * 100}%)`;
    onChange(b.dataset.v);
  }));
}

const disclaimer = () => `<p class="disclaimer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.5"/></svg>Información basada en tu plan, no es asesoramiento financiero.</p>`;
const plCls = (v) => (v > 0.004 ? 'pos' : v < -0.004 ? 'neg' : 'muted');

/* --------------------------------------------------------------------------
   Pantalla: Hoy
   -------------------------------------------------------------------------- */
let pendingCelebration = null;

function evolution() {
  const ps = sortedPurchases();
  if (!ps.length) return null;
  const start = ps[0].date, end = todayStr();
  const n = Math.max(1, daysBetween(start, end) + 1);
  const step = Math.ceil(n / 300);
  const qty = {}; ASSET_KEYS.forEach((a) => { qty[a] = 0; });
  const series = {}; ASSET_KEYS.forEach((a) => { series[a] = getSeries(a); });
  let inv = 0, j = 0;
  const dates = [], invested = [], value = [];
  for (let i = 0; i < n; i++) {
    const d = addDays(start, i);
    while (j < ps.length && ps[j].date <= d) { qty[ps[j].asset] += qtyOf(ps[j]); inv += ps[j].amount; j++; }
    if (i % step !== 0 && i !== n - 1) continue;
    let v = 0;
    for (const a of ASSET_KEYS) if (qty[a] > 0) v += qty[a] * priceAt(a, d, series[a]);
    dates.push(d); invested.push(inv); value.push(v);
  }
  if (dates.length === 1) { dates.unshift(addDays(dates[0], -1)); invested.unshift(0); value.unshift(0); }
  return { dates, invested, value };
}

const HOY = {
  html() {
    const s = state.settings;
    const prog = progress();
    const pf = portfolio();
    const recs = recommendations(pf, prog);
    const has = state.purchases.length > 0;
    const pctNum = prog.pct * 100;
    const caption = prog.notStarted ? `Empieza el ${fmtDay(s.startDate)}` : prog.ended ? 'Reto completado' : `Día ${prog.day} de 365`;
    const resDays = prog.reserved / s.daily;
    const valSk = has && pf.loading;

    return `
    <header class="vh">
      <div><div class="vh__eyebrow">${esc(fmtDayFull(todayStr()))}</div><h1 class="vh__title">Hoy</h1></div>
      ${freshHTML()}
    </header>

    <section class="card hero" id="hero">
      <div class="hero__ring" id="ring">
        ${ringSVG('hoy', prog.pct)}
        <div class="ring__center">
          <div class="ring__pct">${cnt('hoy.pct', pctNum, pctNum < 10 && pctNum > 0 ? 'pct1' : 'pct0')}<small>%</small></div>
          <div class="ring__caption">${caption}</div>
        </div>
      </div>
      <div class="hero__row">
        <div><div class="label">Invertido</div><div class="small-num">${money('hoy.inv', prog.invested)}</div></div>
        <div><div class="label">Meta del año</div><div class="small-num faint"><span class="cur">US$</span>${FMT.usd0(prog.goal)}</div></div>
      </div>
      <div class="progress-line" aria-hidden="true"><i data-scale="${Math.min(1, prog.pct).toFixed(4)}" style="transform:scaleX(${Math.min(1, prevVals['ring:hoy'] || 0)})"></i><b style="left:${((prog.day / 365) * 100).toFixed(2)}%"></b></div>
      <div class="label" style="margin-top:8px;display:flex;justify-content:space-between"><span>Avance real</span><span>Marca: lo previsto a hoy</span></div>
    </section>

    <div class="stats">
      <section class="card stat span-2">
        <div class="label">Valor actual${pf.fallback && !valSk ? ' <span class="tag-stale">precio de compra</span>' : ''}</div>
        ${valSk ? '<span class="sk sk-num" style="height:44px;width:62%"></span>' : `<div class="big reveal">${money('hoy.val', pf.value)}</div>`}
        <div class="stat__sub muted">${has ? `${pf.fees > 0 ? `Pagaste ${usd(pf.fees)} en comisiones` : 'Sin comisiones registradas'}` : 'Cuando registres compras, acá vas a ver cuánto valen.'}</div>
      </section>
      <section class="card stat">
        <div class="label">Ganancia / pérdida</div>
        ${valSk ? '<span class="sk sk-num"></span>' : `<div class="mid reveal ${plCls(pf.pl)}"><span class="cur">US$</span>${cnt('hoy.pl', pf.pl, 'susd')}</div>
        <div class="stat__sub ${plCls(pf.pl)}">${cnt('hoy.plpct', pf.plPct, 'spct1')}</div>`}
      </section>
      <section class="card stat">
        <div class="label">Reservado</div>
        <div class="mid">${money('hoy.res', prog.reserved)}</div>
        <div class="stat__sub muted">${prog.reserved < 0.01 ? 'Sin invertir · al día' : `Sin invertir · ${nf(0, 1).format(resDays)} ${Math.round(resDays) === 1 ? 'día' : 'días'}`}</div>
      </section>
    </div>

    <section class="card">
      <div class="card__head">
        <h2 class="card__title">Evolución</h2>
        ${has ? '<div class="legend"><span><i></i>Valor</span><span><i class="l2"></i>Invertido</span></div>' : ''}
      </div>
      ${has ? (valSk ? '<div class="chart"><span class="sk sk-block"></span></div>' : '<div class="chart" id="hoy-chart"></div><div class="chart__axis" id="hoy-axis"></div>') : `
        <div class="empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 17l5-5.5 4 3.5 7.5-8.5"/></svg>
          <h3>Todavía no hay compras</h3>
          <p>Registrá tu primera compra o cargá datos de prueba para ver cómo se ve todo.</p>
          <div class="footer-actions">
            <button class="btn btn--primary press" data-go="compras" type="button">Registrar una compra</button>
            <button class="btn press" data-demo type="button">Cargar datos de prueba</button>
          </div>
        </div>`}
    </section>

    <h2 class="section-label">Para vos, hoy</h2>
    <div class="recs" id="recs">
      ${recs.length ? recs.map(recHTML).join('') : quietRec()}
    </div>
    ${recs.length ? '<p class="swipe-hint"><span class="hint-touch">Deslizá una tarjeta para descartarla</span><span class="hint-mouse">Pasá el mouse sobre una tarjeta para descartarla</span></p>' : ''}
    ${disclaimer()}`;
  },

  mount(el, { enter }) {
    const host = $('#hoy-chart', el);
    if (host) {
      const ev = evolution();
      if (ev) {
        drawChart(host, {
          a: ev.value, b: ev.invested, animate: enter || !HOY.drawn,
          tip: (i) => `<b>${usd(ev.value[i])}</b> <span>valor</span><br>${usd(ev.invested[i])} <span>invertido · ${fmtDay(ev.dates[i])}</span>`,
        });
        HOY.drawn = true;
        const mid = ev.dates[Math.floor(ev.dates.length / 2)];
        $('#hoy-axis', el).innerHTML = `<span>${fmtDay(ev.dates[0])}</span><span>${fmtDay(mid)}</span><span>Hoy</span>`;
      }
    }
    $$('.rec[data-rec]', el).forEach((card) => {
      const dismiss = () => {
        state.dismissed[card.dataset.rec] = true; save();
        const recs = $('#recs', el);
        flip(el, () => {
          card.remove();
          if (!$('.rec', recs)) { recs.innerHTML = quietRec(); const h = $('.swipe-hint', el); if (h) h.remove(); }
        });
      };
      makeSwipe(card, { mode: 'dismiss', onDismiss: dismiss });
      const x = $('.rec__x', card);
      if (x) x.addEventListener('click', (e) => { e.stopPropagation(); fadeOut(card, dismiss); });
    });
    // Hitos: celebración una sola vez
    const prog = progress();
    const reached = MILESTONES.filter((m) => prog.pct * 100 >= m && !state.milestones.includes(m));
    if (reached.length) {
      state.milestones.push(...reached); save();
      const m = reached[reached.length - 1];
      clearTimeout(pendingCelebration);
      pendingCelebration = setTimeout(() => {
        const hero = $('#hero');
        if (!hero || current !== 'hoy') return;
        hero.classList.remove('is-pulse'); void hero.offsetWidth; hero.classList.add('is-pulse');
        celebrate($('#ring'));
        toast(`¡Llegaste al ${m} % del reto!`);
      }, reduced() ? 100 : 1150);
    }
  },
};

function recHTML(r) {
  return `<article class="card rec rec--${r.tone}" data-rec="${esc(r.key)}" data-key="rec-${esc(r.key)}">
    <button class="rec__x" type="button" aria-label="Descartar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M7 7l10 10M17 7 7 17"/></svg></button>
    <div class="rec__top">${icon(r.icon)}<h3 class="rec__title">${esc(r.title)}</h3></div>
    <p class="rec__body">${esc(r.body)}</p>
    ${r.split ? `<div class="rec__split">${r.split.map((x) => `<span class="chip ${x.v < 0.005 ? 'chip--neutral' : ''}"><small>${x.label} · ${x.sub}</small>${usd(x.v)}</span>`).join('')}</div>` : ''}
  </article>`;
}
const quietRec = () => `<div class="card card--quiet rec rec--calm" data-key="rec-quiet"><div class="rec__top">${icon('check')}<h3 class="rec__title">Todo en orden</h3></div><p class="rec__body">No hay nada para revisar hoy. Seguí con tu plan.</p></div>`;

/* --------------------------------------------------------------------------
   Pantalla: Compras
   -------------------------------------------------------------------------- */
const draft = { date: todayStr(), asset: 'SPY', amount: '', price: '', fee: '' };

const COMPRAS = {
  html() {
    const opts = ASSET_KEYS.map((a) => ({ v: a, label: a, sub: ASSETS[a].name.replace('Nasdaq 100', 'Nasdaq') }));
    if (draft.date > todayStr()) draft.date = todayStr();
    return `
    <header class="vh">
      <div><div class="vh__eyebrow">Registrá cada compra</div><h1 class="vh__title">Compras</h1></div>
    </header>

    <form class="card form" id="buy-form" novalidate autocomplete="off">
      <div class="field"><span class="field__label">Activo</span>${segHTML('asset', opts, draft.asset)}</div>

      <div class="field" data-f="amount">
        <label class="field__label" for="f-amount"><span>Monto total <span class="faint">· comisión incluida</span></span></label>
        <div class="input-wrap"><span class="prefix">US$</span><input class="input" id="f-amount" name="amount" inputmode="decimal" enterkeyhint="next" placeholder="0,00" value="${esc(draft.amount)}"></div>
        <div class="field__err"></div>
      </div>

      <div class="field" data-f="price">
        <div class="field__label"><label for="f-price">Precio unitario</label><button type="button" class="btn btn--ghost btn--small press" id="use-price"></button></div>
        <div class="input-wrap"><span class="prefix">US$</span><input class="input" id="f-price" name="price" inputmode="decimal" enterkeyhint="next" placeholder="0,00" value="${esc(draft.price)}"></div>
        <div class="field__err"></div>
      </div>

      <div class="row-2">
        <div class="field" data-f="fee">
          <label class="field__label" for="f-fee">Comisión</label>
          <div class="input-wrap"><span class="prefix">US$</span><input class="input" id="f-fee" name="fee" inputmode="decimal" enterkeyhint="done" placeholder="0,00" value="${esc(draft.fee)}"></div>
          <div class="field__err"></div>
        </div>
        <div class="field" data-f="date">
          <label class="field__label" for="f-date">Fecha</label>
          <div class="input-wrap"><input class="input" id="f-date" name="date" type="date" max="${todayStr()}" value="${draft.date}"></div>
          <div class="field__err"></div>
        </div>
      </div>

      <div class="estimate" id="estimate"></div>
      <button class="btn btn--primary btn--block press" type="submit">Guardar compra</button>
    </form>

    <div id="history"></div>`;
  },

  mount(el) {
    const form = $('#buy-form', el);
    bindSeg($('[data-seg="asset"]', el), (v) => { draft.asset = v; updateEstimate(); updatePriceBtn(); });
    ['amount', 'price', 'fee', 'date'].forEach((k) => {
      const input = form.elements[k];
      input.addEventListener('input', () => {
        draft[k] = input.value;
        $(`[data-f="${k}"]`, form).classList.remove('is-error');
        $(`[data-f="${k}"] .field__err`, form).textContent = '';
        updateEstimate();
        if (k === 'date') updatePriceBtn();
      });
    });
    $('#use-price', el).addEventListener('click', () => {
      const p = priceForDraft();
      if (!p) return;
      draft.price = numToInput(+p.toFixed(p >= 100 ? 2 : 4));
      const inp = form.elements.price;
      inp.value = draft.price;
      inp.parentElement.animate?.([{ transform: 'scale(1)' }, { transform: 'scale(1.015)' }, { transform: 'scale(1)' }], { duration: 320, easing: 'cubic-bezier(.34,1.56,.64,1)' });
      $('[data-f="price"]', form).classList.remove('is-error');
      $('[data-f="price"] .field__err', form).textContent = '';
      updateEstimate();
    });
    form.addEventListener('submit', (e) => { e.preventDefault(); submitPurchase(form); });
    updateEstimate();
    updatePriceBtn();
    renderHistory(false);
  },
};

function priceForDraft() {
  const s = getSeries(draft.asset);
  if (!s) return null;
  const d = isISO(draft.date) ? draft.date : todayStr();
  return d >= todayStr() ? s[s.length - 1].p : priceAt(draft.asset, d, s);
}
function updatePriceBtn() {
  const b = $('#use-price');
  if (!b) return;
  const p = priceForDraft();
  const past = isISO(draft.date) && draft.date < todayStr();
  if (p) { b.disabled = false; b.textContent = `${past ? 'Precio de ese día' : 'Usar precio actual'} · ${fmtPrice(p)}`; }
  else if (isLoadingAsset(draft.asset)) { b.disabled = true; b.textContent = 'Cargando precio…'; }
  else { b.disabled = true; b.textContent = 'Precio no disponible'; }
}
function updateEstimate() {
  const box = $('#estimate');
  if (!box) return;
  const amount = parseNum(draft.amount), price = parseNum(draft.price);
  const fee = draft.fee === '' ? 0 : parseNum(draft.fee);
  const ok = amount > 0 && price > 0 && fee >= 0 && fee < amount;
  const qty = ok ? (amount - fee) / price : 0;
  const feePct = amount > 0 && fee >= 0 ? (fee / amount) * 100 : null;
  const high = feePct !== null && feePct > state.settings.rules.fee.pct;
  box.classList.toggle('is-empty', !ok);
  box.innerHTML = `
    <div><div class="label">Cantidad estimada</div>
      <div class="estimate__qty">${ok ? fmtQty(qty, draft.asset) : '0'}<small>${draft.asset}</small></div></div>
    <div style="text-align:right"><div class="label">Comisión</div>
      <div class="small-num ${high ? 'neg' : 'muted'}" style="font-size:15px">${feePct !== null && isNum(feePct) ? pct(feePct) : '—'}</div></div>`;
}

function setErr(form, k, msg) {
  const f = $(`[data-f="${k}"]`, form);
  f.classList.add('is-error');
  $('.field__err', f).textContent = msg;
  const wrap = $('.input-wrap', f);
  wrap.classList.remove('is-shake'); void wrap.offsetWidth; wrap.classList.add('is-shake');
}
function submitPurchase(form) {
  const amount = parseNum(draft.amount), price = parseNum(draft.price);
  const fee = draft.fee.trim() === '' ? 0 : parseNum(draft.fee);
  let bad = false;
  if (!isISO(draft.date)) { setErr(form, 'date', 'Elegí una fecha válida'); bad = true; }
  else if (draft.date > todayStr()) { setErr(form, 'date', 'No puede ser una fecha futura'); bad = true; }
  else if (draft.date < '2000-01-01') { setErr(form, 'date', 'Revisá la fecha'); bad = true; }
  if (!(amount > 0)) { setErr(form, 'amount', 'Ingresá un monto mayor a 0'); bad = true; }
  else if (amount > 1e6) { setErr(form, 'amount', 'El monto parece demasiado alto'); bad = true; }
  if (!(price > 0)) { setErr(form, 'price', 'Ingresá un precio mayor a 0'); bad = true; }
  if (!isNum(fee) || fee < 0) { setErr(form, 'fee', 'Revisá la comisión'); bad = true; }
  else if (amount > 0 && fee >= amount) { setErr(form, 'fee', 'Tiene que ser menor al monto'); bad = true; }
  if (bad) { navigator.vibrate?.(30); return; }

  const p = { id: uid(), date: draft.date, asset: draft.asset, amount: +amount.toFixed(2), price, fee: +fee.toFixed(2) };
  state.purchases.push(p);
  save();
  document.activeElement?.blur?.();
  doneMark('Compra guardada');
  draft.amount = ''; draft.price = ''; draft.fee = '';
  form.elements.amount.value = ''; form.elements.price.value = ''; form.elements.fee.value = '';
  updateEstimate();
  renderHistory(true);
}

function renderHistory(animate) {
  const host = $('#history');
  if (!host) return;
  const doRender = () => {
    const ps = state.purchases.slice().sort((a, b) => (a.date > b.date ? -1 : a.date < b.date ? 1 : 0));
    if (!ps.length) {
      host.innerHTML = `<h2 class="section-label" data-key="hist-label">Historial</h2>
        <div class="card card--quiet empty" data-key="hist-empty"><h3>Sin compras todavía</h3><p>Lo que registres arriba aparece acá, ordenado por mes.</p></div>`;
      return;
    }
    const groups = new Map();
    ps.forEach((p) => { const k = p.date.slice(0, 7); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); });
    host.innerHTML = `<h2 class="section-label" data-key="hist-label" style="display:flex;justify-content:space-between"><span>Historial</span><span class="num" style="text-transform:none;letter-spacing:0;font-weight:500">${ps.length} ${ps.length === 1 ? 'compra' : 'compras'} · ${usd(sum(ps, (p) => p.amount))}</span></h2>
      ${Array.from(groups, ([k, items]) => `
        <div class="history-group" data-key="g-${k}">
          <h3><span class="cap">${esc(fmtMonth(k + '-01'))}</span><span>${usd(sum(items, (p) => p.amount))}</span></h3>
          <div class="list">
            ${items.map((p) => `
              <div class="swipe" data-key="p-${p.id}">
                <div class="swipe__actions"><button class="swipe__del" type="button" data-del="${p.id}" aria-label="Borrar compra">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4.5 7h15M10 11v6M14 11v6M6.5 7l1 12.5a1.5 1.5 0 0 0 1.5 1.5h6a1.5 1.5 0 0 0 1.5-1.5l1-12.5M9.5 7V4.5h5V7"/></svg>Borrar</button></div>
                <div class="swipe__content">
                  <div class="tx">
                    <span class="badge ${ASSETS[p.asset].kind === 'crypto' ? 'badge--crypto' : ''}">${p.asset}</span>
                    <div class="tx__body"><div class="tx__title">${p.asset} <span class="faint" style="font-weight:400">· ${fmtQty(qtyOf(p), p.asset)}</span></div>
                      <div class="tx__sub">${fmtDay(p.date)} · a ${fmtPrice(p.price)}</div></div>
                    <div class="tx__right"><div class="tx__amt">${usd(p.amount)}</div><div class="tx__fee">${p.fee > 0 ? `com. ${pct((p.fee / p.amount) * 100)}` : 'sin comisión'}</div></div>
                    <button class="tx__del" type="button" data-del="${p.id}" aria-label="Borrar compra de ${p.asset}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4.5 7h15M10 11v6M14 11v6M6.5 7l1 12.5a1.5 1.5 0 0 0 1.5 1.5h6a1.5 1.5 0 0 0 1.5-1.5l1-12.5M9.5 7V4.5h5V7"/></svg></button>
                  </div>
                </div>
              </div>`).join('')}
          </div>
        </div>`).join('')}
      <p class="swipe-hint" data-key="hist-hint"><span class="hint-touch">Deslizá una compra a la izquierda para borrarla</span><span class="hint-mouse">Pasá el mouse sobre una compra para borrarla</span></p>`;
    $$('.swipe__content', host).forEach((c) => makeSwipe(c, { mode: 'reveal', reveal: 92 }));
    $$('[data-del]', host).forEach((b) => b.addEventListener('click', () => deletePurchase(b.dataset.del)));
  };
  if (animate) flip($('#view-compras'), doRender); else doRender();
}

function deletePurchase(id) {
  const idx = state.purchases.findIndex((p) => p.id === id);
  if (idx < 0) return;
  const [removed] = state.purchases.splice(idx, 1);
  save();
  openSwipe = null;
  const row = $(`[data-key="p-${id}"]`);
  const finish = () => renderHistory(true);
  if (row) fadeOut(row, finish); else finish();
  toast(`Compra de ${removed.asset} borrada`, {
    action: 'Deshacer',
    onAction() { state.purchases.push(removed); save(); if (current === 'compras') renderHistory(true); else rerender(); },
  });
}

/* --------------------------------------------------------------------------
   Pantalla: Cartera
   -------------------------------------------------------------------------- */
const CARTERA = {
  html() {
    const s = state.settings;
    const pf = portfolio();
    const prog = progress();
    const has = state.purchases.length > 0;
    const etfPct = pf.value > 0 ? 100 - pf.cryptoPct : 0;
    const diff = pf.cryptoPct - s.cryptoTarget;
    const within = Math.abs(diff) < s.deviation;
    const remaining = Math.max(0, prog.goal - prog.invested);
    const scen = [-30, 0, 10, 30].map((x) => {
      const final = (pf.value + remaining) * (1 + x / 100);
      const res = final - prog.goal - (prog.invested > prog.goal ? prog.invested - prog.goal : 0);
      return { x, final, res };
    });
    const sk = has && pf.loading;

    return `
    <header class="vh">
      <div><div class="vh__eyebrow">Tu reparto</div><h1 class="vh__title">Cartera</h1></div>
      ${freshHTML()}
    </header>

    <div class="grp grp--alloc"><section class="card">
      <div class="card__head"><h2 class="card__title">Reparto real vs. objetivo</h2>
        ${has && !sk ? `<span class="card__meta ${within ? '' : 'neg'}">${within ? 'Dentro del umbral' : `Desvío de ${nf(0, 1).format(Math.abs(diff))} pp`}</span>` : ''}</div>
      ${sk ? '<span class="sk sk-num"></span>' : `
      <div style="display:flex;align-items:baseline;justify-content:space-between">
        <div class="mid">${cnt('car.cry', has ? pf.cryptoPct : 0, 'pct0')}<span class="cur" style="vertical-align:.3em;margin-left:2px">%</span> <span class="label" style="font-size:13px">en cripto</span></div>
        <div class="label">Objetivo ${pct(s.cryptoTarget, 0)}</div>
      </div>`}
      <div class="alloc" aria-hidden="true">
        <span class="alloc__etf" data-alloc="${has && !sk ? (etfPct / 100).toFixed(4) : 0}"></span>
        <span class="alloc__cry" data-alloc="${has && !sk ? (pf.cryptoPct / 100).toFixed(4) : 0}"></span>
      </div>
      <div class="alloc-target" aria-hidden="true"><i style="left:${100 - s.cryptoTarget}%"></i><span style="left:${clamp(100 - s.cryptoTarget, 8, 92)}%">objetivo</span></div>
      <div class="alloc-legend">
        <div><div class="label"><span class="dot" style="background:var(--text);opacity:.82"></span>ETF · ${has && !sk ? pct(etfPct) : '—'}</div><div class="small-num">${money('car.etf', pf.etf)}</div></div>
        <div style="text-align:right"><div class="label"><span class="dot" style="background:var(--accent)"></span>Cripto · ${has && !sk ? pct(pf.cryptoPct) : '—'}</div><div class="small-num">${money('car.cryv', pf.crypto)}</div></div>
      </div>
    </section>

    </div>
    <div class="grp grp--assets"><h2 class="section-label">Resultado por activo</h2>
    ${has ? `<section class="list">
      ${ASSET_KEYS.filter((a) => pf.per[a].n > 0).map((a) => {
        const h = pf.per[a];
        return `<div class="asset-row">
          <span class="badge ${ASSETS[a].kind === 'crypto' ? 'badge--crypto' : ''}">${a}</span>
          <div><div class="asset-row__name">${ASSETS[a].name}</div>
            <div class="asset-row__sub">${fmtQty(h.qty, a)} ${a} · invertiste ${usd(h.invested)}</div></div>
          <div class="asset-row__val">${isLoadingAsset(a) ? '<span class="sk sk-line" style="width:70px"></span>' : `<div>${usd(h.value)}</div><div class="${plCls(h.pl)}">${FMT.susd(h.pl)} · ${spct(h.plPct)}</div>`}</div>
        </div>`;
      }).join('')}
      <div class="asset-row" style="grid-template-columns:1fr auto">
        <div><div class="asset-row__name">Total</div><div class="asset-row__sub">Invertiste ${usd(pf.invested)}${pf.fees ? ` · comisiones ${usd(pf.fees)}` : ''}</div></div>
        <div class="asset-row__val">${sk ? '<span class="sk sk-line" style="width:70px"></span>' : `<div>${usd(pf.value)}</div><div class="${plCls(pf.pl)}">${FMT.susd(pf.pl)} · ${spct(pf.plPct)}</div>`}</div>
      </div>
    </section>
    ${pf.fallback ? '<p class="footnote" style="padding:0 4px">Algunos activos se valúan con tu último precio de compra porque no hay cotización disponible.</p>' : ''}` : `
    <section class="card card--quiet empty"><h3>Sin compras todavía</h3><p>Cuando registres compras vas a ver el resultado de cada activo.</p>
      <button class="btn btn--primary press" data-go="compras" type="button">Registrar una compra</button></section>`}

    </div>
    <div class="grp grp--scen"><h2 class="section-label">Escenarios a fin del reto</h2>
    <section class="card">
      <table class="table">
        <thead><tr><th>Escenario</th><th>Valor final</th><th>Resultado</th></tr></thead>
        <tbody>${scen.map((r) => `<tr class="${r.x === 0 ? 'is-base' : ''}"><td>${r.x > 0 ? '+' : r.x < 0 ? MINUS : ''}${Math.abs(r.x)} %</td><td>${sk ? '—' : usd(r.final)}</td><td class="${sk ? '' : plCls(r.res)}">${sk ? '—' : FMT.susd(r.res)}</td></tr>`).join('')}</tbody>
      </table>
      <p class="footnote">Es una simulación, no una predicción. Supone que completás el reto (${usd0(prog.goal)} en total) y aplica cada variación a tu valor actual más lo que te falta aportar (${usd(remaining)}).</p>
    </section></div>
    ${disclaimer()}`;
  },
};

/* --------------------------------------------------------------------------
   Pantalla: Mercado
   -------------------------------------------------------------------------- */
let mktSel = 'BTC';

const MERCADO = {
  html() {
    const d = getDolar();
    const dStatus = market.dolar.status;
    const dLoading = !d && ['loading', 'idle'].includes(dStatus);
    const dStale = market.dolar.data && dStatus === 'stale';
    const fx = [['mep', 'MEP'], ['ccl', 'CCL'], ['oficial', 'Oficial'], ['blue', 'Blue']];
    const gap = d && d.mep && d.ccl ? (d.ccl.v / d.mep.v - 1) * 100 : null;
    const gapTh = state.settings.rules.gap.pct;

    const sel = this.assetInfo(mktSel);

    return `
    <header class="vh">
      <div><div class="vh__eyebrow">${freshHTML()}</div><h1 class="vh__title">Mercado</h1></div>
      <button class="icon-btn" data-refresh type="button" aria-label="Actualizar precios">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.35-5.65"/><path d="M20 4v4.5h-4.5"/></svg>
      </button>
    </header>

    <div class="grp grp--fx"><h2 class="section-label">Dólar${dStale ? '<span class="tag-stale">viejo</span>' : ''}${!market.dolar.data && d ? '<span class="tag-stale">prueba</span>' : ''}</h2>
    <div class="fx-grid">
      ${fx.map(([k, label]) => {
        const v = d && d[k];
        return `<section class="card">
          <div class="fx__name"><span>${label}</span></div>
          ${dLoading ? '<span class="sk sk-num" style="height:24px"></span><div class="fx__buy"><span class="sk sk-line" style="width:50%;height:8px"></span></div>'
            : v ? `<div class="small-num reveal"><span class="cur">$</span>${cnt('fx.' + k, v.v, 'ars')}</div><div class="fx__buy">Compra ${v.c ? '$ ' + n2(v.c) : '—'}</div>`
            : '<div class="small-num faint">—</div><div class="fx__buy">Sin dato</div>'}
        </section>`;
      }).join('')}
    </div>
    <section class="card gap-row">
      <div><div class="label">Brecha CCL / MEP</div><div class="label" style="margin-top:2px">${gap !== null && gap >= gapTh ? 'Alta para tu umbral' : `Tu umbral de aviso: ${pct(gapTh, 0)}`}</div></div>
      <div class="mid ${gap !== null && gap >= gapTh ? 'neg' : ''}" style="font-size:28px">${dLoading ? '<span class="sk sk-num" style="width:80px"></span>' : gap !== null ? `${cnt('fx.gap', gap, 'pct1')}<span class="cur" style="vertical-align:.3em;margin-left:2px">%</span>` : '—'}</div>
    </section>
    ${dStatus === 'error' && !d ? '<p class="footnote" style="padding:0 4px">No pudimos traer las cotizaciones. Probá actualizar en un rato.</p>' : ''}

    </div>
    <div class="grp grp--assets"><h2 class="section-label">Activos · 1 año</h2>
    <section class="card" id="mkt-main">
      <div class="chart-head">
        <div><div class="label">${ASSETS[mktSel].name}</div>
          ${sel.m ? `<div class="mid">${money('mk.big.' + mktSel, sel.m.last)}</div><div class="stat__sub ${plCls(sel.m.chg1y)}">${spct(sel.m.chg1y)} en el año${sel.badge}</div>`
            : sel.loading ? '<span class="sk sk-num" style="width:150px;margin-top:4px"></span>' : `<div class="mid faint">—</div>`}
        </div>
      </div>
      ${segHTML('mkt', ASSET_KEYS.map((a) => ({ v: a, label: a })), mktSel)}
      ${sel.series ? '<div class="chart" id="mkt-chart"></div><div class="chart__axis" id="mkt-axis"></div>'
        : sel.loading ? '<div class="chart"><span class="sk sk-block"></span></div>'
        : `<div class="empty" style="padding:24px 8px"><p style="margin:0">${sel.msg}</p></div>`}
    </section>

    <div class="mkt-grid">${ASSET_KEYS.map((a, i) => this.assetCard(a, i)).join('')}</div></div>

    <p class="footnote" style="text-align:center">Dólar: dolarapi.com · Cripto: CoinGecko · ETF: Twelve Data. Los precios se guardan entre 15 y 30 minutos.</p>
    ${disclaimer()}`;
  },

  assetInfo(a) {
    const series = getSeries(a);
    const st = market[a].status;
    const m = series ? metrics(series, ASSETS[a].kind) : null;
    const loading = !series && ['loading', 'idle'].includes(st);
    let msg = 'No pudimos traer el precio. Probá de nuevo en un rato.';
    if (st === 'nokey') msg = 'Pegá tu clave gratuita de Twelve Data en Ajustes para ver SPY y QQQ.';
    const badge = isDemoSource(a) ? '<span class="tag-stale">prueba</span>' : st === 'stale' ? '<span class="tag-stale">viejo</span>' : '';
    return { series, m, loading, msg, badge, st };
  },

  assetCard(a, i) {
    const { series, m, loading, msg, badge } = this.assetInfo(a);
    const f = (v, signed) => (v === null || !isNum(v) ? '—' : signed ? spct(v) : pct(v));
    return `<article class="card mkt ${a === mktSel ? 'is-selected' : ''}" data-mkt="${a}" role="button" tabindex="0" aria-label="Ver ${ASSETS[a].name}">
      <div class="mkt__top">
        <span class="badge ${ASSETS[a].kind === 'crypto' ? 'badge--crypto' : ''}">${a}</span>
        <div class="mkt__id"><div class="mkt__sym">${ASSETS[a].name}</div><div class="mkt__name">${a}${m ? ` · <span class="${plCls(m.chg30 ?? 0)}">${f(m.chg30, true)} 30 d</span>` : ` · ${ASSETS[a].kind === 'crypto' ? 'Cripto' : 'CEDEAR'}`}${badge}</div></div>
        <div class="mkt__price">${m ? `<div class="small-num" style="font-size:17px">${usd(m.last)}</div>${sparkSVG(series, i)}`
          : loading ? '<span class="sk sk-line" style="width:72px;height:14px"></span>' : '<span class="faint">—</span>'}</div>
      </div>
      ${m ? `<div class="mkt__metrics">
        <div><div class="label">Desde el máximo</div><div class="v ${m.dd < -0.05 ? 'neg' : ''}">${f(m.dd, true)}</div></div>
        <div><div class="label">vs. media 200 d</div><div class="v">${f(m.sma, true)}</div></div>
        <div><div class="label">Volatilidad 30 d</div><div class="v">${f(m.vol)}</div></div>
      </div>` : loading ? `<div class="mkt__metrics">${'<div><span class="sk sk-line" style="width:80%;height:8px"></span><br><span class="sk sk-line" style="width:50%;height:12px;margin-top:6px"></span></div>'.repeat(3)}</div>`
        : `<p class="mkt__msg">${msg}</p>`}
    </article>`;
  },

  mount(el, { enter }) {
    bindSeg($('[data-seg="mkt"]', el), (v) => selectAsset(v));
    $$('[data-mkt]', el).forEach((c) => {
      c.addEventListener('click', () => selectAsset(c.dataset.mkt, true));
      c.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectAsset(c.dataset.mkt, true); } });
    });
    $('[data-refresh]', el).addEventListener('click', () => loadMarket(true));
    this.drawMain(el, enter || !MERCADO.drawn);
  },

  drawMain(el, animate) {
    const host = $('#mkt-chart', el);
    if (!host) return;
    const s = getSeries(mktSel);
    const from = addDays(s[s.length - 1].d, -365);
    const yr = s.filter((x) => x.d >= from);
    const step = Math.ceil(yr.length / 260);
    const pts = yr.filter((_, i) => i % step === 0 || i === yr.length - 1);
    drawChart(host, { a: pts.map((x) => x.p), animate, tip: (i) => `<b>${usd(pts[i].p)}</b> <span>${fmtDay(pts[i].d)}</span>` });
    MERCADO.drawn = true;
    $('#mkt-axis', el).innerHTML = `<span>${fmtMonth(pts[0].d)}</span><span>Hoy</span>`;
  },
};

function selectAsset(a, scroll) {
  if (a === mktSel) { if (scroll) $('#mkt-main')?.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'center' }); return; }
  mktSel = a;
  const el = $('#view-mercado');
  const sel = MERCADO.assetInfo(a);
  const card = $('#mkt-main', el);
  // Actualizar solo la tarjeta principal y la selección, sin re-render completo
  const tmp = document.createElement('div');
  tmp.innerHTML = MERCADO.html();
  const fresh = $('#mkt-main', tmp);
  card.replaceWith(fresh);
  bindSeg($('[data-seg="mkt"]', fresh), (v) => selectAsset(v));
  $$('[data-mkt]', el).forEach((c) => c.classList.toggle('is-selected', c.dataset.mkt === a));
  MERCADO.drawMain(el, true);
  runCounts(fresh);
  if (scroll) fresh.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'center' });
  void sel;
}

/* --------------------------------------------------------------------------
   Pantalla: Ajustes
   -------------------------------------------------------------------------- */
const AJUSTES = {
  html() {
    const s = state.settings;
    const numRow = (key, label, value, unit, hint) => `<div class="list__row"><label for="s-${key}">${label}${hint ? `<small>${hint}</small>` : ''}</label>
      <input class="inline-input" id="s-${key}" data-set="${key}" inputmode="decimal" value="${numToInput(value)}">${unit ? `<span class="unit">${unit}</span>` : ''}</div>`;
    const dayOpts = s.frequency === 'semanal'
      ? [1, 2, 3, 4, 5, 6, 0].map((d) => `<option value="${d}" ${s.buyDay === d ? 'selected' : ''}>${WEEKDAYS[d][0].toUpperCase() + WEEKDAYS[d].slice(1)}</option>`).join('')
      : s.frequency === 'mensual' ? Array.from({ length: 28 }, (_, i) => `<option value="${i + 1}" ${s.buyDay === i + 1 ? 'selected' : ''}>Día ${i + 1}</option>`).join('') : '';

    return `
    <header class="vh"><div><div class="vh__eyebrow">Tu plan y tus datos</div><h1 class="vh__title">Ajustes</h1></div></header>

    <div class="grp grp--plan"><h2 class="section-label">Plan</h2>
    <section class="list">
      ${numRow('daily', 'Aporte diario', s.daily, 'US$', `Meta anual: ${usd0(s.daily * 365)}`)}
      <div class="list__row"><label for="s-startDate">Fecha de inicio</label><input class="inline-input" type="date" id="s-startDate" data-set="startDate" value="${s.startDate}"></div>
      ${numRow('cryptoTarget', 'Objetivo en cripto', s.cryptoTarget, '%', `El resto (${pct(100 - s.cryptoTarget, 0)}) en ETF`)}
      ${numRow('deviation', 'Umbral de desvío', s.deviation, 'pp', 'Aviso si el reparto se aleja más que esto')}
      <div class="list__row"><label for="s-frequency">Frecuencia de compra</label>
        <select class="inline-input" id="s-frequency" data-set="frequency">${Object.entries(FREQS).map(([k, f]) => `<option value="${k}" ${s.frequency === k ? 'selected' : ''}>${f.label}</option>`).join('')}</select></div>
      ${dayOpts ? `<div class="list__row"><label for="s-buyDay">Día de compra</label><select class="inline-input" id="s-buyDay" data-set="buyDay">${dayOpts}</select></div>` : ''}
      ${s.frequency === 'quincenal' ? '<div class="list__row"><span class="list__name">Días de compra</span><span class="muted">1 y 15</span></div>' : ''}
      ${numRow('minAmount', 'Monto mínimo por compra', s.minAmount, 'US$')}
    </section>

    </div>
    <div class="grp grp--recs"><h2 class="section-label">Recomendaciones</h2>
    <section class="list">
      ${RULES.map((r) => {
        const cfg = s.rules[r.id];
        return `<div class="list__row"><span class="list__name">${r.label}${r.hint ? `<small>${r.hint}</small>` : ''}</span>
          <label class="switch"><input type="checkbox" data-rule-on="${r.id}" ${cfg.on ? 'checked' : ''} aria-label="${r.label}"><span></span></label></div>
          ${r.thresholds ? `<div class="list__sub">${r.thresholds.map(([k, label, unit]) => `<label>${label}<input class="inline-input" inputmode="decimal" data-rule="${r.id}.${k}" value="${numToInput(cfg[k])}" aria-label="${label}">${unit}</label>`).join('')}</div>` : ''}`;
      }).join('')}
    </section>
    <p class="note">Son reglas simples sobre tu plan. Nunca son señales de compra o venta.</p>

    </div>
    <div class="grp grp--data"><h2 class="section-label">Datos de mercado</h2>
    <section class="list">
      <div class="list__row"><label for="s-tdKey">Clave propia de Twelve Data<small>Opcional: ya viene una incluida</small></label>
        <input class="inline-input wide" id="s-tdKey" data-set="tdKey" type="text" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Usando la incluida" value="${esc(s.tdKey)}"></div>
    </section>
    <p class="note">SPY y QQQ ya funcionan sin hacer nada. Solo si la clave incluida dejara de andar, podés pegar otra de twelvedata.com.</p>

    <h2 class="section-label">Tus datos</h2>
    <section class="list">
      <button class="list__row list__action" data-act="export" type="button">${svgI('<path d="M12 4v11M7.5 8.5 12 4l4.5 4.5M5 15v3.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V15"/>')}Exportar JSON</button>
      <button class="list__row list__action" data-act="import" type="button">${svgI('<path d="M12 15V4M7.5 10.5 12 15l4.5-4.5M5 15v3.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V15"/>')}Importar JSON</button>
      <div class="list__row"><span class="list__name">Datos de prueba<small>${state.demo ? 'Cargados. Al quitarlos vuelven tus datos.' : 'Para ver todo funcionando'}</small></span>
        <label class="switch"><input type="checkbox" data-act="demo" ${state.demo ? 'checked' : ''} aria-label="Datos de prueba"><span></span></label></div>
      <button class="list__row list__action danger" data-act="clear" type="button">${svgI('<path d="M4.5 7h15M6.5 7l1 12.5a1.5 1.5 0 0 0 1.5 1.5h6a1.5 1.5 0 0 0 1.5-1.5l1-12.5M9.5 7V4.5h5V7"/>')}Borrar todo</button>
    </section>
    </div>
    ${disclaimer()}
    <p class="version">Reto 5 USD · v${APP_VERSION}</p>`;
  },

  mount(el) {
    el.addEventListener('change', onSettingChange);
    $$('[data-act]', el).forEach((b) => {
      if (b.type === 'checkbox') return;
      b.addEventListener('click', () => dataAction(b.dataset.act));
    });
  },
};
const svgI = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;

function onSettingChange(e) {
  const t = e.target;
  const s = state.settings;
  const shake = () => { t.classList.remove('is-shake'); void t.offsetWidth; t.classList.add('is-shake'); };
  if (t.dataset.act === 'demo') { t.checked ? loadDemo(t) : removeDemo(); return; }
  if (t.dataset.ruleOn) { s.rules[t.dataset.ruleOn].on = t.checked; save(); return; }
  if (t.dataset.rule) {
    const [id, k] = t.dataset.rule.split('.');
    const lim = { 'cryptoVol.drop30': [5, 90], 'cryptoVol.fromMax': [5, 95], 'behind.days': [1, 90], 'fee.pct': [0.1, 20], 'gap.pct': [1, 100] }[t.dataset.rule];
    const v = parseNum(t.value);
    if (isNum(v) && v >= lim[0] && v <= lim[1]) { s.rules[id][k] = v; save(); t.value = numToInput(v); }
    else { t.value = numToInput(s.rules[id][k]); shake(); toast(`Ingresá un valor entre ${nf(0, 1).format(lim[0])} y ${nf(0, 1).format(lim[1])}`); }
    return;
  }
  const key = t.dataset.set;
  if (!key) return;
  if (key === 'startDate') {
    if (isISO(t.value)) { s.startDate = t.value; save(); } else { t.value = s.startDate; shake(); }
    return;
  }
  if (key === 'frequency') {
    s.frequency = t.value;
    s.buyDay = s.frequency === 'semanal' ? 1 : s.frequency === 'mensual' ? 1 : 0;
    save(); rerender(); return;
  }
  if (key === 'buyDay') { s.buyDay = +t.value; save(); return; }
  if (key === 'tdKey') {
    s.tdKey = t.value.trim(); save();
    try { localStorage.removeItem(LS_CACHE + 'td:SPY'); localStorage.removeItem(LS_CACHE + 'td:QQQ'); } catch (err) { /* nada */ }
    market.SPY = { status: 'idle' }; market.QQQ = { status: 'idle' };
    loadSource('SPY', true); loadSource('QQQ', true);
    toast(s.tdKey ? 'Clave guardada. Buscando SPY y QQQ…' : 'Usando la clave incluida');
    return;
  }
  const lim = { daily: [0.5, 1000], cryptoTarget: [0, 100], deviation: [1, 50], minAmount: [0, 10000] }[key];
  const v = parseNum(t.value);
  if (isNum(v) && v >= lim[0] && v <= lim[1]) {
    s[key] = v; save();
    if (key === 'daily' || key === 'cryptoTarget') rerender(); else t.value = numToInput(v);
  } else {
    t.value = numToInput(s[key]); shake();
    toast(`Ingresá un valor entre ${nf(0, 1).format(lim[0])} y ${nf(0, 1).format(lim[1])}`);
  }
}

async function dataAction(act) {
  if (act === 'export') {
    const blob = new Blob([JSON.stringify({ app: 'reto-5-usd', exportedAt: new Date().toISOString(), ...state }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `reto-5-usd-${todayStr()}.json`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast('Archivo exportado');
  } else if (act === 'import') {
    const input = $('#import-file');
    input.value = '';
    input.click();
  } else if (act === 'clear') {
    const ok = await confirmSheet({ title: '¿Borrar todo?', body: 'Se eliminan tus compras y ajustes de este dispositivo. Si querés conservarlos, exportalos antes.', confirm: 'Borrar todo', danger: true });
    if (!ok) return;
    state = defaultState(); save();
    try { localStorage.removeItem(LS_BACKUP); } catch (e) { /* nada */ }
    Object.keys(prevVals).forEach((k) => delete prevVals[k]);
    rerender();
    toast('Listo, empezás de cero');
  }
}

$('#import-file').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) return toast('El archivo es demasiado grande.');
  let parsed;
  try { parsed = JSON.parse(await file.text()); } catch (err) { return toast('No es un archivo JSON válido.'); }
  const r = validateData(parsed);
  if (!r.ok) return toast(r.error, { duration: 4500 });
  const ok = await confirmSheet({ title: 'Importar datos', body: `El archivo tiene ${r.data.purchases.length} compras. Van a reemplazar los datos actuales de este dispositivo.`, confirm: 'Importar' });
  if (!ok) return;
  state = r.data; save();
  rerender();
  toast('Datos importados');
});

/* Datos de prueba */
async function loadDemo(sw) {
  if (state.purchases.length && !state.demo) {
    const ok = await confirmSheet({ title: 'Cargar datos de prueba', body: 'Tus datos actuales se guardan aparte y vuelven cuando quites los datos de prueba.', confirm: 'Cargar' });
    if (!ok) { if (sw) sw.checked = false; return; }
  }
  if (!state.demo) { try { localStorage.setItem(LS_BACKUP, JSON.stringify(state)); } catch (e) { /* nada */ } }
  // Esperamos un poco a los precios reales para que los datos de prueba sean coherentes
  if (marketPromise) await Promise.race([marketPromise, new Promise((r) => setTimeout(r, 2500))]);
  state.demo = true;
  const today = todayStr();
  const start = addDays(today, -133);
  const wd = parseISO(today).getDay();
  const s = { ...state.settings, startDate: start, frequency: 'semanal', buyDay: wd, daily: 5, cryptoTarget: 20 };
  const rnd = mulberry32(99);
  const ps = [];
  let k = 0;
  for (let d = addDays(start, 6); d < today; d = addDays(d, 7)) {
    k++;
    if (k === 9 || k === 10) continue; // semanas salteadas: muestra el aviso de atraso
    const etfAsset = k % 2 ? 'SPY' : 'QQQ';
    const pe = priceAt(etfAsset, d, getSeries(etfAsset) || demoSeries(etfAsset));
    const amtE = 28 + Math.round(rnd() * 6);
    ps.push({ id: uid(), date: d, asset: etfAsset, amount: amtE, price: +(pe * (1 + (rnd() - 0.5) * 0.004)).toFixed(2), fee: +(amtE * 0.006 + 0.2).toFixed(2) });
    if (k % 2 === 0) {
      const ca = k % 4 === 0 ? 'ETH' : 'BTC';
      const pc = priceAt(ca, d, getSeries(ca) || demoSeries(ca));
      const amtC = 13 + Math.round(rnd() * 4);
      ps.push({ id: uid(), date: d, asset: ca, amount: amtC, price: +(pc * (1 + (rnd() - 0.5) * 0.006)).toFixed(2), fee: +(amtC * (ps.length > 20 ? 0.026 : 0.01)).toFixed(2) });
    }
  }
  state.settings = s;
  state.purchases = ps;
  state.dismissed = {};
  state.milestones = [];
  save();
  rerender();
  toast('Datos de prueba cargados');
}
function removeDemo() {
  let restored = null;
  try { const raw = localStorage.getItem(LS_BACKUP); if (raw) { const r = validateData(JSON.parse(raw)); if (r.ok) restored = r.data; } } catch (e) { /* nada */ }
  state = restored || defaultState();
  state.demo = false;
  save();
  try { localStorage.removeItem(LS_BACKUP); } catch (e) { /* nada */ }
  Object.keys(prevVals).forEach((k) => delete prevVals[k]);
  rerender();
  toast(restored ? 'Volvieron tus datos' : 'Datos de prueba quitados');
}

/* --------------------------------------------------------------------------
   Navegación
   -------------------------------------------------------------------------- */
const VIEWS = { hoy: HOY, compras: COMPRAS, cartera: CARTERA, mercado: MERCADO, ajustes: AJUSTES };
const TAB_ORDER = Object.keys(VIEWS);
let current = null;
const scrollPos = {};
const viewEl = (n) => $('#view-' + n);

function render(name, { enter }) {
  const el = viewEl(name);
  const v = VIEWS[name];
  if (enter) { if (v === HOY) HOY.drawn = false; if (v === MERCADO) MERCADO.drawn = false; }
  // Ajustes registra un listener en el contenedor: lo reemplazamos para no duplicar
  if (name === 'ajustes') el.removeEventListener('change', onSettingChange);
  el.innerHTML = `<div class="${enter ? 'stagger' : 'no-anim'}">${v.html()}</div>`;
  Array.from(el.firstElementChild.children).forEach((c, i) => c.style.setProperty('--i', Math.min(i, 10)));
  if (v.mount) v.mount(el, { enter });
  runCounts(el);
  runRings(el);
  updateFresh();
}
function rerender() { if (current) render(current, { enter: false }); }

function moveIndicator(name, instant) {
  const ind = $('.tabbar__ind');
  const i = TAB_ORDER.indexOf(name);
  if (instant) { ind.style.transition = 'none'; requestAnimationFrame(() => { ind.style.transition = ''; }); }
  ind.style.setProperty('--i', i);
  $$('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
}

function go(name, instant) {
  if (!VIEWS[name]) return;
  if (name === current) { window.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' }); return; }
  const prev = current;
  current = name;
  moveIndicator(name, instant);
  if (openSwipe) openSwipe = null;
  const show = () => {
    const el = viewEl(name);
    el.classList.add('is-active');
    if (!instant) {
      el.classList.add('is-entering');
      const done = (e) => { if (e.target === el) { el.classList.remove('is-entering'); el.removeEventListener('animationend', done); } };
      el.addEventListener('animationend', done);
    }
    window.scrollTo(0, scrollPos[name] || 0);
    render(name, { enter: true });
  };
  if (prev) {
    scrollPos[prev] = window.scrollY;
    const old = viewEl(prev);
    if (!instant && !reduced()) {
      old.classList.add('is-leaving');
      setTimeout(() => { old.classList.remove('is-active', 'is-leaving'); if (current === name) show(); }, 120);
      return;
    }
    old.classList.remove('is-active');
  }
  show();
}

let mTimer = null;
function notifyMarket() {
  clearTimeout(mTimer);
  mTimer = setTimeout(() => {
    updateFresh();
    if (current === 'compras') updatePriceBtn();
    else if (current === 'hoy' || current === 'cartera' || current === 'mercado') {
      // No interrumpir si el usuario está arrastrando un gráfico o una tarjeta
      if ($('.chart.is-scrub') || $('.swipe__content[style*="translate"], .rec[style*="translate"]')) return setTimeout(notifyMarket, 1200);
      render(current, { enter: false });
    }
  }, 120);
}

/* Delegación global */
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-tab],[data-go],[data-demo]');
  if (!t) return;
  if (t.dataset.tab) go(t.dataset.tab);
  else if (t.dataset.go) go(t.dataset.go);
  else if (t.hasAttribute('data-demo')) loadDemo();
});

/* --------------------------------------------------------------------------
   Inicio
   -------------------------------------------------------------------------- */
let lastDay = todayStr();
function init() {
  hydrateMarket();
  go('hoy', true);
  loadMarket(false);
  setInterval(updateFresh, 30000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (todayStr() !== lastDay) { lastDay = todayStr(); rerender(); }
    loadMarket(false);
  });
  let rt = null;
  let lastW = window.innerWidth;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      if (Math.abs(window.innerWidth - lastW) < 2) return;
      lastW = window.innerWidth;
      if (current === 'hoy' || current === 'mercado') rerender();
    }, 200);
  });
}
init();

})();
