import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import EditorView from "./Editor";
import ProjectView from "./Project";
import reportWebVitals from "./reportWebVitals";
import { HashRouter, Route, Routes } from "react-router";
import { apiUrl } from "./utils/api";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <HashRouter>
      <Routes>
        <Route index element={<ProjectView />} />
        <Route path=":id" element={<EditorView />} />
      </Routes>
    </HashRouter>
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();

// Fetch server info (port) at startup and expose it globally.
// Used by apiUrl() to dynamically construct backend URLs in development mode.
// Uses a relative path so it works before anything else is initialized.
fetch("/api/server-info")
  .then((r) => r.json())
  .then((info) => {
    window.__SERVER_INFO__ = info;
    console.log("server-info", info);
  })
  .catch(() => {
    console.log("server-info not available (expected in production)");
  });
