import { useEffect, useState } from "react";
import { toast } from "sonner";
import { isAxiosError } from "axios";
import {
  Wallet,
  TrendingUp,
  Shield,
  Percent,
  RefreshCw,
  Save,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import useUserAxios from "@/hooks/useUserAxios";

// ── Types ─────────────────────────────────────────────────────────────────────
interface FinancialSettings {
  id: string;
  minBetAmount: number;
  maxBetAmount: number;
  taxPercentage: number;
  houseEdgePercentage: number;
}

interface Transaction {
  id: string;
  amount: number;
  type: string;
  tax: number;
  createdAt: string;
  user: { id: string; name: string; email: string };
}

interface TransactionPage {
  data: Transaction[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  totals: {
    overrallAmount: number;
    totalBets: number;
    totalPayouts: number;
  };
}
const TYPE_CONFIG: Record<string, { label: string; color: string; icon: typeof ArrowUpRight }> = {
  BET:        { label: "Bet",        color: "text-yellow-400", icon: ArrowDownRight },
  WIN_PAYOUT: { label: "Win",        color: "text-emerald-400", icon: ArrowUpRight },
  DEPOSIT:    { label: "Deposit",    color: "text-sky-400",    icon: ArrowUpRight },
  WITHDRAWAL: { label: "Withdrawal", color: "text-rose-400",   icon: ArrowDownRight },
};
function fmt(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "RWF",
  }).format(n);
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  accent: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className={`absolute -right-4 -top-4 h-20 w-20 rounded-full opacity-10 ${accent}`} />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-widest text-muted-foreground truncate">
            {label}
          </p>
          <p className="mt-1.5 text-lg sm:text-2xl font-bold text-foreground leading-tight break-all">
            {value}
          </p>
          {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
        </div>
        <div className={`rounded-lg p-2 shrink-0 ${accent} bg-opacity-10`}>
          <Icon size={16} className={accent.replace("bg-", "text-")} />
        </div>
      </div>
    </div>
  );
}

