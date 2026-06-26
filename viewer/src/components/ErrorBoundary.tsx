import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Changing this resets the boundary (e.g. when the selected entry changes). */
  resetKey?: unknown;
}

interface State {
  error: Error | null;
}

/**
 * Catches render-time errors in its subtree so a single malformed entry can't
 * blank out the whole viewer. Resets automatically when `resetKey` changes.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prevProps: Props) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-gray-400 dark:text-gray-500 p-6 text-center">
          <span>Something went wrong rendering this view.</span>
          <span className="font-mono text-xs text-gray-400 dark:text-gray-600 break-all">
            {this.state.error.message}
          </span>
        </div>
      );
    }
    return this.props.children;
  }
}
