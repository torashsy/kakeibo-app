// window.storage 互換の保存層。
// 基本は localStorage。設定画面で Supabase(URL/anon key)を設定しログインすると、
// キー単位の last-write-wins でクラウドと双方向同期する(オフライン時はローカルのみ→後で追送)。
// get/set/delete/list の signature は従来どおりで、App.jsx は変更不要。
import { decideSync } from "./sync";

const PREFIX = "kakeibo:";
const CFG_KEY = "kakeibo-sync:config";    // { url, anonKey }
const META_KEY = "kakeibo-sync:meta";     // { [key]: ローカル最終書込ISO }
const PENDING_KEY = "kakeibo-sync:pending"; // 送信失敗キーの再送キュー [key,...]
const OWNER_KEY = "kakeibo-sync:owner"; // 同じ端末の台帳を別ユーザーへ送らない
const TABLE = "kv";
const BUILTIN_CONFIG = {
  url: String(import.meta.env.VITE_SUPABASE_URL || "").trim(),
  anonKey: String(import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim(),
};
const SYNC_OWNER_EMAIL = String(import.meta.env.VITE_SYNC_OWNER_EMAIL || "").trim().toLowerCase();

const wrap = (v) => (v == null ? null : { value: v });
const readJSON = (k, fb) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } };
const writeJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

let clientPromise = null;
let initPromise = null;
let activeSyncPromise = null;
const listeners = new Set();
const financeAuthListeners = new Set();
let sessionUserId = null;
let sessionEpoch = 0;
let ledgerUserId = null;
let activity = { status: "idle", lastSyncAt: null, error: "" };

function setSessionIdentity(userId) {
  if (sessionUserId === userId) return;
  sessionUserId = userId; sessionEpoch += 1;
  financeAuthListeners.forEach((fn) => { try { fn(); } catch {} });
}
export const onFinanceAuthChange = (fn) => { financeAuthListeners.add(fn); return () => financeAuthListeners.delete(fn); };
export const isFinanceSessionCurrent = (userId, epoch) => !!userId && sessionUserId === userId && ledgerUserId === userId && sessionEpoch === epoch;

export const getSyncConfig = () => (BUILTIN_CONFIG.url && BUILTIN_CONFIG.anonKey ? BUILTIN_CONFIG : readJSON(CFG_KEY, null));
export const hasBuiltInSyncConfig = () => !!(BUILTIN_CONFIG.url && BUILTIN_CONFIG.anonKey);
// 組み込みのSupabase設定があれば、ユーザー名＋PINでの個人同期UIを出す(メール入力は不要)
export const hasPersonalSync = () => hasBuiltInSyncConfig();
export const setSyncConfig = (cfg) => { writeJSON(CFG_KEY, cfg); clientPromise = null; initPromise = null; ledgerUserId = null; setSessionIdentity(null); notify(); };
export const clearSyncConfig = () => { try { localStorage.removeItem(CFG_KEY); } catch {} clientPromise = null; initPromise = null; ledgerUserId = null; setSessionIdentity(null); notify(); };

// supabase-jsは重いので、同期が設定されている場合のみ動的importする(未設定なら即null)
function getClient() {
  const cfg = getSyncConfig();
  if (!cfg || !cfg.url || !cfg.anonKey) return Promise.resolve(null);
  if (!clientPromise) {
    clientPromise = import("@supabase/supabase-js")
      .then(({ createClient }) => {
        const c = createClient(cfg.url, cfg.anonKey);
        c.auth.onAuthStateChange((_event, session) => setSessionIdentity(session?.user?.id || null));
        return c;
      })
      .catch(() => null);
  }
  return clientPromise;
}

