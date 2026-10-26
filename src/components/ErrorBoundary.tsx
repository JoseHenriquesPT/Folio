import { Component, type ErrorInfo, type ReactNode } from "react";

type ErrorBoundaryState = { crashed: boolean };

export default class ErrorBoundary extends Component<
  { children: ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { crashed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { crashed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Folio crashed", error, info.componentStack);
  }

  render() {
    if (this.state.crashed) {
      return (
        <main className="centered">
          <div className="panel crash-panel">
            <p className="eyebrow">Unexpected error</p>
            <h1>Something went wrong</h1>
            <p className="muted">
              Your notes are safe on the server. Reload to try again.
            </p>
            <button
              type="button"
              className="button primary"
              onClick={() => window.location.reload()}
            >
              Reload Folio
            </button>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}
