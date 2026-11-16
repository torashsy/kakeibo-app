import React, { useRef } from "react";

export function SearchField({ label, placeholder, value, onChange }) {
  const input = useRef(null);
  const clear = () => {
    onChange("");
    input.current?.focus();
  };
  return <div className="search-field">
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <circle cx="10" cy="10" r="6.5"/><path d="m15 15 5 5"/>
    </svg>
    <input ref={input} type="search" enterKeyHint="search" aria-label={label} placeholder={placeholder}
      value={value} onChange={event => onChange(event.target.value)}/>
    {value && <button type="button" aria-label="検索をクリア" onClick={clear}>×</button>}
  </div>;
}
