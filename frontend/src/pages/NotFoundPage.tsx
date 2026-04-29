import { Link } from "react-router-dom";
import { ArrowLeft, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="text-center max-w-md w-full">

        {/* Large 404 */}
        <div className="relative mb-8 select-none">
          <span className="text-[10rem] font-black leading-none text-muted/20 block">
            404
          </span>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-card border border-border rounded-2xl px-6 py-3 shadow-lg">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Compass size={18} className="text-primary animate-spin" style={{ animationDuration: "4s" }} />
                <span className="text-sm font-medium">Page not found</span>
              </div>
            </div>
          </div>
        </div>

        {/* Text */}
        <h1 className="text-2xl font-bold text-foreground mb-2 tracking-tight">
          Lost in the wheel?
        </h1>
        <p className="text-muted-foreground text-sm mb-8 leading-relaxed">
          The page you're looking for doesn't exist or has been moved.
          Let's get you back on track.
        </p>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button asChild>
            <Link to="/dashboard">
              <ArrowLeft size={15} className="mr-1.5" />
              Back to Dashboard
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/games">View Game Sessions</Link>
          </Button>
        </div>

      </div>
    </div>
  );
}
