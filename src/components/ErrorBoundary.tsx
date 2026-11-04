import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * A malformed saved report or share link used to blank the whole page: React
 * unmounts the tree and the user sees an empty white window with no way back.
 * This keeps the app usable and offers the two escapes that actually help.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // No Sentry in this build; keep the detail in the console for support.
    console.error("StudioKit crashed:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>Something broke on this screen</h1>
          <p>
            The report or link that was opened can't be rendered. Nothing was uploaded — your saved dashboards are
            still in this browser.
          </p>
          <div className="auth-actions">
            <button className="btn primary" onClick={() => window.location.reload()}>
              Reload
            </button>
            <button
              className="btn ghost"
              onClick={() => {
                // Drop the hash so a bad share link doesn't crash the reload too.
                window.location.hash = "";
                window.location.search = "";
              }}
            >
              Open a clean workspace
            </button>
          </div>
        </div>
      </div>
    );
  }
}
