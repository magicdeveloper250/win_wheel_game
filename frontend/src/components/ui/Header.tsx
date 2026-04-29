import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
 
import { Link, useLocation } from "react-router-dom";
import useSession from "@/hooks/useSession";
import { routeTitles } from "@/lib/routeUtils";

  

 

export default function Header() {
  const location = useLocation();
  const { session } = useSession();

  const pageTitle = routeTitles[location.pathname] ?? "Win Wheel";

  return (
    <header className="h-14 shrink-0 border-b border-border bg-card flex items-center justify-between gap-4 px-4 md:px-6">

      {/* Page title */}
      <h1 className="text-sm font-semibold text-foreground tracking-tight hidden sm:block">
        {pageTitle}
      </h1>

      

      

      {/* Avatar dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 px-1.5 gap-2 text-muted-foreground hover:text-foreground hover:bg-accent">
            <Avatar className="w-6 h-6">
              <AvatarImage
                src="https://github.com/shadcn.png"
                alt={session?.name ?? "User"}
                className="grayscale"
              />
              <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
                {session?.name?.slice(0, 2).toUpperCase() ?? "WW"}
              </AvatarFallback>
            </Avatar>
            <span className="text-xs font-medium hidden md:block">
              {session?.name ?? "Admin"}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48 bg-card border-border p-2">
          <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
            {session?.name ?? ""}
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-border" />
          <DropdownMenuItem asChild>
            <Link to="/settings" className="cursor-pointer text-sm">
              Settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-border" />
          <DropdownMenuItem className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer text-sm">
           <Link to="/Logout" className="cursor-pointer text-sm">
              Logout
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

    </header>
  );
}