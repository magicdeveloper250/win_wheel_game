import {  useEffect,   useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import useUserAxios from "@/hooks/useUserAxios";
import useSession from "@/hooks/useSession";

interface Tx {
  id: string;
  amount: number;
  type: string;
  createdAt: string;
}
interface Bet {
  id: string;
  amount: number;
  targetNumber: number;
  createdAt: string;
}

export default function UserDashboardPage() {
  const axios = useUserAxios();
  const [txs, setTxs] = useState<Tx[]>([]);
  const [bets, setBets] = useState<Bet[]>([]);
  const{session}= useSession();

  useEffect(() => {
    void axios.get("/transactions/me?limit=5&page=1").then((r) => setTxs(r.data?.data ?? []));
    void axios.get("/bets/me?limit=5&page=1").then((r) => setBets(r.data?.data ?? []));
  }, [axios]);

   

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Current Balance</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">RWF {Number(session?.balance).toLocaleString()}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Recent Transactions</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{txs.length}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Recent Bets</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{bets.length}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Recent Transactions</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {txs.map((tx) => (
            <div key={tx.id} className="flex items-center justify-between rounded border border-border px-3 py-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline">{tx.type}</Badge>
                <span className="text-sm text-muted-foreground">{new Date(tx.createdAt).toLocaleString()}</span>
              </div>
              <div className="font-semibold">RWF {Number(tx.amount).toLocaleString()}</div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
