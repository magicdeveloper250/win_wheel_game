import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import UserMoneyDialog from "@/components/ui/UserMoneyDialog";
import useUserAxios from "@/hooks/useUserAxios";

interface Tx {
  id: string;
  amount: number;
  type: string;
  createdAt: string;
  optimistic?: boolean;
}

export default function UserWithdrawPage() {
  const axios = useUserAxios();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Tx[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    const res = await axios.get(`/transactions/me?page=${page}&limit=10&type=WITHDRAWAL`);
    setRows(res.data?.data ?? []);
    setTotalPages(res.data?.pagination?.totalPages ?? 1);
  }, [axios, page]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const onCreate = (e: Event) => {
      const tx = (e as CustomEvent<Tx>).detail;
      if (tx.type === "WITHDRAWAL") setRows((prev) => [tx, ...prev]);
    };
    const onConfirm = (e: Event) => {
      const tx = (e as CustomEvent<Tx>).detail;
      if (tx.type === "WITHDRAWAL") setRows((prev) => [tx, ...prev.filter((x) => !x.optimistic)]);
    };
    const onRevert = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      setRows((prev) => prev.filter((x) => x.id !== id));
    };
    window.addEventListener("wallet:tx-created", onCreate);
    window.addEventListener("wallet:tx-confirmed", onConfirm);
    window.addEventListener("wallet:tx-reverted", onRevert);
    return () => {
      window.removeEventListener("wallet:tx-created", onCreate);
      window.removeEventListener("wallet:tx-confirmed", onConfirm);
      window.removeEventListener("wallet:tx-reverted", onRevert);
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim();
    if (!q) return rows;
    return rows.filter((r) => String(Math.abs(Number(r.amount))).includes(q));
  }, [rows, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search amount" className="sm:max-w-xs" />
        <Button onClick={() => setOpen(true)}>New Withdrawal</Button>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <div className="grid grid-cols-3 bg-card px-3 py-2 text-xs font-semibold text-muted-foreground">
          <div>Amount</div><div>Time</div><div>Status</div>
        </div>
        {filtered.map((row) => (
          <div key={row.id} className="grid grid-cols-3 px-3 py-2 text-sm border-t border-border">
            <div>RWF {Math.abs(Number(row.amount)).toLocaleString()}</div>
            <div>{new Date(row.createdAt).toLocaleString()}</div>
            <div>{row.optimistic ? "Pending" : "Completed"}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <Button variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
        <span className="text-sm text-muted-foreground">Page {page} / {totalPages}</span>
        <Button variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
      </div>

      <UserMoneyDialog open={open} onOpenChange={setOpen} action="withdraw" />
    </div>
  );
}
