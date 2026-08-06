import React from "react";
import { styles } from "../styles.js";

// iOS の日付入力は値を消しにくいため、任意の日付には明示的な空白ボタンを添える。
export function ClearableCalendarInput({ type = "date", value = "", onChange, style }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: value ? "minmax(0,1fr) auto" : "1fr", gap: 8, alignItems: "center" }}>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} style={style || styles.dateInput} />
      {value && <button type="button" style={{ ...styles.chipGhost, whiteSpace: "nowrap" }} onClick={() => onChange("")}>空白</button>}
    </div>
  );
}
