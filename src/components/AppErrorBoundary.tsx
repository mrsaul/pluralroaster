import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string | null;
}

/**
 * Top-level error boundary.
 *
 * Catches any render error that bubbles up through the whole React tree and
 * shows a graceful recovery screen instead of a white page.  Without this,
 * a single uncaught render error after sign-in unmounts the entire app —
 * which is the root cause of the "white page on first sign-in" bug.
 *
 * A full reload is offered because render errors are usually transient
 * (stale state, race condition on first mount) and a clean load resolves them.
 */
export class AppErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: null };
  }

  static getDerivedStateFromError(error: unknown): State {
    const message =
      error instanceof Error ? error.message : "Une erreur inattendue s'est produite.";
    // Stale chunk after a deploy — auto-reload once instead of showing the error screen.
    if (typeof message === "string" && message.includes("Failed to fetch dynamically imported module")) {
      window.location.reload();
      return { hasError: false, message: null };
    }
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    // Log for observability — swap for a real error-reporting service if needed.
    console.error("[AppErrorBoundary] Caught render error:", error, info.componentStack);
  }

  handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#FAF6F0] flex flex-col items-center justify-center gap-6 p-6">
          <div className="flex flex-col items-center gap-1 text-center">
            <p className="text-base font-medium text-[#1A1A18]">PluralRoaster</p>
            <p className="text-sm text-[#6B6B63] max-w-xs">
              Quelque chose ne s'est pas chargé correctement.
            </p>
          </div>
          <button
            onClick={this.handleReload}
            className="h-10 px-5 rounded-lg bg-[#1A1A18] text-[#FAF6F0] text-sm font-medium transition-opacity hover:opacity-80 active:opacity-60"
          >
            Recharger la page
          </button>
          {this.state.message ? (
            <p className="text-xs text-[#9E9E93] max-w-xs text-center font-mono break-all">
              {this.state.message}
            </p>
          ) : null}
        </div>
      );
    }

    return this.props.children;
  }
}
