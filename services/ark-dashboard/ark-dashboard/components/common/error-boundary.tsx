'use client';

import { AlertCircle, RefreshCw } from 'lucide-react';
import { Component, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <Card className="flex flex-1 items-center justify-center">
          <CardContent className="flex flex-col items-center gap-4 p-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-950">
              <AlertCircle className="h-10 w-10 text-red-600 dark:text-red-400" />
            </div>
            <CardHeader className="p-0 text-center">
              <CardTitle className="text-xl">Something went wrong</CardTitle>
              <p className="text-muted-foreground mt-2 text-sm">
                {this.state.error?.message || 'An unexpected error occurred'}
              </p>
            </CardHeader>
            <Button onClick={this.handleReset} variant="outline">
              <RefreshCw className="mr-2 h-4 w-4" />
              Try again
            </Button>
          </CardContent>
        </Card>
      );
    }

    return this.props.children;
  }
}
