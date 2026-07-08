// window.storage 互換の保存層。
// 基本は localStorage。設定画面で Supabase(URL/anon key)を設定しログインすると、
// キー単位の last-write-wins でクラウドと双方向同期する(オフライン時はローカルのみ→後で追送)。
// get/set/delete/list の signature は従来どおりで、App.jsx は変更不要。
import { decideSync } from "./sync";

const PREFIX = "kakeibo:";
const CFG_KEY = "kakeibo-sync:config";    // { url, anonKey }
const META_KEY = "kakeibo-sync:meta";     // { [key]: ローカル最終書込ISO }
const PENDING_KEY = "kakeibo-sync:pending"; // 送信失敗キーの再送キュー [key,...]
const TABLE = "kv";

const wrap = (v) => (v == null ? null : { value: v });
const readJSON = (k, fb) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } };
const writeJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

let clientPromise = null;
let initPromise = null;
const listeners = new Set();

export const getSyncConfig = () => readJSON(CFG_KEY, null);
export const setSyncConfig = (cfg) => { writeJSON(CFG_KEY, cfg); clientPromise = null; initPromise = null; notify(); };
export const clearSyncConfig = () => { try { localStorage.removeItem(CFG_KEY); } catch {} clientPromise = null; initPromise = null; notify(); };

// supabase-jsは重いので、同期が設定されている場合のみ動的importする(未設定なら即null)
function getClient() {
  const cfg = getSyncConfig();
  if (!cfg || !cfg.url || !cfg.anonKey) return Promise.resolve(null);
  if (!clientPromise) {
    clientPromise = import("@supabase/supabase-js")
      .then(({ createClient }) => createClient(cfg.url, cfg.anonKey))
      .catch(() => null);
  }
  return clientPromise;
}

// 同期状態: off(未設定) / signedOut(設定済み未ログイン) / on(ログイン済み)
export async function getSyncState() {
  const c = await getClient();
  if (!c) return { mode: "off" };
  try {
    const { data } = await c.auth.getSession();
    const email = data && data.session && data.session.user ? data.session.user.email : null;
    return email ? { mode: "on", email } : { mode: "signedOut" };
  } catch { return { mode: "signedOut" }; }
}
export const onSyncChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const notify = () => listeners.forEach((fn) => { try { fn(); } catch {} });

export async function signUp(email, password) {
  const c = await getClient(); if (!c) throw new Error("同期設定がありません");
  const { error } = await c.auth.signUp({ email, password });
  if (error) throw error; notify();
}
export async function signIn(email, password) {
  const c = await getClient(); if (!c) throw new Error("同期設定がありません");
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error; notify();
}
export async function signOut() {
  const c = await getClient(); if (c) { try { await c.auth.signOut(); } catch {} }
  notify();
}

const meta = () => readJSON(META_KEY, {});
const setMetaKey = (key, iso) => { const m = meta(); m[key] = iso; writeJSON(META_KEY, m); };
const pending = () => readJSON(PENDING_KEY, []);
const addPending = (key) => { const p = new Set(pending()); p.add(key); writeJSON(PENDING_KEY, [...p]); };
const clearPending = (keys) => { const p = new Set(pending()); keys.forEach((k) => p.delete(k)); writeJSON(PENDING_KEY, [...p]); };

const localValues = () => {
  const vals = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(PREFIX)) vals[k.slice(PREFIX.length)] = localStorage.getItem(k);
  }
  return vals;
};

async function pushKey(c, key) {
  const value = localStorage.getItem(PREFIX + key);
  const updated_at = meta()[key] || new Date().toISOString();
  const { error } = await c.from(TABLE).upsert({ key, value, updated_at }, { onConflict: "user_id,key" });
  if (error) throw error;
}

// 起動時同期: リモート全件と突き合わせ、新しい方を採用。ローカルにしか無いものは送る。
async function fullSync() {
  const c = await getClient(); if (!c) return false;
  const { data: sess } = await c.auth.getSession();
  if (!sess || !sess.session) return false;
  const { data: rows, error } = await c.from(TABLE).select("key,value,updated_at");
  if (error) throw error;
  const { toLocal, toPush } = decideSync(meta(), localValues(), rows || []);
  for (const { key, value, ts } of toLocal) {
    if (value == null) localStorage.removeItem(PREFIX + key); else localStorage.setItem(PREFIX + key, value);
    setMetaKey(key, ts);
  }
  const pushes = [...new Set([...toPush, ...pending()])];
  for (const key of pushes) { await pushKey(c, key); }
  clearPending(pushes);
  return toLocal.length > 0;
}

// 初回get前に一度だけ同期(失敗してもローカルで続行)。手動同期用にも公開。
export function syncNow() { initPromise = null; return ensureInit(); }
function ensureInit() {
  if (!initPromise) initPromise = fullSync().catch(() => false);
  return initPromise;
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => { syncNow(); });
}

window.storage = {
  async get(key) {
    await ensureInit();
    try { return wrap(localStorage.getItem(PREFIX + key)); } catch { return null; }
  },
  async set(key, value) {
    try {
      localStorage.setItem(PREFIX + key, value);
      setMetaKey(key, new Date().toISOString());
      getClient().then((c) => { if (c) pushKey(c, key).catch(() => addPending(key)); });
      return { value };
    } catch { return null; }
  },
  async delete(key) {
    try {
      localStorage.removeItem(PREFIX + key);
      setMetaKey(key, new Date().toISOString());
      getClient().then((c) => { if (c) c.from(TABLE).delete().eq("key", key).then(() => {}, () => addPending(key)); });
      return { deleted: true };
    } catch { return null; }
  },
  async list(prefix = "") {
    const keys = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(PREFIX + prefix)) keys.push(k.slice(PREFIX.length));
      }
    } catch {}
    return { keys };
  },
};
