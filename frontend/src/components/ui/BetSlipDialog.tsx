import { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Receipt, Hash, AlignJustify, TrendingUp, Wallet, Coins,
} from "lucide-react";
import type { GameBet } from "@/lib/types";

interface BetSlipDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bets: GameBet[];
}

const isNumberBet = (targetNumber: string) => !isNaN(Number(targetNumber));

export const BetSlipDialog = ({
  open,
  onOpenChange,
  bets,
}: BetSlipDialogProps) => {
  const { totalPaid, totalExpected } = useMemo(() => {
    const totalPaid = bets.reduce((sum, bet) => sum + Number(bet.amount), 0);
    const totalExpected = bets.reduce(
      (sum, bet) => sum + Number(bet.amount) * Number(bet.multiplierNumber),
      0,
    );
    return { totalPaid, totalExpected };
  }, [bets]);

  const fmt = (value: number) =>
    new Intl.NumberFormat("en-RW", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);

  const formatDate = (dateStr: string) =>
    new Intl.DateTimeFormat("en-GB", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(dateStr));

  const profit = totalExpected - totalPaid;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-2xl gap-0 p-0 overflow-hidden rounded-2xl border border-border">

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="relative overflow-hidden shrink-0 bg-primary">
          <div className="absolute inset-0 opacity-10"
            style={{ backgroundImage: "radial-gradient(circle at 20% 50%, white 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
          <div className="relative px-6 py-5">
            <DialogHeader>
              <DialogTitle className="text-primary-foreground text-xl font-bold flex items-center gap-2.5">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-white/20">
                  <Receipt className="h-4 w-4 text-white" />
                </div>
                Bet Slip
              </DialogTitle>
              <p className="text-primary-foreground/70 text-sm mt-1">
                {bets.length} {bets.length === 1 ? "selection" : "selections"} this session
              </p>
            </DialogHeader>
          </div>
        </div>

        {/* ── Table ──────────────────────────────────────────────────── */}
        <ScrollArea className="max-h-[45vh]">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-border">
                <TableHead className="pl-5 w-24 text-xs font-bold uppercase tracking-wider text-muted-foreground">Type</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Pick</TableHead>
                <TableHead className="text-right text-xs font-bold uppercase tracking-wider text-muted-foreground hidden sm:table-cell">Stake</TableHead>
                <TableHead className="text-center text-xs font-bold uppercase tracking-wider text-muted-foreground">Odds</TableHead>
                <TableHead className="pr-5 text-right text-xs font-bold uppercase tracking-wider text-muted-foreground">Payout</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-12 text-sm">
                    <div className="flex flex-col items-center gap-2">
                      <Receipt className="h-8 w-8 opacity-20" />
                      No bets placed yet.
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                bets.map((bet) => {
                  const numberBet = isNumberBet(bet.targetNumber);
                  const payout = Number(bet.amount) * Number(bet.multiplierNumber);
                  return (
                    <TableRow key={bet.id} className="border-border hover:bg-muted/20 transition-colors">
                      <TableCell className="pl-5">
                        <Badge
                          variant="outline"
                          className={`text-xs px-2 py-0.5 font-semibold gap-1 ${
                            numberBet
                              ? "border-blue-500/40 text-blue-400 bg-blue-500/10"
                              : "border-amber-500/40 text-amber-400 bg-amber-500/10"
                          }`}
                        >
                          {numberBet
                            ? <Hash className="w-3 h-3" />
                            : <AlignJustify className="w-3 h-3" />}
                          <span className="hidden sm:inline">{numberBet ? "Number" : "Letter"}</span>
                          <span className="sm:hidden">{numberBet ? "Num" : "Let"}</span>
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <span className="font-black text-foreground text-base leading-none">{bet.targetNumber}</span>
                          <span className="text-[11px] text-muted-foreground">{formatDate(bet.createdAt)}</span>
                          <span className="text-[11px] text-muted-foreground sm:hidden">{fmt(Number(bet.amount))} RWF</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-semibold text-sm hidden sm:table-cell">
                        {fmt(Number(bet.amount))} <span className="text-muted-foreground text-xs">RWF</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="inline-flex items-center justify-center font-mono font-bold text-xs bg-primary/10 text-primary border border-primary/30 rounded-md px-2 py-0.5">
                          {bet.multiplierNumber}×
                        </span>
                      </TableCell>
                      <TableCell className="pr-5 text-right">
                        <span className="font-black text-primary text-sm">{fmt(payout)}</span>
                        <span className="text-muted-foreground text-xs ml-1">RWF</span>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </ScrollArea>

        <Separator className="bg-border" />

        {/* ── Summary footer ─────────────────────────────────────────── */}
        <div className="px-5 py-4 bg-muted/20 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {/* Total Paid */}
            <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 flex items-center gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-muted shrink-0">
                <Wallet className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Total Paid</p>
                <p className="text-sm font-black text-foreground leading-tight truncate">
                  {fmt(totalPaid)} <span className="text-xs font-semibold text-muted-foreground">RWF</span>
                </p>
              </div>
            </div>
            {/* Expected Return */}
            <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 flex items-center gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 shrink-0">
                <TrendingUp className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Expected</p>
                <p className="text-sm font-black text-primary leading-tight truncate">
                  {fmt(totalExpected)} <span className="text-xs font-semibold text-primary/70">RWF</span>
                </p>
              </div>
            </div>
          </div>

          {/* Potential Profit */}
          <div className={`rounded-xl border px-4 py-3 flex items-center justify-between ${
            profit >= 0
              ? "border-green-500/30 bg-green-500/5"
              : "border-destructive/30 bg-destructive/5"
          }`}>
            <div className="flex items-center gap-2.5">
              <div className={`flex items-center justify-center w-8 h-8 rounded-lg ${
                profit >= 0 ? "bg-green-500/15" : "bg-destructive/15"
              }`}>
                <Coins className={`w-4 h-4 ${profit >= 0 ? "text-green-400" : "text-destructive"}`} />
              </div>
              <span className="text-sm font-semibold text-muted-foreground">Potential Profit</span>
            </div>
            <span className={`text-xl font-black ${profit >= 0 ? "text-green-400" : "text-destructive"}`}>
              {profit >= 0 ? "+" : ""}{fmt(profit)}
              <span className="text-xs font-semibold ml-1 opacity-70">RWF</span>
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