// ── Settings form ─────────────────────────────────────────────────────────────
function SettingsForm({
  settings,
  onSaved,
}: {
  settings: FinancialSettings | null;
  onSaved: () => void;
}) {
  const axios = useUserAxios();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    minBetAmount:       settings?.minBetAmount       ?? 0,
    maxBetAmount:       settings?.maxBetAmount       ?? 0,
    taxPercentage:      settings?.taxPercentage      ?? 0,
    houseEdgePercentage:settings?.houseEdgePercentage ?? 0,
  });

  useEffect(() => {
    if (settings) {
      setForm({
        minBetAmount:        settings.minBetAmount,
        maxBetAmount:        settings.maxBetAmount,
        taxPercentage:       settings.taxPercentage,
        houseEdgePercentage: settings.houseEdgePercentage,
      });
    }
  }, [settings]);

  const field = (
    key: keyof typeof form,
    label: string,
    icon: React.ElementType,
    suffix?: string,
  ) => {
    const Icon = icon;
    return (
      <div className="grid gap-1.5">
        <Label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          <Icon size={12} />
          {label}
        </Label>
        <div className="relative">
          <Input
            type="number"
            min={0}
            step="0.01"
            value={form[key]}
            onChange={(e) =>
              setForm((p) => ({ ...p, [key]: Number(e.target.value) }))
            }
            className="bg-background pr-12 text-foreground border-border  "
          />
          {suffix && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground select-none">
              {suffix}
            </span>
          )}
        </div>
      </div>
    );
  };

  const handleSave = async () => {
    if (form.minBetAmount >= form.maxBetAmount) {
      toast.error("Min bet must be less than max bet.");
      return;
    }
    setSaving(true);
    try {
      await axios.put("/settings/financial", form);
      toast.success("Financial settings saved.");
      onSaved();
    } catch (err) {
      toast.error(
        isAxiosError(err)
          ? (err.response?.data?.error ?? err.message)
          : "Failed to save.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-6">
      <div className="mb-5 flex items-center gap-3">
        <div className="rounded-lg bg-primary/10 p-2.5 shrink-0">
          <Shield size={16} className="text-primary" />
        </div>
        <div className="min-w-0">
          <h2 className="font-bold text-foreground text-sm sm:text-base">Financial Settings</h2>
          <p className="text-xs text-muted-foreground">
            Configure betting limits, tax, and house edge
          </p>
        </div>
      </div>

      {/* Single column on mobile, 2 cols on sm+ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {field("minBetAmount",        "Min Bet Amount",  Wallet,    "RWF")}
        {field("maxBetAmount",        "Max Bet Amount",  TrendingUp,"RWF")}
        {field("taxPercentage",       "Tax Percentage",  Percent,   "%"  )}
        {field("houseEdgePercentage", "House Edge",      Shield,    "%"  )}
      </div>

      <div className="mt-5 flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="gap-2 w-full sm:w-auto">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saving ? "Saving…" : "Save Settings"}
        </Button>
      </div>
    </div>
  );
}

// ── Transaction row ───────────────────────────────────────────────────────────
function TxRow({ tx }: { tx: Transaction }) {
  const cfg = TYPE_CONFIG[tx.type] ?? {
    label: tx.type,
    color: "text-muted-foreground",
    icon: ArrowUpRight,
  };
  const Icon = cfg.icon;

  return (
    <div className="flex items-start sm:items-center justify-between gap-3 border-b border-border py-3 last:border-0">
      {/* Left: icon + user info */}
      <div className="flex items-start sm:items-center gap-3 min-w-0">
        <div className="rounded-full p-1.5 bg-muted shrink-0 mt-0.5 sm:mt-0">
          <Icon size={12} className={cfg.color} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{tx.user.name}</p>
          {/* Email hidden on very small screens, shown on sm+ */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
            <span className="hidden sm:flex items-center gap-1">
              <User size={10} />
              {tx.user.email}
            </span>
            <span className="flex items-center gap-1">
              <Clock size={10} />
              <span className="hidden sm:inline">{new Date(tx.createdAt).toLocaleString()}</span>
              {/* Compact date on mobile */}
              <span className="sm:hidden">{new Date(tx.createdAt).toLocaleDateString()}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Right: amount + type badge — always visible, never clips */}
      <div className="text-right shrink-0">
        <p className={`text-sm font-bold   ${cfg.color}`}>
          {tx.type === "BET" || tx.type === "WITHDRAWAL" ? "−" : "+"}
          {fmt(tx.amount)}
        </p>
        <span className={`text-[10px] font-bold uppercase tracking-widest ${cfg.color}`}>
          {cfg.label}
        </span>
      </div>
    </div>
  );
}

function TxSkeleton() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center justify-between gap-4 border-b border-border py-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-7 w-7 rounded-full shrink-0" />
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-3.5 w-24 sm:w-28 rounded" />
              <Skeleton className="h-2.5 w-32 sm:w-40 rounded" />
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <Skeleton className="h-3.5 w-14 sm:w-16 rounded" />
            <Skeleton className="h-2.5 w-8 sm:w-10 rounded-full" />
          </div>
        </div>
      ))}
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function FinancialPage() {
  const axios = useUserAxios();
  const [settings, setSettings]           = useState<FinancialSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [txPage, setTxPage]               = useState<TransactionPage | null>(null);
  const [txLoading, setTxLoading]         = useState(true);
  const [page, setPage]                   = useState(1);
  const [typeFilter, setTypeFilter]       = useState<string>("ALL");

  const loadSettings = async () => {
    setSettingsLoading(true);
    try {
      const r = await axios.get("/settings/financial");
      setSettings(r.data);
    } catch {
      /* no settings yet */
    } finally {
      setSettingsLoading(false);
    }
  };

  const loadTx = async () => {
    setTxLoading(true);
    try {
      const r = await axios.get("/transactions", {
        params: { page, limit: 10, type: typeFilter === "ALL" ? undefined : typeFilter },
      });
      setTxPage(r.data);
    } catch {
      toast.error("Failed to load transactions.");
    } finally {
      setTxLoading(false);
    }
  };

  useEffect(() => { loadSettings(); }, []);
  useEffect(() => { loadTx(); },      [page, typeFilter]);

  const FILTERS = ["ALL", "BET", "WIN_PAYOUT", "DEPOSIT", "WITHDRAWAL"];

  return (
    <div className="flex flex-col gap-5 p-3 sm:p-4 md:p-6 bg-background min-h-full">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-bold text-foreground tracking-tight">
            Financials
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 hidden sm:block">
            Settings, limits, and transaction history
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={() => { loadSettings(); loadTx(); }}
          title="Refresh"
        >
          <RefreshCw size={14} />
        </Button>
      </div>

      {/* ── Stat grid: 2-col on mobile, 4-col on sm+ ─────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <StatCard
          icon={Wallet}
          label="Total Bets"
          value={fmt(txPage?.totals.totalBets ?? 0)}
          accent="bg-foreground-500"
        />
        <StatCard
          icon={TrendingUp}
          label="Payouts"
          value={fmt(txPage?.totals.totalPayouts ?? 0)}
          accent="bg-emerald-500"
        />
        <StatCard
          icon={Shield}
          label="Min Bet"
          value={settingsLoading ? "…" : fmt(settings?.minBetAmount ?? 0)}
          accent="bg-sky-500"
        />
        <StatCard
          icon={Percent}
          label="Tax Rate"
          value={settingsLoading ? "…" : `${settings?.taxPercentage ?? 0}%`}
          accent="bg-violet-500"
        />
      </div>

      {/* ── Settings form ──────────────────────────────────────────────────── */}
      {settingsLoading ? (
        <div className="rounded-xl border border-border bg-card p-4 sm:p-6">
          <div className="flex flex-col gap-4">
            <Skeleton className="h-5 w-40 rounded" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex flex-col gap-1.5">
                  <Skeleton className="h-3 w-24 rounded" />
                  <Skeleton className="h-9 w-full rounded-md" />
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <SettingsForm settings={settings} onSaved={loadSettings} />
      )}

      {/* ── Transaction history ────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card">

        {/* Toolbar: stacks on mobile, row on sm+ */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border px-4 sm:px-5 py-3 sm:py-4">
          <h2 className="font-bold text-foreground text-sm shrink-0">
            Transaction History
          </h2>
          {/* Filter pills — horizontally scrollable on small screens */}
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none -mx-1 px-1">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => { setTypeFilter(f); setPage(1); }}
                className={`whitespace-nowrap rounded-full px-2.5 sm:px-3 py-1 text-xs font-semibold transition-all shrink-0 ${
                  typeFilter === f
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-accent"
                }`}
              >
                {f === "ALL" ? "All" : (TYPE_CONFIG[f]?.label ?? f)}
              </button>
            ))}
          </div>
        </div>

        {/* Rows */}
        <div className="px-4 sm:px-5">
          {txLoading ? (
            <TxSkeleton />
          ) : !txPage?.data.length ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No transactions found.
            </p>
          ) : (
            txPage.data.map((tx) => <TxRow key={tx.id} tx={tx} />)
          )}
        </div>

        {/* Pagination */}
        {txPage && txPage.pagination.totalPages > 1 && (
          <div className="flex flex-col xs:flex-row items-center justify-between gap-2 border-t border-border px-4 sm:px-5 py-3">
            <span className="text-xs text-muted-foreground">
              Page {txPage.pagination.page} of {txPage.pagination.totalPages} · {txPage.pagination.total} total
            </span>
            <div className="flex gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs px-3"
                disabled={page <= 1 || txLoading}
                onClick={() => setPage((p) => p - 1)}
              >
                Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs px-3"
                disabled={page >= txPage.pagination.totalPages || txLoading}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}