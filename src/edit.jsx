import React, { createContext, useContext } from "react";
import { ovStyle, EDIT_OUTLINE, CONTAINER_IDS, TARGET_LABELS } from './theme.js';
import { styles } from './styles.js';

export const EditCtx = createContext({ editMode: false, overrides: {}, pick: () => {} });

// 編集可能な要素をラップ: overrideを適用し、編集モードならタップで書式編集
export function Editable({ id, base, tag = "div", children, ...rest }) {
  const { editMode, overrides, pick } = useContext(EditCtx);
  const merged = { ...base, ...ovStyle(overrides[id]) };
  const isContainer = CONTAINER_IDS.has(id);
  const style = editMode ? { ...merged, ...EDIT_OUTLINE, ...(isContainer ? { position: "relative" } : {}) } : merged;
  const onClick = editMode ? (e) => { e.stopPropagation(); e.preventDefault(); pick(id); } : rest.onClick;
  const Tag = tag;
  if (editMode && isContainer) {
    return <Tag {...rest} style={style} onClick={onClick}>
      <span onClick={(e) => { e.stopPropagation(); pick(id); }} style={styles.ovChip}>◧ {TARGET_LABELS[id] || "背景"}</span>
      {children}
    </Tag>;
  }
  return <Tag {...rest} style={style} onClick={onClick}>{children}</Tag>;
}
