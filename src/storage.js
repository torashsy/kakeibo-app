// window.storage 互換の保存層。
// artifact時代の window.storage.get/set/delete/list(key, shared) と同じ signature を提供。
// 既定は localStorage。将来クラウド同期したい場合はこの実装だけ差し替えればよい。
const PREFIX = "kakeibo:";
const wrap = (v) => (v == null ? null : { value: v });

window.storage = {
  async get(key) {
    try { return wrap(localStorage.getItem(PREFIX + key)); } catch { return null; }
  },
  async set(key, value) {
    try { localStorage.setItem(PREFIX + key, value); return { value }; } catch { return null; }
  },
  async delete(key) {
    try { localStorage.removeItem(PREFIX + key); return { deleted: true }; } catch { return null; }
  },
  async list(prefix = "") {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX + prefix)) keys.push(k.slice(PREFIX.length));
    }
    return { keys };
  },
};
