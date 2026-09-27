import { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home, ChevronDown, ChevronUp, Zap } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  showDetails: boolean;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, showDetails: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined, showDetails: false });
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  categorizeError(error: Error): { title: string; suggestion: string; alternatives: { label: string; action: () => void; icon: typeof RefreshCw }[] } {
    const msg = error.message.toLowerCase();
    
    if (msg.includes('chunk') || msg.includes('loading') || msg.includes('dynamically imported')) {
      return {
        title: 'Component failed to load',
        suggestion: 'This usually happens when the app updates. A quick refresh should fix it.',
        alternatives: [
          { label: 'Refresh page', action: () => window.location.reload(), icon: RefreshCw },
          { label: 'Go to dashboard', action: () => { window.location.href = '/dashboard'; }, icon: Home },
        ],
      };
    }
    if (msg.includes('network') || msg.includes('fetch')) {
      return {
        title: 'Network error',
        suggestion: 'Check your internet connection and try again.',
        alternatives: [
          { label: 'Retry', action: this.handleReset, icon: RefreshCw },
        ],
      };
    }
    if (msg.includes('permission') || msg.includes('auth')) {
      return {
        title: 'Permission denied',
        suggestion: 'Your session may have expired. Try logging in again.',
        alternatives: [
          { label: 'Return home', action: this.handleGoHome, icon: Home },
          { label: 'Retry', action: this.handleReset, icon: RefreshCw },
        ],
      };
    }
    return {
      title: 'Something went wrong',
      suggestion: 'This component encountered an error. Your other tabs should still work.',
      alternatives: [
        { label: 'Try again', action: this.handleReset, icon: RefreshCw },
        { label: 'Go home', action: this.handleGoHome, icon: Home },
      ],
    };
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const info = this.state.error ? this.categorizeError(this.state.error) : {
        title: 'Something went wrong',
        suggestion: 'Try refreshing the page.',
        alternatives: [{ label: 'Try again', action: this.handleReset, icon: RefreshCw }],
      };

      return (
        <div className="flex flex-col items-center justify-center h-full gap-6 p-8">
          <div className="flex flex-col items-center gap-3 max-w-md">
            <div className="p-3 rounded-2xl bg-destructive/10 border border-destructive/20">
              <AlertTriangle className="h-8 w-8 text-destructive/60" />
            </div>
            <h3 className="text-lg font-light text-foreground text-center">
              {info.title}
            </h3>
            <p className="text-sm text-muted-foreground text-center font-light leading-relaxed">
              {info.suggestion}
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3">
            {info.alternatives.map((alt, idx) => (
              <button
                key={idx}
                onClick={alt.action}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-light transition-colors border ${
                  idx === 0
                    ? "bg-accent/10 text-accent border-accent/20 hover:bg-accent/20"
                    : "bg-card/30 text-muted-foreground border-border/20 hover:text-foreground hover:bg-card/50"
                }`}
              >
                <alt.icon className="h-4 w-4" />
                {alt.label}
              </button>
            ))}
          </div>
            
          {/* Technical details expandable */}
          {this.state.error && (
            <div className="w-full max-w-lg">
              <button
                onClick={() => this.setState(s => ({ showDetails: !s.showDetails }))}
                className="flex items-center gap-2 text-xs text-muted-foreground/40 hover:text-muted-foreground transition-colors mx-auto"
              >
                {this.state.showDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                Technical details
              </button>
              {this.state.showDetails && (
                <div className="mt-3 rounded-xl border border-border/20 bg-card/30 backdrop-blur-sm overflow-hidden">
                  <div className="px-3 py-2 border-b border-border/10">
                    <p className="text-[10px] font-mono text-destructive/60">{this.state.error.name}: {this.state.error.message}</p>
                  </div>
                  <pre className="p-3 text-[9px] text-muted-foreground/50 overflow-auto max-h-32 font-mono leading-4">
                    {this.state.error.stack}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* Alternative action hint */}
          <p className="text-[10px] text-muted-foreground/30 font-light">
            If this keeps happening, try clearing your browser cache or contact support.
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
