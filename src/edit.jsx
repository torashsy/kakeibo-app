import React from "react";

// デザイン編集モードは廃止。各コンポーネントは <Editable id=".." base={..}> を
// 多用しているため、互換のためだけに「base をそのまま描画する器」として残す。
// (id は使わないが、呼び出し側を書き換えずに済ませるための引数)
export function Editable({ id, base, tag = "div", children, ...rest }) {
  const Tag = tag;
  return <Tag {...rest} style={base}>{children}</Tag>;
}
