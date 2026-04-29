import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Unauthorized() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="text-center max-w-md w-full">

        {/* Large 401 */}
        <div className="relative mb-8 select-none">
          <span className="text-[10rem] font-black leading-none text-muted/20 block">
            401
          </span>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-card border border-border rounded-2xl px-6 py-3 shadow-lg">
              <div className="flex items-center gap-2 text-muted-foreground">
                <ShieldOff size={18} className="text-destructive" />
                <span className="text-sm font-medium">Unauthorized</span>
              </div>
            </div>
          </div>
        </div>

        {/* Text */}
        <h1 className="text-2xl font-bold text-foreground mb-2 tracking-tight">
          Access denied
        </h1>
        <p className="text-muted-foreground text-sm mb-8 leading-relaxed">
          You don't have permission to view this page.
          Please log in with the correct account or go back.
        </p>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button variant="destructive" asChild>
            <Link to="/login">Log in</Link>
          </Button>
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft size={15} className="mr-1.5" />
            Go back
          </Button>
        </div>

      </div>
    </div>
  );
}
