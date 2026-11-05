import React from "react";
import ReactDOM from "react-dom/client";
import AppShell from "./AppShell";
import UpdateNotice from "./components/UpdateNotice";
import ErrorBoundary from "./components/ErrorBoundary";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AppShell />
      <UpdateNotice />
    </ErrorBoundary>
  </React.StrictMode>,
);
