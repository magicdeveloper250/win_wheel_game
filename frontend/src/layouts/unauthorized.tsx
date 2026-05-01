import { Shield, ArrowLeft, Home, RefreshCw } from 'lucide-react';

const UnauthorizedPage: React.FC = () => {
  const handleGoBack = () => {
    // Check if there's history to go back to
    if (window.history.length > 1) {
      window.history.back();
    } else {
      // Fallback to home if no history
      window.location.href = '/';
    }
  };

  const handleGoHome = () => {
    window.location.href = '/';
  };

  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background flex items-center justify-center p-4">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-secondary rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse" style={{animationDelay: '2s'}}></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-accent rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse" style={{animationDelay: '4s'}}></div>
      </div>

      <div className="relative z-10 max-w-md w-full">
        {/* Glass morphism card */}
        <div className="bg-card/10 backdrop-blur-lg rounded-3xl p-8 shadow-2xl border border-border/20">
          {/* Icon with animation */}
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="w-20 h-20 bg-destructive/20 rounded-full flex items-center justify-center animate-pulse">
                <Shield className="w-10 h-10 text-destructive-foreground" />
              </div>
              <div className="absolute inset-0 w-20 h-20 border-2 border-destructive/30 rounded-full animate-ping"></div>
            </div>
          </div>

          {/* Error code */}
          <div className="text-center mb-4">
            <h1 className="text-6xl font-bold text-foreground mb-2 tracking-tight">
              4<span className="text-destructive">0</span>1
            </h1>
            <h2 className="text-2xl font-semibold text-foreground/90 mb-2">
              Unauthorized Access
            </h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              You don't have permission to access this resource. Please check your credentials or contact your administrator.
            </p>
          </div>

          {/* Action buttons */}
          <div className="space-y-3 mt-8">
            <button
              onClick={handleGoBack}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-3 px-4 rounded-xl transition-all duration-200 transform hover:scale-105 hover:shadow-lg flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-5 h-5" />
              Go Back
            </button>
            
            <div className="flex gap-3">
              <button
                onClick={handleGoHome}
                className="flex-1 bg-secondary hover:bg-secondary/80 text-secondary-foreground font-semibold py-3 px-4 rounded-xl transition-all duration-200 border border-border flex items-center justify-center gap-2"
              >
                <Home className="w-4 h-4" />
                Home
              </button>
              
              <button
                onClick={handleRefresh}
                className="flex-1 bg-secondary hover:bg-secondary/80 text-secondary-foreground font-semibold py-3 px-4 rounded-xl transition-all duration-200 border border-border flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Retry
              </button>
            </div>
          </div>
        </div>

        {/* Floating particles */}
        <div className="absolute top-0 left-0 w-2 h-2 bg-muted-foreground/30 rounded-full animate-bounce" style={{animationDelay: '1s'}}></div>
        <div className="absolute top-10 right-10 w-1 h-1 bg-accent/50 rounded-full animate-bounce" style={{animationDelay: '2s'}}></div>
        <div className="absolute bottom-10 left-10 w-1.5 h-1.5 bg-accent/50 rounded-full animate-bounce" style={{animationDelay: '3s'}}></div>
      </div>
    </div>
  );
};

export default UnauthorizedPage;