import React, { createContext, useContext } from "react";
import { ovStyle, EDIT_OUTLINE, CONTAINER_IDS, TARGET_LABELS } from './theme.js';
import { styles } from './styles.js';

export const EditCtx = createContext({ editMode: false, overrides: {} });

// 編集可能な要素をラップ: overrideを適用する。
// タップ検知は上位(main)の1箇所のcaptureハンドラに集約し、data-edit-idで対象を特定する
// (通常のボタン等がネストしていても、編集モード中はその場のクリックが本来の動作まで
//  貫通してしまわないようにするため)。
export function Editable({ id, base, tag = "div", children, ...rest }) {
  const { editMode, overrides } = useContext(EditCtx);
  const merged = { ...base, ...ovStyle(overrides[id]) };
  const isContainer = CONTAINER_IDS.has(id);
  const style = editMode ? { ...merged, ...EDIT_OUTLINE, ...(isContainer ? { position: "relative" } : {}) } : merged;
  const Tag = tag;
  if (editMode && isContainer) {
    return <Tag {...rest} style={style} data-edit-id={id}>
      <span style={styles.ovChip}>◧ {TARGET_LABELS[id] || "背景"}</span>
      {children}
    </Tag>;
  }
  return <Tag {...rest} style={style} data-edit-id={id}>{children}</Tag>;
}
