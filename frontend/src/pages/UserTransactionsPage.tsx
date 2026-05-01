import { useCallback, useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import useUserAxios from "@/hooks/useUserAxios";

interface Tx {
  id: string;
  amount: number;
  type: string;
  createdAt: string;
  optimistic?: boolean;
}

export default function UserTransactionsPage() {
  const axios = useUserAxios();
  const [rows, setRows] = useState<Tx[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [type, setType] = useState("ALL");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    const q = new URLSearchParams({ page: String(page), limit: "10" });
    if (type !== "ALL") q.set("type", type);
    const res = await axios.get(`/transactions/me?${q.toString()}`);
    setRows(res.data?.data ?? []);
    setTotalPages(res.data?.pagination?.totalPages ?? 1);
  }, [axios, page, type]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onCreate = (e: Event) => {
      const detail = (e as CustomEvent<Tx>).detail;
      setRows((prev) => [detail, ...prev]);
    };
    const onConfirm = (e: Event) => {
      const detail = (e as CustomEvent<Tx>).detail;
      setRows((prev) => [detail, ...prev.filter((x) => !x.optimistic)]);
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
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.type.toLowerCase().includes(q) || String(r.amount).includes(q));
  }, [rows, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search transactions..." />
        <Select value={type} onValueChange={(v) => { setPage(1); setType(v); }}>
          <SelectTrigger className="sm:w-56"><SelectValue placeholder="Filter type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All types</SelectItem>
            <SelectItem value="DEPOSIT">Deposit</SelectItem>
            <SelectItem value="WITHDRAWAL">Withdrawal</SelectItem>
            <SelectItem value="BET">Bet</SelectItem>
            <SelectItem value="WIN_PAYOUT">Win payout</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <div className="grid grid-cols-4 bg-card px-3 py-2 text-xs font-semibold text-muted-foreground gap-2">
          <div>Type</div><div>Amount</div><div>Time</div><div>Status</div>
        </div>
        {filtered.map((row) => (
          <div key={row.id} className="grid grid-cols-4 px-3 py-2 text-sm border-t border-border gap-2">
            <div>{row.type}</div>
            <div>RWF {Number(row.amount).toLocaleString()}</div>
            <div>{new Date(row.createdAt).toLocaleDateString()}</div>
            <div>{row.optimistic ? "Pending" : "Done"}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <Button variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
        <span className="text-sm text-muted-foreground">Page {page} / {totalPages}</span>
        <Button variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
      </div>
    </div>
  );
}
