import { useEffect, useMemo, useState } from "react";
import { isAxiosError } from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import useUserAxios from "@/hooks/useUserAxios";
import useSession from "@/hooks/useSession";

export type MoneyAction = "deposit" | "withdraw";

type Provider = "MOMO" | "AIRTEL_MONEY";

interface UserMoneyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: MoneyAction;
  userId?: string|null;
  phoneNumber?: String;
}

export default function UserMoneyDialog({
  open,
  onOpenChange,
  action,
  userId,
  phoneNumber
}: UserMoneyDialogProps) {
  const axios = useUserAxios();
  const [provider, setProvider] = useState<Provider>("MOMO");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { session, setSession } = useSession();

  const title = action === "deposit" ? "Deposit Funds" : "Withdraw Funds";
  const endpoint =
    action === "deposit" ? "/transactions/deposit" : "/transactions/withdraw";
  const cta = action === "deposit" ? "Deposit" : "Withdraw";

  const parsedAmount = useMemo(() => Number(amount), [amount]);

  const submit = async () => {
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast.error("Enter a valid amount.");
      return;
    }

    setSubmitting(true);
    const optimistic = {
      id: `optimistic-${Date.now()}`,
      type: action === "deposit" ? "DEPOSIT" : "WITHDRAWAL",
      amount: action === "deposit" ? parsedAmount : -Math.abs(parsedAmount),
      createdAt: new Date().toISOString(),
      user: { id: "me", name: "You", email: "" },
      optimistic: true,
    };

    window.dispatchEvent(
      new CustomEvent("wallet:tx-created", { detail: optimistic }),
    );

    try {
      const res = await axios.post(endpoint, {
        userId: userId ? userId : session?.id,
        amount: parsedAmount,
        provider,
        phoneNumber:phoneNumber?phoneNumber:null
      });
      window.dispatchEvent(
        new CustomEvent("wallet:tx-confirmed", { detail: res.data }),
      );
      toast.success(`${cta} request successful.`);
      setAmount("");
      setSession({
        ...session,
        balance: res.data.balance,
      } as any);
      onOpenChange(false);
    } catch (err) {
      window.dispatchEvent(
        new CustomEvent("wallet:tx-reverted", { detail: optimistic.id }),
      );
      toast.error(
        isAxiosError(err)
          ? (err.response?.data?.error ?? err.message)
          : `${cta} failed.`,
      );
    } finally {
      setSubmitting(false);
    }
  };
useEffect(()=>{
  if(!open){
    setAmount("")
  }

},[open])
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Choose a provider and amount.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Provider</Label>
            <Select
              value={provider}
              onValueChange={(v) => setProvider(v as Provider)}
            >
              <SelectTrigger className="w-full p-6">
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MOMO">MoMo</SelectItem>
                <SelectItem value="AIRTEL_MONEY">Airtel Money</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>Amount</Label>
            <Input
              type="number"
              value={amount}
              min={0}
              step="0.01"
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Enter amount"
              className="p-6 w-full"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? `${cta}ing...` : cta}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