// 同期状態: off(未設定) / signedOut(設定済み未ログイン) / on(ログイン済み)
export async function getSyncState() {
  const c = await getClient();
  if (!c) return { mode: "off", ...activity, builtIn: hasBuiltInSyncConfig(), personal: hasPersonalSync() };
  try {
    const { data } = await c.auth.getSession();
    const email = data && data.session && data.session.user ? data.session.user.email : null;
    const userId = data?.session?.user?.id || null;
    setSessionIdentity(userId);
    return email ? { mode: "on", email, userId, ledgerUserId, ...activity, builtIn: hasBuiltInSyncConfig(), personal: hasPersonalSync() } : { mode: "signedOut", ...activity, builtIn: hasBuiltInSyncConfig(), personal: hasPersonalSync() };
  } catch { return { mode: "signedOut", ...activity, builtIn: hasBuiltInSyncConfig(), personal: hasPersonalSync() }; }
}

// 金融機関から確認した情報はkvと分離し、端末からは読取のみ。
// 古い端末やオフラインの再送でサーバー側の観測結果を巻き戻さない。
export async function readFinanceFeed() {
  const c = await getClient();
  if (!c) return { mode: "off", feed: null };
  const { data: sessionData, error: sessionError } = await c.auth.getSession();
  if (sessionError) throw sessionError;
  const userId = sessionData?.session?.user?.id;
  setSessionIdentity(userId || null);
  if (!userId) return { mode: "signedOut", feed: null };
  const authEpoch = sessionEpoch;
  const { data, error } = await c.from("finance_feed")
    .select("payload,updated_at").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  const { data: latest, error: latestError } = await c.auth.getSession();
  if (latestError) throw latestError;
  setSessionIdentity(latest?.session?.user?.id || null);
  if (sessionUserId !== userId || sessionEpoch !== authEpoch) return { mode: "loading", feed: null };
  return { mode: "on", userId, authEpoch, feed: data?.payload || null, updatedAt: data?.updated_at || null };
}
export const onSyncChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const notify = () => listeners.forEach((fn) => { try { fn(); } catch {} });
const setActivity = (patch) => { activity = { ...activity, ...patch }; notify(); };

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
export async function signInWithMagicLink() {
  const c = await getClient();
  if (!c || !SYNC_OWNER_EMAIL) throw new Error("個人同期の設定がありません");
  const redirectTo = typeof window !== "undefined" ? `${window.location.origin}${window.location.pathname}` : undefined;
  const { error } = await c.auth.signInWithOtp({
    email: SYNC_OWNER_EMAIL,
    options: { emailRedirectTo: redirectTo, shouldCreateUser: true },
  });
  if (error) throw error;
}
// 個人用: ユーザー名＋PINで同期(メール不要)。ユーザー名から内部用の擬似メールを合成し、
// PINをパスワードとして使う。実在メールは不要だが、Supabase側で「Confirm email」はオフにしておくこと。
// 各端末で同じユーザー名＋PINを入れれば同じアカウント＝同期される。
const emailForUser = (username) => `${String(username || "").trim().toLowerCase()}@kakeibo.local`;
export const displayName = (email) => String(email || "").replace(/@kakeibo\.local$/, "");
export async function signInUser(username, pin) {
  if (!String(username || "").trim()) throw new Error("ユーザー名を入力してください");
  return signIn(emailForUser(username), pin);
}
export async function signUpUser(username, pin) {
  if (!String(username || "").trim()) throw new Error("ユーザー名を入力してください");
  return signUp(emailForUser(username), pin);
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

async function pushKey(c, key, expectedUserId, expectedEpoch) {
  if (!expectedUserId || sessionUserId !== expectedUserId || sessionEpoch !== expectedEpoch) throw new Error("ログイン状態が変わりました。送信を保留しました。");
  const owner = readJSON(OWNER_KEY, null);
  if (owner && owner !== expectedUserId) throw new Error("この端末の記録と同じユーザーでログインしてください。");
  const value = localStorage.getItem(PREFIX + key);
  const updated_at = meta()[key] || new Date().toISOString();
  const { error } = await c.from(TABLE).upsert({ user_id: expectedUserId, key, value, updated_at }, { onConflict: "user_id,key" });
  if (error) throw error;
}

// 起動時同期: リモート全件と突き合わせ、新しい方を採用。ローカルにしか無いものは送る。
async function fullSync() {
  const c = await getClient(); if (!c) return false;
  const { data: sess } = await c.auth.getSession();
  if (!sess || !sess.session) return false;
  const userId = sess.session.user.id;
  setSessionIdentity(userId);
  const authEpoch = sessionEpoch;
  setActivity({ status: "syncing", error: "" });
  try {
    const owner = readJSON(OWNER_KEY, null);
    if (owner && owner !== userId) throw new Error("この端末の記録と同じユーザーでログインしてください。");
    const { data: rows, error } = await c.from(TABLE).select("key,value,updated_at");
    if (error) throw error;
    const { data: latest } = await c.auth.getSession();
    setSessionIdentity(latest?.session?.user?.id || null);
    if (sessionUserId !== userId || sessionEpoch !== authEpoch) throw new Error("ログイン状態が変わりました。再読み込みしてください。");
    const { toLocal, toPush } = decideSync(meta(), localValues(), rows || []);
    writeJSON(OWNER_KEY, userId);
    for (const { key, value, ts } of toLocal) {
      if (value == null) localStorage.removeItem(PREFIX + key); else localStorage.setItem(PREFIX + key, value);
      setMetaKey(key, ts);
    }
    const pushes = [...new Set([...toPush, ...pending()])];
    for (const key of pushes) { await pushKey(c, key, userId, authEpoch); }
    clearPending(pushes);
    if (sessionUserId !== userId || sessionEpoch !== authEpoch) throw new Error("ログイン状態が変わりました。再読み込みしてください。");
    ledgerUserId = userId;
    setActivity({ status: "synced", lastSyncAt: new Date().toISOString(), error: "" });
    if (toLocal.length > 0 && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("kakeibo:remote-update", { detail: { keys: toLocal.map((x) => x.key) } }));
    }
    return toLocal.length > 0;
  } catch (error) {
    setActivity({ status: "error", error: error && error.message ? error.message : String(error) });
    throw error;
  }
}

