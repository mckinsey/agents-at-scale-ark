'use client';

import React, { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

import { trackError } from './singleton';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class AnalyticsErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    trackError({
      message: error.message,
      stack: error.stack,
      severity: 'error',
      context: {
        type: 'react_error_boundary',
        componentStack: errorInfo.componentStack,
      },
    });
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex h-full flex-col items-center justify-center p-8">
          <h2 className="mb-4 text-xl font-semibold">Something went wrong</h2>
          <p className="text-muted-foreground mb-4 text-center">
            An unexpected error occurred. Please try refreshing the page.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="bg-primary text-primary-foreground rounded px-4 py-2">
            Refresh Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
