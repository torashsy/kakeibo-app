import { describe, it, expect } from "vitest";
import { decideSync } from "./sync";

const T1 = "2026-07-01T00:00:00.000Z";
const T2 = "2026-07-02T00:00:00.000Z";

describe("decideSync (last-write-wins)", () => {
  it("リモートが新しい → ローカルへ反映", () => {
    const r = decideSync({ entries: T1 }, { entries: "old" }, [{ key: "entries", value: "new", updated_at: T2 }]);
    expect(r.toLocal).toEqual([{ key: "entries", value: "new", ts: T2 }]);
    expect(r.toPush).toEqual([]);
  });
  it("ローカルが新しい → アップロード", () => {
    const r = decideSync({ entries: T2 }, { entries: "local" }, [{ key: "entries", value: "remote", updated_at: T1 }]);
    expect(r.toLocal).toEqual([]);
    expect(r.toPush).toEqual(["entries"]);
  });
  it("同時刻は何もしない(無駄な転送をしない)", () => {
    const r = decideSync({ entries: T1 }, { entries: "same" }, [{ key: "entries", value: "same", updated_at: T1 }]);
    expect(r.toLocal).toEqual([]);
    expect(r.toPush).toEqual([]);
  });
  it("ローカルにしか無いキーは送る", () => {
    const r = decideSync({}, { theme: "{}" }, []);
    expect(r.toPush).toEqual(["theme"]);
  });
  it("リモートにしか無いキーは取り込む(初回の新端末)", () => {
    const r = decideSync({}, {}, [{ key: "cards", value: "[]", updated_at: T1 }]);
    expect(r.toLocal).toEqual([{ key: "cards", value: "[]", ts: T1 }]);
    expect(r.toPush).toEqual([]);
  });
  it("メタが無いローカル値はリモート優先(タイムスタンプ不明=0扱い)", () => {
    const r = decideSync({}, { entries: "unknown-age" }, [{ key: "entries", value: "remote", updated_at: T1 }]);
    expect(r.toLocal).toEqual([{ key: "entries", value: "remote", ts: T1 }]);
  });
  it("複数キーの混在", () => {
    const r = decideSync(
      { a: T2, b: T1 },
      { a: "A-local", b: "B-local", c: "C-local" },
      [{ key: "a", value: "A-remote", updated_at: T1 }, { key: "b", value: "B-remote", updated_at: T2 }]
    );
    expect(r.toLocal).toEqual([{ key: "b", value: "B-remote", ts: T2 }]);
    expect(r.toPush.sort()).toEqual(["a", "c"]);
  });
});
