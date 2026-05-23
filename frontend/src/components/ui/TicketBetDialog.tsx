import { useCallback, useEffect, useMemo, useState } from "react";
import { isAxiosError } from "axios";
import { toast } from "sonner";
import {
  Ticket, X, Hash, Type, Loader2, AlertCircle,
  Plus, Minus, Printer, Download, ExternalLink, CheckCircle2,
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

  // Print by injecting a hidden iframe so the OS print dialog opens on the PDF
  const handlePrint = (slipUrl: string) => {
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;border:none;visibility:hidden;";
    iframe.src = slipUrl;
    document.body.appendChild(iframe);
    iframe.onload = () => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => document.body.removeChild(iframe), 2000);
    };
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
            ? { background: "transparent", borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))" }
            : { background: bgColor, borderColor: bgColor, color: "#fff" }
        }
        className={cn(
          "relative flex flex-col items-center justify-center rounded-xl border-2 cursor-pointer select-none",
          "transition-all duration-150 active:scale-95 font-bold hover:opacity-90",
          size === "sm" ? "h-11 text-sm" : "h-14 text-base",
          active && "scale-[1.04] shadow-lg",
          !canPlaceBet && "opacity-50 cursor-not-allowed",
        )}
      >
        <span>{label}</span>
        <span className="text-[9px] font-medium mt-0.5 opacity-70 leading-none">{subLabel}</span>
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
          <Printer />
       Generate ticket 
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-200   min-h-[80vh] gap-0 p-0 overflow-hidden rounded-2xl border border-border max-h-[90vh] flex flex-col">

        {slipResult ? (
          <>
            <div className="bg-primary px-6 py-5 shrink-0">
              <DialogHeader>
                <DialogTitle className="text-primary-foreground text-xl font-bold flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 opacity-80" />
                  Ticket Confirmed
                </DialogTitle>
                <p className="text-primary-foreground/60 text-sm mt-0.5">
                  Ticket placed for{" "}
                  <span className="font-semibold text-primary-foreground">{slipResult.holderName}</span>
                </p>
              </DialogHeader>
            </div>

            

              {/* PDF preview */}
              <div className="rounded-xl border border-border overflow-hidden">
               
                <iframe
                  src={slipResult.slipUrl}
                  className="w-full bg-white min-h-[80vh] "
                  style={{ height: 360 }}
                  title="Bet Slip Preview"
                />
              </div>

              

            <DialogFooter className="px-6 py-4 border-t border-border bg-muted/30 flex-row justify-end gap-2 shrink-0">
              <Button variant="ghost" className="h-10" onClick={() => { setOpen(false); reset(); }}>
                Close
              </Button>
              <Button
                variant="outline"
                className="h-10"
                onClick={() => {
                  setSlipResult(null);
                  // Allow placing another ticket in the same session
                  setAlreadyBetted(false);
                }}
              >
                <Ticket className="h-4 w-4 mr-1.5" />
                New Ticket
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            {/* ── FORM SCREEN ────────────────────────────────────────────────── */}
            <div className="bg-primary px-6 py-5 shrink-0">
              <DialogHeader>
                <DialogTitle className="text-primary-foreground text-xl font-bold flex items-center gap-2">
                  <Ticket className="h-5 w-5 opacity-80" />
                  New Ticket Bet
                </DialogTitle>
                <p className="text-primary-foreground/60 text-sm mt-0.5">
                  Fill in holder details, then tap numbers &amp; letters to select.
                </p>
                {!connected && (
                  <p className="text-black text-xs mt-2">⚠ Reconnecting to game server...</p>
                )}
                {activeSession && alreadyBetted && (
                  <p className="text-black text-xs mt-2">⚠ You have already placed a bet in this session.</p>
                )}
              </DialogHeader>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5 bg-background">
              {loading && (
                <div className="flex items-center justify-center py-12 gap-3 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
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
                  <fieldset className="space-y-3">
                    <legend className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      Ticket Holder
                    </legend>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="tkName" className="text-sm">
                          Name <span className="text-destructive">*</span>
                        </Label>
                        <Input id="tkName" value={name} onChange={(e) => setName(e.target.value)}
                          placeholder="e.g. Jean Dupont" className="h-10" disabled={!canPlaceBet} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="tkPhone" className="text-sm">
                          Phone <span className="text-muted-foreground text-xs">(optional)</span>
                        </Label>
                        <Input id="tkPhone" value={phone} onChange={(e) => setPhone(e.target.value)}
                          placeholder="+250 7XX XXX XXX" className="h-10" disabled={!canPlaceBet} />
                      </div>
                    </div>
                  </fieldset>

                  <Separator />

                  {numbers.length > 0 && (
                    <fieldset className="space-y-3">
                      <legend className="text-xs font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                        <Hash className="h-3.5 w-3.5" /> Numbers
                      </legend>
                      <div className="grid grid-cols-5 sm:grid-cols-7 gap-2">
                        {numbers.map((n) => (
                          <Tile key={n.id} value={String(n.targetNumber)} label={String(n.targetNumber)}
                            subLabel={`×${n.multiplierNumber}`}
                            bgColor={`linear-gradient(135deg, ${parseColor(n.color)} 0%, ${parseColor(n.color)}CC 100%)`}
                            size="sm" />
                        ))}
                      </div>
                    </fieldset>
                  )}

                  {multipliers.length > 0 && (
                    <fieldset className="space-y-3">
                      <legend className="text-xs font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                        <Type className="h-3.5 w-3.5" /> Letters
                      </legend>
                      <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                        {multipliers.map((m) => (
                          <Tile key={m.id} value={m.multiplierLetter.toUpperCase()}
                            label={m.multiplierLetter.toUpperCase()} subLabel={`×${m.winMultiplier}`}
                            bgColor={parseColor(m.color)} size="lg" />
                        ))}
                      </div>
                    </fieldset>
                  )}

                  {selectedTargets.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 p-3 rounded-xl border border-border min-h-11">
                      {selectedTargets.map((t) => {
                        const numberItem = numbers.find((n) => String(n.targetNumber) === t);
                        const multiplierItem = multipliers.find((m) => m.multiplierLetter.toUpperCase() === t);
                        const rawColor = numberItem?.color ?? multiplierItem?.color ?? 0x3b82f6;
                        const itemColor = parseColor(rawColor);
                        return (
                          <Badge key={t} variant="outline"
                            style={{ backgroundColor: `${itemColor}20`, borderColor: itemColor }}
                            className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 text-xs font-semibold">
                            {t}
                            <button type="button" onClick={() => remove(t)}
                              className="opacity-60 hover:opacity-100 transition-opacity" disabled={!canPlaceBet}>
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        );
                      })}
                    </div>
                  )}

                  <Separator />

                  <fieldset className="space-y-3">
                    <legend className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      Amount per Pick
                    </legend>
                    {financialSetting && (
                      <p className="text-xs text-muted-foreground">
                        Min <span className="font-semibold text-foreground">{fmt(financialSetting.minBetAmount)}</span>{" "}
                        — Max <span className="font-semibold text-foreground">{fmt(financialSetting.maxBetAmount)}</span>{" "}
                        RWF · Tax <span className="font-semibold text-foreground">{(financialSetting.taxPercentage * 100).toFixed(0)}%</span>
                      </p>
                    )}
                    <div className="flex gap-2 items-center">
                      <Button type="button" variant="outline" size="icon"
                        className="h-10 w-10 shrink-0 rounded-lg hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors"
                        onClick={() => adjustAmount(-1)}
                        disabled={!canPlaceBet || parsedAmount <= (financialSetting?.minBetAmount ?? 0)}>
                        <Minus className="h-4 w-4" />
                      </Button>
                      <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium select-none">RWF</span>
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
                          placeholder="0" className="h-10 pl-12 text-center pr-3" disabled={!canPlaceBet} />
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
                            "h-8 px-3 text-xs font-semibold shrink-0 transition-colors",
                            parsedAmount === q
                              ? "bg-primary text-primary-foreground border-primary"
                              : "hover:bg-primary hover:text-primary-foreground hover:border-primary",
                          )}
                          disabled={!canPlaceBet}>
                          {q >= 1000 ? `${q / 1000}k` : q}
                        </Button>
                      ))}
                    </div>
                  </fieldset>

                  {selectedTargets.length > 0 && totalAmount > 0 && (
                    <div className="flex items-center justify-between rounded-xl bg-primary/5 border border-primary/20 px-4 py-3">
                      <span className="text-sm text-muted-foreground">
                        {selectedTargets.length} pick{selectedTargets.length !== 1 ? "s" : ""} ×{" "}
                        <span className="font-semibold text-foreground">{fmt(parsedAmount)} RWF</span>
                      </span>
                      <span className="text-sm font-bold text-primary">Total: {fmt(totalAmount)} RWF</span>
                    </div>
                  )}
                </>
              )}
            </div>

            <DialogFooter className="px-6 py-4 border-t border-border bg-muted/30 flex-row justify-end gap-2 shrink-0">
              <Button variant="ghost" onClick={() => { setOpen(false); reset(); }} disabled={submitting} className="h-10">
                Cancel
              </Button>
              <Button
                onClick={submit}
                disabled={submitting || loading || !!loadError || selectedTargets.length === 0
                  || !name.trim() || totalAmount <= 0 || !activeSession || !canPlaceBet}
                className="h-10 min-w-35 bg-primary text-primary-foreground font-semibold"
              >
                {submitting ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Placing…
                  </span>
                ) : (
                  <><Ticket className="h-4 w-4 mr-1.5" /> Confirm Ticket</>
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}