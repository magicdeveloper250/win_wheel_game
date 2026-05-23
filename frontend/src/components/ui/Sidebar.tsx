import {
  ChevronLeft,
  ChevronRight,
  CurrencyIcon,
  Gamepad2,
  Key,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Users,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import useSession from "@/hooks/useSession";
import Logo from "./Logo";

const menuItems = [
  { name: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
  { name: "Game Sessions", path: "/sessions", icon: Gamepad2 },
  { name: "Financials", path: "/financials", icon: CurrencyIcon },
  { name: "Settings", path: "/settings", icon: Settings },
  { name: "Users", path: "/users", icon: Users },
   { name: "Profile", path: "/profile", icon: Users },
    { name: "Change Password", path: "/change-password", icon: Key },
];

function SidebarContent({
  isExpanded,
  onNavigate,
}: {
  isExpanded?: boolean;
  onNavigate?: () => void;
}) {
  const location = useLocation();
  const { session } = useSession();
  const navigate= useNavigate()

  return (
    <div className="flex flex-col h-full">
      <nav className="flex flex-col gap-1 p-2 flex-1 mt-4">
        {menuItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={onNavigate}
              title={isExpanded === false ? item.name : undefined}
              className={`
                flex items-center gap-3 px-3 py-2.5 rounded-md
                text-sm font-medium transition-all duration-150 group
                ${
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                }
              `}
            >
              <item.icon
                size={18}
                className={`shrink-0 transition-colors ${
                  isActive ? "text-primary" : "group-hover:text-foreground"
                }`}
              />
              {isExpanded !== false && (
                <span className="whitespace-nowrap overflow-hidden">
                  {item.name}
                </span>
              )}
              {isActive && isExpanded !== false && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-border shrink-0">
        <div
          className={`flex items-center gap-3 ${
            isExpanded === false ? "justify-center" : ""
          }`}
        >
          <Avatar className="w-8 h-8 shrink-0">
            <AvatarImage
              src="https://github.com/shadcn.png"
              alt={session?.name ?? "User"}
              className="grayscale"
            />
            <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
              {session?.name?.slice(0, 2).toUpperCase() ?? "WW"}
            </AvatarFallback>
          </Avatar>

          {isExpanded !== false && (
            <div className="flex-1 overflow-hidden">
              <p className="text-foreground text-xs font-semibold truncate">
                {session?.name ?? "Admin"}
              </p>
              <p className="text-muted-foreground text-xs truncate">
                {session?.email ?? ""}
              </p>
            </div>
          )}

          {isExpanded !== false && (
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 w-8 h-8"
              title="Logout"
              onClick={()=>navigate("/logout")}
            >
              <LogOut size={15} />
            </Button>
          )}
        </div>

        {isExpanded === false && (
          <Button
            variant="ghost"
            size="icon"
            className="w-full mt-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 h-8"
            title="Logout"
            onClick={()=>navigate("/logout")}
          >
            <LogOut size={15} />
          </Button>
        )}
      </div>
    </div>
  );
}

function DesktopSidebar() {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <aside
      className={`
        hidden md:flex flex-col h-screen border-r border-border bg-card
        overflow-hidden transition-all duration-300 ease-in-out shrink-0
        ${isExpanded ? "w-60" : "w-17"}
      `}
    >
      <div className="flex items-center justify-between px-3 h-14 border-b border-border shrink-0">
        {isExpanded && (
          <Link
            to="/dashboard"
            className="text-card-foreground font-bold text-base tracking-tight whitespace-nowrap"
          >
            <Logo/>
          </Link>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsExpanded((e) => !e)}
          className={`
            text-muted-foreground hover:text-foreground hover:bg-accent w-8 h-8 shrink-0
            ${!isExpanded ? "mx-auto" : "ml-auto"}
          `}
          aria-label={isExpanded ? "Collapse sidebar" : "Expand sidebar"}
        >
          {isExpanded ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </Button>
      </div>

      <SidebarContent isExpanded={isExpanded} />
    </aside>
  );
}

function MobileSidebar() {
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden flex items-center justify-between px-4 h-14 border-b border-border bg-card shrink-0">
      <Link
        to="/dashboard"
        className="text-card-foreground font-bold text-base tracking-tight"
      >
        Win<span className="text-primary">Wheel</span>
      </Link>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground hover:bg-accent w-8 h-8"
          >
            <Menu size={18} />
          </Button>
        </SheetTrigger>

        <SheetContent
          side="left"
          className="w-64 p-0 bg-card border-r border-border"
        >
          <div className="flex items-center px-4 h-14 border-b border-border">
            <Link
              to="/dashboard"
              className="text-card-foreground font-bold text-base tracking-tight"
              onClick={() => setOpen(false)}
            >
              Win<span className="text-primary">Wheel</span>
            </Link>
          </div>
          <SidebarContent onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}

export function Sidebar() {
  return (
    <>
      <DesktopSidebar />
      <MobileSidebar />
    </>
  );
}

export default Sidebar;