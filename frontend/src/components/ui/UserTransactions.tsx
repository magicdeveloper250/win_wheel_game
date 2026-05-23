import { useEffect, useState } from "react";
import { isAxiosError } from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import useUserAxios from "@/hooks/useUserAxios";
import type { PaginatedResponse, Transaction } from "@/lib/types";
import { TransactionType } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface UserTransactionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: { id: string; name: string };
}

const TYPE_COLORS: Record<string, string> = {
  DEPOSIT: "bg-green-100 text-green-800",
  WITHDRAWAL: "bg-red-100 text-red-800",
  BET: "bg-yellow-100 text-yellow-800",
  WIN: "bg-blue-100 text-blue-800",
  REFUND: "bg-purple-100 text-purple-800",
};

export default function UserTransactionsDialog({
  open,
  onOpenChange,
  user,
}: UserTransactionsDialogProps) {
  const axios = useUserAxios();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const [type, setType] = useState<string>("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const limit = 8;
  const totalPages = Math.ceil(total / limit);

  const fetchTransactions = async (p = 1) => {
    setLoading(true);
    try {
      const params: Record<string, string> = {
        userId: user.id,
        page: String(p),
        limit: String(limit),
      };
      if (type !== "ALL") params.type = type;
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;

      const res = await axios.get<PaginatedResponse<Transaction>>(
        "/transactions",
        { params },
      );
      setTransactions(res.data.data);
      setTotal(res.data.total);
      setPage(p);
    } catch (err) {
      toast.error(
        isAxiosError(err)
          ? (err.response?.data?.error ?? err.message)
          : "Failed to fetch transactions.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      setType("ALL");
      setDateFrom("");
      setDateTo("");
      fetchTransactions(1);
    }
  }, [open, user.id]);

  const handleFilter = () => fetchTransactions(1);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md  rounded-2xl border border-border">
        <DialogHeader>
          <DialogTitle>Transactions</DialogTitle>
          <DialogDescription>{`Viewing transactions for [${user.name}]`}</DialogDescription>
        </DialogHeader>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-end">
          <div className="grid gap-1 flex-1 min-w-30">
            <Label>Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All</SelectItem>
                {Object.keys(TransactionType).map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1 flex-1 min-w-32.5">
            <Label>From</Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>

          <div className="grid gap-1 flex-1 min-w-32.5">
            <Label>To</Label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>

          <Button onClick={handleFilter} disabled={loading} className="shrink-0">
            Filter
          </Button>
        </div>

        {/* Table */}
        <div className="overflow-auto rounded-md border max-h-85">
          <table className="w-full text-sm">
            <thead className="bg-muted sticky top-0">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Date</th>
                <th className="text-left px-3 py-2 font-medium">Type</th>
                <th className="text-right px-3 py-2 font-medium">Amount</th>
                <th className="text-right px-3 py-2 font-medium">Tax</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="text-center py-8 text-muted-foreground">
                    Loading...
                  </td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-8 text-muted-foreground">
                    No transactions found.
                  </td>
                </tr>
              ) : (
                transactions.map((tx) => (
                  <tr key={tx.id} className="border-t hover:bg-muted/40 transition-colors">
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                      {new Date(tx.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2">
                      <Badge
                        className={`text-xs font-medium ${TYPE_COLORS[tx.type] ?? "bg-gray-100 text-gray-800"}`}
                        variant="outline"
                      >
                        {tx.type}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      <span className={tx.amount < 0 ? "text-red-600" : "text-green-600"}>
                        {tx.amount < 0 ? "-" : "+"}
                        {Math.abs(tx.amount).toLocaleString()}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                      {tx.tax.toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-1 text-sm">
            <span className="text-muted-foreground">
              Page {page} of {totalPages} &mdash; {total} total
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchTransactions(page - 1)}
                disabled={page <= 1 || loading}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchTransactions(page + 1)}
                disabled={page >= totalPages || loading}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}