import React from "react";
import { ACCENT, GREEN, MUTED, RED } from "../theme.js";
import { num } from "../utils";
import { styles } from "../styles.js";

const LABEL_WIDTH = 132;
// 「-1,106,800」のような符号付き7桁でも、左右余白を含めて収まる幅。
const VALUE_WIDTH = 116;

const valueColor = (row, value, column) => {
  if (row.color) return row.color(value, column);
  if (value === 0) return "var(--zero)";
  if (row.kind === "net") return value > 0 ? GREEN : RED;
  return row.muted ? MUTED : undefined;
};

export function AnnualMatrix({ columns, rows, currentKey, totalLabel = "年間計" }) {
  const visibleRows = rows.filter((row) => !row.hidden);
  const tableWidth = LABEL_WIDTH + (columns.length + 1) * VALUE_WIDTH;
  const textOf = (row, value, column) => row.format ? row.format(value, column) : value === 0 ? "" : num(value);

  return (
    <div style={styles.tableScroll}>
      <table style={{ ...styles.table, width: tableWidth }}>
        <colgroup><col style={{ width: LABEL_WIDTH }} />{columns.map((column) => <col key={column.key} style={{ width: VALUE_WIDTH }} />)}<col style={{ width: VALUE_WIDTH }} /></colgroup>
        <thead><tr>
          <th style={{ ...styles.th, ...styles.thSticky }}>項目</th>
          {columns.map((column) => <th key={column.key} style={{ ...styles.th, width: VALUE_WIDTH, ...(column.key === currentKey ? { color: ACCENT } : {}) }}>{column.label}</th>)}
          <th style={{ ...styles.th, ...styles.thTotal, width: VALUE_WIDTH }}>{totalLabel}</th>
        </tr></thead>
        <tbody>
          {visibleRows.map((row) => {
            const summary = row.kind === "summary" || row.kind === "net" || row.kind === "balance";
            const values = columns.map((column) => Number(row.value(column.key)) || 0);
            const total = row.total === null ? null : row.total != null ? Number(row.total) || 0 : values.reduce((sum, value) => sum + value, 0);
            return (
              <tr key={row.key}>
                <td style={{ ...styles.td, ...styles.tdSticky, ...(summary ? styles.tdSubLabel : {}), ...(row.indent ? { padding: "8px 10px 8px 20px", fontWeight: 400 } : {}), ...(row.muted ? { color: MUTED } : {}) }}>
                  {row.renderLabel ? row.renderLabel() : row.onToggle ? (
                    <button aria-expanded={!!row.open} style={{ ...styles.cellBtn, width: "100%", textAlign: "left", fontWeight: 600 }} onClick={row.onToggle}>{row.open ? "⌄" : "›"} {row.label}</button>
                  ) : row.onLabelClick ? (
                    <button style={{ ...styles.cellBtn, width: "100%", textAlign: "left", color: "inherit", fontWeight: "inherit" }} onClick={row.onLabelClick}>{row.label}</button>
                  ) : row.label}
                </td>
                {columns.map((column, index) => {
                  const value = values[index];
                  const color = valueColor(row, value, column);
                  const cellStyle = { ...styles.tdNum, width: VALUE_WIDTH, padding: "6px 8px", overflow: "hidden", ...(summary ? { ...styles.tdSubTotal, fontWeight: 400 } : {}), ...(column.key === currentKey ? { background: "var(--col-hl)" } : {}), ...(color ? { color } : {}) };
                  return <td key={column.key} style={cellStyle}>{row.renderCell ? row.renderCell(column.key, value, textOf(row, value, column)) : textOf(row, value, column)}</td>;
                })}
                <td style={{ ...styles.tdNum, ...styles.tdTotalCell, width: VALUE_WIDTH, padding: "6px 8px", overflow: "hidden", fontWeight: 400, ...(summary ? { ...styles.tdSubTotal, fontWeight: 400 } : {}), ...(total != null ? (valueColor(row, total, null) ? { color: valueColor(row, total, null) } : {}) : {}) }}>
                  {total == null ? "" : row.renderTotal ? row.renderTotal(total, textOf(row, total, null)) : textOf(row, total, null)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
