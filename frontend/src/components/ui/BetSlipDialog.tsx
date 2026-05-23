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
import { Receipt, Hash, AlignJustify, TrendingUp, Wallet } from "lucide-react";
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
    0
  );
  return { totalPaid, totalExpected };
}, [bets]);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "RWF",
      minimumFractionDigits: 2,
    }).format(value);

  const formatDate = (dateStr: string) =>
    new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(dateStr));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:min-w-[50vw] max-w-2xl gap-0 p-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-primary/10 shrink-0">
              <Receipt className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-base sm:text-lg font-semibold">
                Bet Slip
              </DialogTitle>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                {bets.length} {bets.length === 1 ? "selection" : "selections"}
              </p>
            </div>
          </div>
        </DialogHeader>

        <Separator />

        {/* Bet Table */}
        <ScrollArea className="max-h-[45vh] sm:max-h-72">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-3 sm:pl-6 w-20 sm:w-25 text-xs sm:text-sm">Type</TableHead>
                <TableHead className="text-xs sm:text-sm">Selection</TableHead>
                {/* Hide Stake column label on mobile, show in cell instead */}
                <TableHead className="text-right text-xs sm:text-sm hidden sm:table-cell">Stake</TableHead>
                <TableHead className="text-right text-xs sm:text-sm">Odds</TableHead>
                <TableHead className="pr-3 sm:pr-6 text-right text-xs sm:text-sm">Payout</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bets.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-muted-foreground py-10 text-sm"
                  >
                    No bets placed yet.
                  </TableCell>
                </TableRow>
              ) : (
                bets.map((bet) => {
                  const numberBet = isNumberBet(bet.targetNumber);
                  const payout = Number(bet.amount) * Number(bet.multiplierNumber);
                  return (
                    <TableRow key={bet.id}>
                      <TableCell className="pl-3 sm:pl-6">
                        <Badge
                          variant="outline"
                          className={`text-xs px-1.5 py-0.5 ${
                            numberBet
                              ? "border-blue-500/40 text-blue-500 bg-blue-500/5"
                              : "border-amber-500/40 text-amber-500 bg-amber-500/5"
                          }`}
                        >
                          {numberBet ? (
                            <Hash className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-0.5 sm:mr-1" />
                          ) : (
                            <AlignJustify className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-0.5 sm:mr-1" />
                          )}
                          <span className="hidden sm:inline">{numberBet ? "Number" : "Letter"}</span>
                          <span className="sm:hidden">{numberBet ? "Num" : "Let"}</span>
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-semibold text-foreground text-sm sm:text-base">
                            {bet.targetNumber}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(bet.createdAt)}
                          </span>
                          {/* Show stake inline on mobile */}
                          <span className="text-xs text-muted-foreground sm:hidden">
                            {formatCurrency(bet.amount)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium text-sm hidden sm:table-cell">
                        {formatCurrency(bet.amount)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary" className="font-mono text-xs px-1.5">
                          {bet.multiplierNumber}x
                        </Badge>
                      </TableCell>
                      <TableCell className="pr-3 sm:pr-6 text-right font-semibold text-primary text-sm">
                        {formatCurrency(payout)}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </ScrollArea>

        <Separator />

        {/* Summary Footer */}
        <div className="px-4 sm:px-6 py-3 sm:py-5 bg-muted/30 space-y-2 sm:space-y-3">
          <div className="flex items-center justify-between text-xs sm:text-sm">
            <div className="flex items-center gap-1.5 sm:gap-2 text-muted-foreground">
              <Wallet className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span>Total Paid</span>
            </div>
            <span className="font-semibold text-foreground">
              {formatCurrency(totalPaid)}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs sm:text-sm">
            <div className="flex items-center gap-1.5 sm:gap-2 text-muted-foreground">
              <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span>Expected Return</span>
            </div>
            <span className="font-semibold text-primary sm:text-base">
              {formatCurrency(totalExpected)}
            </span>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <span className="text-xs sm:text-sm font-medium text-muted-foreground">
              Potential Profit
            </span>
            <span
              className={`text-base sm:text-lg font-bold ${
                totalExpected - totalPaid >= 0
                  ? "text-green-500"
                  : "text-destructive"
              }`}
            >
              {totalExpected - totalPaid >= 0 ? "+" : ""}
              {formatCurrency(totalExpected - totalPaid)}
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};