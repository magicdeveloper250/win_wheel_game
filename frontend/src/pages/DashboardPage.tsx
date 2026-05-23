import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Users,
  Layers,
  Activity,
  Clock,
  Ticket,
  TrendingUp,
  TrendingDown,
  DollarSign,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from "lucide-react";
import { toast } from "sonner";
import { isAxiosError } from "axios";
import useUserAxios from "@/hooks/useUserAxios";

// ─── Types ────────────────────────────────────────────────────────────────────
interface DashboardStats {
  totalUsers: number;
  totalSessions: number;
  activeSessions: number;
  upcomingSessions: number;
  totalBets: number;
  totalRevenue: number | string;
  totalPayouts: number | string;
  netProfit: number | string;
}

interface RecentTransaction {
  id: string;
  amount: number | string;
  type: string;
  createdAt: string;
  user: { id: string; name: string; email: string };
}

interface RecentBet {
  id: string;
  amount: number | string;
  targetNumber: number;
  createdAt: string;
  user: { id: string; name: string };
  session: { id: string; sessionNumber: number };
}

interface DashboardData {
  stats: DashboardStats;
  recentTransactions: RecentTransaction[];
  recentBets: RecentBet[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(val: number | string, decimals = 2): string {
  const n = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(n)) return "0.00";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtInt(val: number | string): string {
  const n = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(n)) return "0";
  return Math.round(n).toLocaleString("en-US");
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const TX_TYPE_CONFIG: Record<
  string,
  { label: string; color: string; icon: typeof ArrowUpRight }
> = {
  BET: { label: "Bet", color: "text-yellow-500", icon: ArrowDownRight },
  WIN_PAYOUT: { label: "Win", color: "text-green-500", icon: ArrowUpRight },
  DEPOSIT: { label: "Deposit", color: "text-blue-400", icon: ArrowUpRight },
  WITHDRAWAL: {
    label: "Withdraw",
    color: "text-red-400",
    icon: ArrowDownRight,
  },
};

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
  loading,
  prefix = "",
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  accent: string;
  loading: boolean;
  prefix?: string;
}) {
  return (
    <div className="relative rounded-xl border border-border bg-card p-5 flex flex-col gap-3 overflow-hidden group hover:border-border/80 transition-all">
      {/* Subtle accent glow */}
      <div
        className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none ${accent} blur-2xl`}
      />

      <div className="flex items-center justify-between relative">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
          {label}
        </span>
        <div className={`p-2 rounded-lg bg-muted/60`}>
          <Icon size={14} className="text-muted-foreground" />
        </div>
      </div>

      <div className="relative">
        {loading ? (
          <Skeleton className="h-8 w-28 rounded" />
        ) : (
          <p className="text-2xl font-bold text-foreground tracking-tight">
            {prefix}
            {value}
          </p>
        )}
        {sub && !loading && (
          <p className="text-xs text-muted-foreground mt-1">{sub}</p>
        )}
      </div>
    </div>
  );
}

// ─── Profit card (special — shows positive/negative clearly) ─────────────────
function ProfitCard({
  value,
  loading,
}: {
  value: number | string;
  loading: boolean;
}) {
  const n = typeof value === "string" ? parseFloat(value) : value;
  const isPositive = n >= 0;
  const isZero = n === 0;

  return (
    <div
      className={`relative rounded-xl border bg-card p-5 flex flex-col gap-3 overflow-hidden group transition-all
        ${isZero ? "border-border" : isPositive ? "border-green-500/30 shadow-sm shadow-green-500/10" : "border-red-500/30 shadow-sm shadow-red-500/10"}
      `}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
          Net Profit
        </span>
        <div className="p-2 rounded-lg bg-muted/60">
          {isZero ? (
            <Minus size={14} className="text-muted-foreground" />
          ) : isPositive ? (
            <TrendingUp size={14} className="text-green-500" />
          ) : (
            <TrendingDown size={14} className="text-red-400" />
          )}
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-8 w-28 rounded" />
      ) : (
        <p
          className={`text-2xl font-bold   tracking-tight
            ${isZero ? "text-foreground" : isPositive ? "text-green-500" : "text-red-400"}
          `}
        >
          {isPositive && !isZero ? "+" : ""}
          {fmt(n)}
        </p>
      )}
      <p className="text-xs text-muted-foreground">Revenue minus payouts</p>
    </div>
  );
}

// ─── Main dashboard ───────────────────────────────────────────────────────────
function DashboardPage() {
  const axios = useUserAxios();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get("/dashboard");
      setData(res.data);
    } catch (err) {
      const msg = isAxiosError(err)
        ? (err.response?.data?.error ?? err.message)
        : "Failed to load dashboard.";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const stats = data?.stats;

  if (error && !data) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center px-6">
        <p className="text-sm text-destructive font-medium">{error}</p>
        <Button variant="outline" size="sm" onClick={load} className="gap-2">
          <RefreshCw size={13} /> Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 min-h-full bg-background">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">
            Dashboard
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Live overview of game activity
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          onClick={load}
          disabled={loading}
          title="Refresh"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </Button>
      </div>

      {/* ── Stat grid ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Total Users"
          value={loading ? "" : fmtInt(stats?.totalUsers ?? 0)}
          icon={Users}
          accent="bg-blue-500/5"
          loading={loading}
        />
        <StatCard
          label="Total Sessions"
          value={loading ? "" : fmtInt(stats?.totalSessions ?? 0)}
          sub={`${fmtInt(stats?.activeSessions ?? 0)} active · ${fmtInt(stats?.upcomingSessions ?? 0)} upcoming`}
          icon={Layers}
          accent="bg-indigo-500/5"
          loading={loading}
        />
        <StatCard
          label="Active Now"
          value={loading ? "" : fmtInt(stats?.activeSessions ?? 0)}
          icon={Activity}
          accent="bg-green-500/5"
          loading={loading}
        />
        <StatCard
          label="Upcoming"
          value={loading ? "" : fmtInt(stats?.upcomingSessions ?? 0)}
          icon={Clock}
          accent="bg-yellow-500/5"
          loading={loading}
        />
      </div>

      {/* ── Financial row ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Total Bets"
          value={loading ? "" : fmtInt(stats?.totalBets ?? 0)}
          icon={Ticket}
          accent="bg-orange-500/5"
          loading={loading}
        />
        <StatCard
          label="Revenue"
          value={loading ? "" : fmt(stats?.totalRevenue ?? 0)}
          icon={DollarSign}
          accent="bg-emerald-500/5"
          loading={loading}
        />
        <StatCard
          label="Payouts"
          value={loading ? "" : fmt(stats?.totalPayouts ?? 0)}
          icon={TrendingDown}
          accent="bg-red-500/5"
          loading={loading}
        />
        <ProfitCard value={stats?.netProfit ?? 0} loading={loading} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-border overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
            <span className="text-sm font-semibold text-foreground">
              Recent Transactions
            </span>
            <span className="text-xs text-muted-foreground">Last 10</span>
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                    User
                  </TableHead>
                  <TableHead className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                    Type
                  </TableHead>
                  <TableHead className="text-xs text-muted-foreground uppercase tracking-wider font-semibold text-right">
                    Amount
                  </TableHead>
                  <TableHead className="text-xs text-muted-foreground uppercase tracking-wider font-semibold text-right">
                    Time
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i} className="border-border">
                      {Array.from({ length: 4 }).map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full rounded" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : !data?.recentTransactions.length ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-center py-8 text-muted-foreground text-sm"
                    >
                      No transactions yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.recentTransactions.map((tx) => {
                    const cfg = TX_TYPE_CONFIG[tx.type] ?? {
                      label: tx.type,
                      color: "text-muted-foreground",
                      icon: Minus,
                    };
                    const TxIcon = cfg.icon;
                    return (
                      <TableRow
                        key={tx.id}
                        className="border-border hover:bg-muted/20"
                      >
                        <TableCell className="text-sm">
                          <p className="font-medium text-foreground truncate max-w-27.5">
                            {tx.user.name || tx.user.email}
                          </p>
                          <p className="text-xs text-muted-foreground truncate max-w-27.5">
                            {tx.user.email}
                          </p>
                        </TableCell>
                        <TableCell>
                          <div
                            className={`inline-flex items-center gap-1 text-xs font-semibold ${cfg.color}`}
                          >
                            <TxIcon size={11} />
                            {cfg.label}
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-sm font-semibold text-foreground">
                          {fmt(tx.amount)}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground whitespace-nowrap">
                          {timeAgo(tx.createdAt)}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Mobile list */}
          <div className="flex flex-col divide-y divide-border sm:hidden">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                    <div className="space-y-1.5 min-w-0">
                      <Skeleton className="h-3 w-24 rounded" />
                      <Skeleton className="h-2.5 w-16 rounded" />
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <Skeleton className="h-3 w-14 rounded" />
                    <Skeleton className="h-2.5 w-10 rounded" />
                  </div>
                </div>
              ))
            ) : !data?.recentTransactions.length ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No transactions yet.
              </div>
            ) : (
              data.recentTransactions.map((tx) => {
                const cfg = TX_TYPE_CONFIG[tx.type] ?? {
                  label: tx.type,
                  color: "text-muted-foreground",
                  icon: Minus,
                };
                const TxIcon = cfg.icon;
                return (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <TxIcon size={13} className={cfg.color} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {tx.user.name || tx.user.email}
                        </p>
                        <div
                          className={`inline-flex items-center gap-1 text-xs font-semibold ${cfg.color}`}
                        >
                          {cfg.label}
                          <span className="text-muted-foreground font-normal">
                            · {timeAgo(tx.createdAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <p className="text-sm font-bold text-foreground shrink-0">
                      {fmt(tx.amount)}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Recent Bets */}
        <div className="rounded-xl border border-border overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
            <span className="text-sm font-semibold text-foreground">
              Recent Bets
            </span>
            <span className="text-xs text-muted-foreground">Last 10</span>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                    Player
                  </TableHead>
                  <TableHead className="text-xs text-muted-foreground uppercase tracking-wider font-semibold text-center">
                    Number
                  </TableHead>
                  <TableHead className="text-xs text-muted-foreground uppercase tracking-wider font-semibold text-right">
                    Amount
                  </TableHead>
                  <TableHead className="text-xs text-muted-foreground uppercase tracking-wider font-semibold text-right">
                    Time
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i} className="border-border">
                      {Array.from({ length: 4 }).map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full rounded" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : !data?.recentBets.length ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-center py-8 text-muted-foreground text-sm"
                    >
                      No bets placed yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  data?.recentBets.map((bet) => (
                    <TableRow
                      key={bet.id}
                      className="border-border hover:bg-muted/20"
                    >
                      <TableCell className="text-sm">
                        <p className="font-medium text-foreground truncate max-w-30">
                          {bet?.user?.name}
                        </p>
                        <p className="text-xs text-muted-foreground  ">
                          SID-{bet.session.id}
                        </p>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary text-sm font-bold   border border-primary/20">
                          {bet.targetNumber}
                        </span>
                      </TableCell>
                      <TableCell className="text-right   text-sm font-semibold text-foreground">
                        {fmt(bet.amount)}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground whitespace-nowrap">
                        {timeAgo(bet.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DashboardPage;
