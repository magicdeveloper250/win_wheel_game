import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import useUserAxios from "@/hooks/useUserAxios";

interface Bet {
  id: string;
  targetNumber: number;
  amount: number;
  createdAt: string;
  session?: { sessionNumber: number, id:string };
}

export default function UserMyBetsPage() {
  const axios = useUserAxios();
  const [rows, setRows] = useState<Bet[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    const res = await axios.get(`/bets/me?page=${page}&limit=12`);
    setRows(res.data?.data ?? []);
    setTotalPages(res.data?.pagination?.totalPages ?? 1);
  }, [axios, page]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim();
    if (!q) return rows;
    return rows.filter((r) => String(r.targetNumber).includes(q) || String(r.amount).includes(q));
  }, [rows, search]);

  return (
    <div className="space-y-4">
      <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by number or amount" />
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="grid grid-cols-4 bg-card px-3 py-2 text-xs font-semibold text-muted-foreground">
          <div>Number</div><div>Amount</div><div>Session</div><div>Time</div>
        </div>
        {filtered.map((row) => (
          <div key={row.id} className="grid grid-cols-4 px-3 py-2 text-sm border-t border-border">
            <div>{row.targetNumber}</div>
            <div>RWF {Number(row.amount).toLocaleString()}</div>
            <div>#{row.session?.id ?? "-"}</div>
            <div>{new Date(row.createdAt).toLocaleString()}</div>
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
