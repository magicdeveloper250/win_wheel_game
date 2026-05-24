import { useCallback, useEffect, useMemo, useState } from "react";
import { isAxiosError } from "axios";
import { toast } from "sonner";
import {
  Ticket, X, Hash, Type, Loader2, AlertCircle,
  Plus, Minus, Printer, CheckCircle2, Download, RotateCcw,
  Sparkles, User, Phone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import useUserAxios from "@/hooks/useUserAxios";
import useSession from "@/hooks/useSession";
import { useLiveGameWs } from "@/hooks/useLiveGameWs";
import type {
  GameTargetNumberSetting,
  GameWinMultiplierSetting,
  GameFinancialSetting,
  GameSession,
} from "@/lib/types";

function parseColor(raw: unknown): string {
  if (typeof raw === "number") return `#${raw.toString(16).padStart(6, "0")}`;
  if (typeof raw === "string") {
    const cleaned = raw.replace("#", "");
    const asInt = parseInt(cleaned, 16);
    if (!isNaN(asInt)) return `#${asInt.toString(16).padStart(6, "0")}`;
  }
  return "#3b82f6";
}

function fmt(n: number) {
  return n.toLocaleString("en-RW");
}

const AMOUNT_STEPS = [100, 500, 1000, 5000];

function getStep(amount: number): number {
  if (amount >= 5000) return 1000;
  if (amount >= 1000) return 500;
  return 100;
}

interface DialogProps {
  onSuccess: () => void;
}

interface SlipResult {
  slipUrl: string;
  ticketRef: string;
  holderName: string;
  totalAmount: number;
}

export default function TicketBetDialog({ onSuccess }: DialogProps) {
  const axios = useUserAxios();
  const { session, setSession } = useSession();
  const { latestEvent, connected } = useLiveGameWs();

  const [numbers, setNumbers] = useState<GameTargetNumberSetting[]>([]);
  const [multipliers, setMultipliers] = useState<GameWinMultiplierSetting[]>([]);
  const [financialSetting, setFinancialSetting] = useState<GameFinancialSetting | null>(null);
  const [activeSession, setActiveSession] = useState<GameSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [selectedTargets, setSelectedTargets] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [alreadyBetted, setAlreadyBetted] = useState(false);
  const [slipResult, setSlipResult] = useState<SlipResult | null>(null);

  const parsedAmount = useMemo(() => Number(amountStr), [amountStr]);

  useEffect(() => {
    if (financialSetting && !amountStr) {
      setAmountStr(String(financialSetting.minBetAmount));
    }
  }, [financialSetting, amountStr]);

  const totalAmount = useMemo(
    () => (Number.isFinite(parsedAmount) && parsedAmount > 0 ? parsedAmount * selectedTargets.length : 0),
    [parsedAmount, selectedTargets.length],
  );

  const canPlaceBet = useMemo(
    () => connected && activeSession !== null && !alreadyBetted,
    [connected, activeSession, alreadyBetted],
  );

  const adjustAmount = (direction: 1 | -1) => {
    const current = Number(amountStr) || financialSetting?.minBetAmount || 0;
    const step = getStep(current);
    const next = current + direction * step;
    const min = financialSetting?.minBetAmount ?? 0;
    const max = financialSetting?.maxBetAmount ?? Infinity;
    setAmountStr(String(Math.min(max, Math.max(min, next))));
  };

  useEffect(() => {
    if (!latestEvent) return;
    switch (latestEvent.type) {
      case "session_opened":
        setActiveSession({
          id: latestEvent.sessionId,
          sessionNumber: latestEvent.sessionNumber,
          duration: latestEvent.duration,
          shouldWin: latestEvent.shouldWin,
          multiplier: latestEvent.multiplier,
          startedAt: new Date().toISOString(),
          endedAt: new Date().toISOString(),
          status: "ACTIVE",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } as GameSession);
        setAlreadyBetted(false);
        break;
      case "bets_locked":
        if (open && !alreadyBetted && !slipResult) {
          toast.warning("Betting window has closed for this round.");
          setOpen(false);
          reset();
        }
        break;
      case "spin_result":
        if (open && !slipResult) {
          toast.info("Round completed. Waiting for next session.");
          setOpen(false);
          reset();
        }
        break;
      case "round_ended":
        setActiveSession(null);
        setAlreadyBetted(false);
        break;
    }
  }, [latestEvent, open, alreadyBetted, slipResult]);

  const fetchNumbers = useCallback(async () => {
    const resp = await axios.get("/numbers");
    setNumbers(resp.data.data as GameTargetNumberSetting[]);
  }, [axios]);

  const fetchMultipliers = useCallback(async () => {
    const resp = await axios.get("/multipliers");
    setMultipliers(resp.data.data as GameWinMultiplierSetting[]);
  }, [axios]);

  const fetchFinancialSettings = useCallback(async () => {
    const resp = await axios.get("/settings/financial");
    setFinancialSetting(resp.data);
  }, [axios]);

  const fetchActiveSession = useCallback(async () => {
    try {
      const resp = await axios.get("/sessions/active");
      setActiveSession(resp.data);
      setAlreadyBetted(resp.data.betted);
    } catch {
      setActiveSession(null);
      setAlreadyBetted(false);
    }
  }, [axios]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setLoadError(null);
    setAmountStr("");
    setSlipResult(null);
    Promise.all([fetchNumbers(), fetchMultipliers(), fetchFinancialSettings(), fetchActiveSession()])
      .catch(() => setLoadError("Failed to load game data. Please try again."))
      .finally(() => setLoading(false));
  }, [open, fetchNumbers, fetchMultipliers, fetchFinancialSettings, fetchActiveSession]);

  const toggle = (val: string) =>
    setSelectedTargets((prev) => prev.includes(val) ? prev.filter((x) => x !== val) : [...prev, val]);

  const remove = (val: string) =>
    setSelectedTargets((prev) => prev.filter((x) => x !== val));

  const reset = () => {
    setName(""); setPhone(""); setAmountStr("");
    setSelectedTargets([]); setSlipResult(null);
  };

  const submit = async () => {
    if (!canPlaceBet) {
      if (!connected) return toast.error("Disconnected from game server.");
      if (!activeSession) return toast.error("No active session available.");
      if (alreadyBetted) return toast.error("You have already placed a bet in this session.");
      return toast.error("Cannot place bet at this time.");
    }
    if (!name.trim()) return toast.error("Ticket name is required.");
    if (selectedTargets.length === 0) return toast.error("Select at least one number or letter.");
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return toast.error("Enter a valid bet amount.");
    if (!activeSession?.id) return toast.error("No active session found.");
    if (financialSetting) {
      if (totalAmount < financialSetting.minBetAmount)
        return toast.error(`Minimum total is ${fmt(financialSetting.minBetAmount)} RWF.`);
      if (totalAmount > financialSetting.maxBetAmount)
        return toast.error(`Maximum total is ${fmt(financialSetting.maxBetAmount)} RWF.`);
    }

    setSubmitting(true);
    try {
      const res = await axios.post("/bets/ticket", {
        sessionId: activeSession.id,
        targetNumbers: selectedTargets,
        amount: parsedAmount,
        ticket: { name: name.trim(), phone: phone.trim() || undefined },
      });

      toast.success("Ticket placed successfully!");
      if (res.data?.balance !== undefined)
        setSession({ ...session, balance: res.data.balance } as any);

      setAlreadyBetted(true);
      onSuccess();

      setSlipResult({
        slipUrl: res.data.slipUrl,
        ticketRef: res.data.ticket?.id ?? "—",
        holderName: name.trim(),
        totalAmount,
      });

      setName(""); setPhone(""); setAmountStr(""); setSelectedTargets([]);
    } catch (err) {
      toast.error(
        isAxiosError(err)
          ? (err.response?.data?.error ?? err.message)
          : "Failed to place ticket.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const Tile = ({
    value, label, subLabel, bgColor, size = "sm",
  }: {
    value: string; label: string; subLabel: string; bgColor: string; size?: "sm" | "lg";
  }) => {
    const active = selectedTargets.includes(value);
    return (
      <button
        type="button"
        onClick={() => canPlaceBet && toggle(value)}
        disabled={!canPlaceBet}
        style={
          active
            ? { background: bgColor, borderColor: "hsl(var(--primary))", boxShadow: `0 0 0 2px hsl(var(--primary) / 0.5), 0 4px 12px ${bgColor}55` }
            : { background: `${bgColor}22`, borderColor: `${bgColor}55`, color: "hsl(var(--foreground))" }
        }
        className={cn(
          "relative flex flex-col items-center justify-center rounded-xl border-2 cursor-pointer select-none",
          "transition-all duration-150 active:scale-95 font-bold",
          size === "sm" ? "h-11 text-sm" : "h-14 text-base",
          active ? "text-white scale-[1.06]" : "hover:border-primary/60 hover:scale-[1.02]",
          !canPlaceBet && "opacity-40 cursor-not-allowed",
        )}
      >
        <span className="leading-none">{label}</span>
        <span className="text-[9px] font-semibold mt-1 opacity-70 leading-none tracking-wide">{subLabel}</span>
      </button>
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (v && !canPlaceBet && !slipResult) {
          if (!connected) toast.error("Connecting to game server...");
          else if (!activeSession) toast.error("No active session available. Please wait for next game.");
          else if (alreadyBetted) toast.error("You have already placed a bet in this session.");
          return;
        }
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button className="py-0" size="sm">
          <Printer className="h-4 w-4" />
          Generate Ticket
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-2xl gap-0 p-0 overflow-hidden rounded-2xl border border-border flex flex-col" style={{ maxHeight: "min(92vh, 100dvh - 16px)" }}>
        {slipResult ? (
          /* ── SLIP RESULT SCREEN ──────────────────────────────────────── */
          <>
            {/* Gold success header */}
            <div className="relative overflow-hidden shrink-0"
              style={{ background: "linear-gradient(135deg, oklch(0.855 0.162 84.6) 0%, oklch(0.72 0.195 40.0) 100%)" }}>
              <div className="absolute inset-0 opacity-10"
                style={{ backgroundImage: "radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)", backgroundSize: "30px 30px" }} />
              <div className="relative px-6 py-5">
                <DialogHeader>
                  <DialogTitle className="text-primary-foreground text-xl font-bold flex items-center gap-2.5">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-white/20">
                      <CheckCircle2 className="h-5 w-5 text-white" />
                    </div>
                    Ticket Confirmed
                  </DialogTitle>
                  <p className="text-primary-foreground/80 text-sm mt-1 flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5" />
                    Placed for <span className="font-bold text-white ml-1">{slipResult.holderName}</span>
                    <span className="ml-auto font-mono text-xs bg-white/20 px-2 py-0.5 rounded-full">
                      {fmt(slipResult.totalAmount)} RWF
                    </span>
                  </p>
                </DialogHeader>
              </div>
            </div>

            {/* PDF preview area */}
            <div className="flex-1 overflow-hidden bg-muted/20 p-4 min-h-0">
              <div className="h-full rounded-xl border border-border overflow-hidden shadow-inner"
                style={{ minHeight: 340 }}>
                <iframe
                  src={slipResult.slipUrl}
                  className="w-full h-full bg-white"
                  style={{ minHeight: 340, height: "100%" }}
                  title="Bet Slip Preview"
                />
              </div>
            </div>

            {/* Footer actions */}
            <div className="shrink-0 px-6 py-4 border-t border-border bg-muted/30 flex items-center justify-between gap-3">
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground gap-1.5"
                onClick={() => { setOpen(false); reset(); }}
              >
                <X className="h-4 w-4" /> Close
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 border-primary/40 text-primary hover:bg-primary hover:text-primary-foreground"
                  onClick={() => window.open(slipResult.slipUrl, "_blank")}
                >
                  <Download className="h-4 w-4" /> Download
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={() => { setSlipResult(null); setAlreadyBetted(false); }}
                >
                  <RotateCcw className="h-4 w-4" /> New Ticket
                </Button>
              </div>
            </div>
          </>
        ) : (
          /* ── FORM SCREEN ─────────────────────────────────────────────── */
          <>
            {/* Header */}
            <div className="relative overflow-hidden shrink-0 bg-primary">
              <div className="absolute inset-0 opacity-10"
                style={{ backgroundImage: "radial-gradient(circle at 20% 50%, white 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
              <div className="relative px-6 py-5">
                <DialogHeader>
                  <DialogTitle className="text-primary-foreground text-xl font-bold flex items-center gap-2.5">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-white/20">
                      <Ticket className="h-4 w-4 text-white" />
                    </div>
                    New Ticket Bet
                  </DialogTitle>
                  <p className="text-primary-foreground/70 text-sm mt-1">
                    Fill in holder details, then select numbers &amp; letters.
                  </p>
                  {!connected && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs font-medium bg-black/20 text-yellow-300 px-3 py-1.5 rounded-lg w-fit">
                      <AlertCircle className="h-3.5 w-3.5" /> Reconnecting to game server…
                    </div>
                  )}
                  {activeSession && alreadyBetted && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs font-medium bg-black/20 text-yellow-300 px-3 py-1.5 rounded-lg w-fit">
                      <AlertCircle className="h-3.5 w-3.5" /> Already placed a bet this session.
                    </div>
                  )}
                </DialogHeader>
              </div>
            </div>

            {/* Scrollable body */}
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6 bg-background">
              {loading && (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                  <div className="relative">
                    <div className="w-12 h-12 rounded-full border-2 border-primary/20" />
                    <Loader2 className="h-6 w-6 animate-spin text-primary absolute inset-0 m-auto" />
                  </div>
                  <span className="text-sm">Loading game data…</span>
                </div>
              )}
              {!loading && loadError && (
                <div className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-destructive text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {loadError}
                </div>
              )}
              {!loading && !loadError && (
                <>
                  {/* ── Ticket Holder ─────────────────────────────────── */}
                  <section className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="h-px flex-1 bg-border" />
                      <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground px-2">
                        Ticket Holder
                      </span>
                      <div className="h-px flex-1 bg-border" />
                    </div>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="tkName" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                          <User className="h-3 w-3" /> Name <span className="text-destructive normal-case tracking-normal font-normal">*</span>
                        </Label>
                        <Input id="tkName" value={name} onChange={(e) => setName(e.target.value)}
                          placeholder="e.g. Jean Dupont"
                          className="h-10 bg-muted/30 border-border focus:border-primary transition-colors"
                          disabled={!canPlaceBet} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="tkPhone" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                          <Phone className="h-3 w-3" /> Phone <span className="text-muted-foreground/60 normal-case tracking-normal font-normal text-xs">(optional)</span>
                        </Label>
                        <Input id="tkPhone" value={phone} onChange={(e) => setPhone(e.target.value)}
                          placeholder="+250 7XX XXX XXX"
                          className="h-10 bg-muted/30 border-border focus:border-primary transition-colors"
                          disabled={!canPlaceBet} />
                      </div>
                    </div>
                  </section>

                  {/* ── Numbers ───────────────────────────────────────── */}
                  {numbers.length > 0 && (
                    <section className="space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="h-px flex-1 bg-border" />
                        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground px-2 flex items-center gap-1.5">
                          <Hash className="h-3 w-3" /> Numbers
                        </span>
                        <div className="h-px flex-1 bg-border" />
                      </div>
                      <div className="grid grid-cols-5 sm:grid-cols-8 gap-2">
                        {numbers.map((n) => (
                          <Tile key={n.id} value={String(n.targetNumber)} label={String(n.targetNumber)}
                            subLabel={`×${n.multiplierNumber}`}
                            bgColor={parseColor(n.color)}
                            size="sm" />
                        ))}
                      </div>
                    </section>
                  )}

                  {/* ── Letters ───────────────────────────────────────── */}
                  {multipliers.length > 0 && (
                    <section className="space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="h-px flex-1 bg-border" />
                        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground px-2 flex items-center gap-1.5">
                          <Type className="h-3 w-3" /> Letters
                        </span>
                        <div className="h-px flex-1 bg-border" />
                      </div>
                      <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                        {multipliers.map((m) => (
                          <Tile key={m.id} value={m.multiplierLetter.toUpperCase()}
                            label={m.multiplierLetter.toUpperCase()} subLabel={`×${m.winMultiplier}`}
                            bgColor={parseColor(m.color)} size="lg" />
                        ))}
                      </div>
                    </section>
                  )}

                  {/* ── Selected picks ────────────────────────────────── */}
                  {selectedTargets.length > 0 && (
                    <div className="rounded-xl border border-border bg-muted/20 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground mb-2">
                        Selected Picks
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedTargets.map((t) => {
                          const numberItem = numbers.find((n) => String(n.targetNumber) === t);
                          const multiplierItem = multipliers.find((m) => m.multiplierLetter.toUpperCase() === t);
                          const rawColor = numberItem?.color ?? multiplierItem?.color ?? 0x3b82f6;
                          const itemColor = parseColor(rawColor);
                          return (
                            <Badge key={t} variant="outline"
                              style={{ backgroundColor: `${itemColor}25`, borderColor: `${itemColor}80`, color: itemColor }}
                              className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 text-xs font-bold">
                              {t}
                              <button type="button" onClick={() => remove(t)}
                                className="ml-0.5 opacity-60 hover:opacity-100 transition-opacity rounded-full hover:bg-white/10 p-0.5"
                                disabled={!canPlaceBet}>
                                <X className="h-2.5 w-2.5" />
                              </button>
                            </Badge>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* ── Amount ────────────────────────────────────────── */}
                  <section className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="h-px flex-1 bg-border" />
                      <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground px-2">
                        Amount per Pick
                      </span>
                      <div className="h-px flex-1 bg-border" />
                    </div>

                    {financialSetting && (
                      <div className="flex items-center gap-3 text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
                        <span>Min <span className="font-semibold text-foreground">{fmt(financialSetting.minBetAmount)}</span></span>
                        <span className="text-border">·</span>
                        <span>Max <span className="font-semibold text-foreground">{fmt(financialSetting.maxBetAmount)}</span></span>
                        <span className="text-border">·</span>
                        <span>Tax <span className="font-semibold text-foreground">{(financialSetting.taxPercentage * 100).toFixed(0)}%</span></span>
                        <span className="ml-auto text-muted-foreground/50">RWF</span>
                      </div>
                    )}

                    <div className="flex gap-2 items-center">
                      <Button type="button" variant="outline" size="icon"
                        className="h-10 w-10 shrink-0 rounded-lg hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors"
                        onClick={() => adjustAmount(-1)}
                        disabled={!canPlaceBet || parsedAmount <= (financialSetting?.minBetAmount ?? 0)}>
                        <Minus className="h-4 w-4" />
                      </Button>
                      <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-bold select-none tracking-wide">RWF</span>
                        <Input type="number" value={amountStr}
                          min={financialSetting?.minBetAmount} max={financialSetting?.maxBetAmount} step="1"
                          onChange={(e) => setAmountStr(e.target.value)}
                          onBlur={() => {
                            const min = financialSetting?.minBetAmount ?? 0;
                            const max = financialSetting?.maxBetAmount ?? Infinity;
                            const val = Number(amountStr);
                            if (!isNaN(val)) setAmountStr(String(Math.min(max, Math.max(min, val))));
                            else if (financialSetting) setAmountStr(String(financialSetting.minBetAmount));
                          }}
                          placeholder="0"
                          className="h-10 pl-12 text-center pr-3 bg-muted/30 border-border focus:border-primary transition-colors font-semibold"
                          disabled={!canPlaceBet} />
                      </div>
                      <Button type="button" variant="outline" size="icon"
                        className="h-10 w-10 shrink-0 rounded-lg hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors"
                        onClick={() => adjustAmount(1)}
                        disabled={!canPlaceBet || parsedAmount >= (financialSetting?.maxBetAmount ?? Infinity)}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="flex gap-2 flex-wrap">
                      {AMOUNT_STEPS.map((q) => (
                        <Button key={q} type="button" variant="outline" size="sm"
                          onClick={() => setAmountStr(String(q))}
                          className={cn(
                            "h-8 px-4 text-xs font-bold shrink-0 transition-all rounded-lg",
                            parsedAmount === q
                              ? "bg-primary text-primary-foreground border-primary shadow-sm"
                              : "hover:bg-primary/10 hover:border-primary/60 hover:text-primary",
                          )}
                          disabled={!canPlaceBet}>
                          {q >= 1000 ? `${q / 1000}k` : q}
                        </Button>
                      ))}
                    </div>
                  </section>

                  {/* ── Total summary ─────────────────────────────────── */}
                  {selectedTargets.length > 0 && totalAmount > 0 && (
                    <div className="rounded-xl overflow-hidden border border-primary/30"
                      style={{ background: "linear-gradient(135deg, hsl(var(--primary) / 0.08) 0%, hsl(var(--primary) / 0.04) 100%)" }}>
                      <div className="flex items-center justify-between px-4 py-3">
                        <div className="text-sm text-muted-foreground">
                          <span className="font-semibold text-foreground">{selectedTargets.length}</span> pick{selectedTargets.length !== 1 ? "s" : ""}
                          <span className="mx-1.5 text-border">×</span>
                          <span className="font-semibold text-foreground">{fmt(parsedAmount)}</span> RWF
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Total</p>
                          <p className="text-lg font-black text-primary leading-none">{fmt(totalAmount)} <span className="text-xs font-semibold">RWF</span></p>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <DialogFooter className="px-6 py-4 border-t border-border bg-muted/30 flex-row justify-between items-center gap-2 shrink-0">
              <Button variant="ghost" onClick={() => { setOpen(false); reset(); }} disabled={submitting}
                className="h-10 text-muted-foreground hover:text-foreground gap-1.5">
                <X className="h-4 w-4" /> Cancel
              </Button>
              <Button
                onClick={submit}
                disabled={submitting || loading || !!loadError || selectedTargets.length === 0
                  || !name.trim() || totalAmount <= 0 || !activeSession || !canPlaceBet}
                className="h-10 min-w-36 font-bold gap-2"
              >
                {submitting ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Placing…</>
                ) : (
                  <><Ticket className="h-4 w-4" /> Confirm Ticket</>
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
