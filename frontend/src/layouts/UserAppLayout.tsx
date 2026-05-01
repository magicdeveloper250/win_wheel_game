import { useState } from "react";
import {
  Link,
  Navigate,
  Outlet,
  useLocation,
} from "react-router-dom";
import {
  BarChart3,
  CircleDollarSign,
  CreditCard,
  Gamepad2,
  KeyRound,
  LogOut,
  Menu,
  Receipt,
  UserCircle2,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import useSession from "@/hooks/useSession";
import UserMoneyDialog from "@/components/ui/UserMoneyDialog";
import Logo from "@/components/ui/Logo";
import { UserRole } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

const links = [
  { to: "/app", label: "Dashboard", icon: BarChart3 },
  { to: "/app/transactions", label: "Transactions", icon: Receipt },
  { to: "/app/my-bets", label: "My Bets", icon: CircleDollarSign },
  { to: "/app/withdraw", label: "Withdraw", icon: Wallet },
  { to: "/app/change-password", label: "Change Password", icon: KeyRound },
  { to: "/app/profile", label: "Profile", icon: UserCircle2 },
  { to: "/app/game", label: "Game", icon: Gamepad2 },
  { to: "/logout", label: "Logout", icon: LogOut },
];

function NavContent({ onNavigate }: { onNavigate?: () => void }) {
  const location = useLocation();
  return (
    <nav className="grid gap-1 p-2">
      {links.map((item) => {
        const active = location.pathname === item.to;
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition ${
              active
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
          >
            <Icon size={16} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export default function UserAppLayout() {
  const [depositOpen, setDepositOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { session } = useSession();

  return session?.role !== UserRole.USER ? (
    <Navigate to="/unauthorized" replace />
  ) : (
    <div className="min-h-screen bg-background text-foreground flex">
      <aside className="hidden md:flex w-64 border-r border-border bg-card flex-col">
        <div className="h-14 flex items-center px-4 font-bold tracking-tight border-b border-border">
          <Logo />
        </div>
        <NavContent />
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-14 border-b border-border bg-card px-3 md:px-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="md:hidden">
                  <Menu size={16} />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-64">
                <div className="h-14 flex items-center px-4 border-b border-border font-semibold">
                  <Logo />
                </div>
                <NavContent onNavigate={() => setMobileOpen(false)} />
              </SheetContent>
            </Sheet>
            <div className="text-sm text-muted-foreground hidden sm:block">
              Welcome,
            </div>
            <div className="font-semibold text-sm sm:text-base truncate  ">
              {session?.name.split(" ")[0] ?? "User"}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant={"outline"} className="font-bold text-md p-4">{Number(session?.balance).toFixed(2)}</Badge>
            <Button onClick={() => setDepositOpen(true)} className="gap-2">
              <CreditCard size={16} /> Deposit
            </Button>
             
          </div>
        </header>

        <main className="p-3 md:p-4 lg:p-6 flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>

      <UserMoneyDialog
        open={depositOpen}
        onOpenChange={setDepositOpen}
        action="deposit"
      />
    </div>
  );
}
