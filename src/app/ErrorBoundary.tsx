import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RotateCcw, TriangleAlert } from 'lucide-react';
import { ru } from '@/i18n/ru';

interface Props {
  children: ReactNode;
  /** `root` replaces the whole app; `screen` keeps the tab bar usable. */
  level?: 'root' | 'screen';
  /** Changing this value resets the boundary (e.g. route path). */
  resetKey?: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep a trace for debugging; there is no remote logging in v1.
    console.error('[WordFlow]', error, info.componentStack);
  }

  override render() {
    if (!this.state.error) return this.props.children;
    const isRoot = this.props.level === 'root';
    return (
      <div
        role="alert"
        className={`flex flex-col items-center justify-center gap-4 px-8 text-center ${
          isRoot ? 'app-shell pt-safe pb-safe' : 'h-full min-h-[60vh]'
        }`}
      >
        <div className="bg-accent-100 flex size-16 items-center justify-center rounded-full">
          <TriangleAlert aria-hidden="true" className="text-accent-700 size-8" />
        </div>
        <h1 className="text-title font-semibold">{isRoot ? ru.errors.title : ru.errors.screenTitle}</h1>
        <p className="text-muted max-w-sm">{ru.errors.body}</p>
        <div className="flex flex-wrap justify-center gap-3">
          {!isRoot && (
            <button
              type="button"
              className="text-primary-600 min-h-11 rounded-[15px] bg-white px-5 font-semibold shadow-card"
              onClick={() => this.setState({ error: null })}
            >
              {ru.common.retry}
            </button>
          )}
          <button
            type="button"
            className="bg-primary-500 text-on-primary flex min-h-11 items-center gap-2 rounded-[15px] px-5 font-semibold"
            onClick={() => window.location.reload()}
          >
            <RotateCcw aria-hidden="true" className="size-4" />
            {ru.common.reload}
          </button>
        </div>
      </div>
    );
  }
}
