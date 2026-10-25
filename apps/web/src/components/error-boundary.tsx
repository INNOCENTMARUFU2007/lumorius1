
'use client';

import React from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  // Compatibility with React 18 JSX type definitions in the workspace.
  declare refs: Record<string, any>;

  constructor(props: Props) {
    super(props);

    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[Lumorius ErrorBoundary]', error, info);

    if (typeof window !== 'undefined') {
      const sentry = (
        window as Window & {
          Sentry?: {
            captureException?: (error: Error) => void;
          };
        }
      ).Sentry;

      sentry?.captureException?.(error);
    }
  }

  private handleRetry = (): void => {
    this.setState({
      hasError: false,
      error: null,
    });
  };

  render(): any {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return <>{this.props.fallback}</>;
      }

      return (
        <div className="flex min-h-[400px] flex-col items-center justify-center p-8 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10">
            <AlertTriangle className="h-7 w-7 text-red-500" />
          </div>

          <h2 className="mb-2 text-lg font-semibold">
            Something went wrong
          </h2>

          <p className="mb-6 max-w-sm text-sm text-muted-foreground">
            {this.state.error?.message ??
              'An unexpected error occurred. Please try again.'}
          </p>

          <button
            type="button"
            onClick={this.handleRetry}
            className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-700"
          >
            <RefreshCw className="h-4 w-4" />
            Try again
          </button>
        </div>
      );
    }

    return <>{this.props.children}</>;
  }
}