// 初回get前に一度だけ同期(失敗してもローカルで続行)。手動同期用にも公開。
const runFullSync = () => {
  if (!activeSyncPromise) activeSyncPromise = fullSync().catch(() => false).finally(() => { activeSyncPromise = null; });
  return activeSyncPromise;
};
export function syncNow() { initPromise = null; return runFullSync(); }
function ensureInit() {
  if (!initPromise) initPromise = runFullSync();
  return initPromise;
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => { syncNow(); });
  window.addEventListener("focus", () => { syncNow(); });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") syncNow(); });
  window.setInterval(() => { if (document.visibilityState === "visible" && navigator.onLine) syncNow(); }, 30000);
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
      const expectedUserId = sessionUserId, expectedEpoch = sessionEpoch;
      getClient().then((c) => {
        if (!c) return;
        if (!expectedUserId) { addPending(key); return; }
        setActivity({ status: "syncing", error: "" });
        pushKey(c, key, expectedUserId, expectedEpoch)
          .then(() => setActivity({ status: "synced", lastSyncAt: new Date().toISOString(), error: "" }))
          .catch((error) => { addPending(key); setActivity({ status: "error", error: error && error.message ? error.message : String(error) }); });
      });
      return { value };
    } catch { return null; }
  },
  async delete(key) {
    try {
      localStorage.removeItem(PREFIX + key);
      setMetaKey(key, new Date().toISOString());
      const expectedUserId = sessionUserId, expectedEpoch = sessionEpoch;
      getClient().then((c) => {
        if (!c || !expectedUserId || sessionUserId !== expectedUserId || sessionEpoch !== expectedEpoch || readJSON(OWNER_KEY, null) !== expectedUserId) { addPending(key); return; }
        c.from(TABLE).delete().eq("user_id", expectedUserId).eq("key", key).then(() => {}, () => addPending(key));
      });
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

