import "./storage.js";          // window.storage を用意(App.jsx より前に読み込む)
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode><App /></React.StrictMode>
);
