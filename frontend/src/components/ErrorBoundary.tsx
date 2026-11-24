import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Button } from './ui/button';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary] Render error:', error, info.componentStack);
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    const { children, fallback } = this.props;

    if (error) {
      if (fallback) {
        return fallback(error, this.reset);
      }

      return (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>
            <p className="mb-3 break-words">{error.message || 'Unexpected error while rendering this page.'}</p>
            <Button variant="outline" size="sm" onClick={this.reset}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      );
    }

    return children;
  }
}
