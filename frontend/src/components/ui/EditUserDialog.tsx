import { useEffect, useState } from "react";
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
import { UserRole, type User } from "@/lib/types";
import { Switch } from "./switch";

interface UserEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User;
}

export default function EditUserDialog({
  open,
  onOpenChange,
  user,
}: UserEditDialogProps) {
  const axios = useUserAxios();
  const [formData, setFormData] = useState<User>(user);
  const [submitting, setSubmitting] = useState(false);
  const { session, setSession } = useSession();

  useEffect(() => {
    if (open) {
      setFormData(user);
    }
  }, [open, user]);

  const handleChange = <K extends keyof User>(field: K, value: User[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const res = await axios.patch(`/auth/${user.id}`, formData);
      window.dispatchEvent(
        new CustomEvent("wallet:tx-confirmed", { detail: res.data }),
      );
      toast.success("User info updated successfully.");
      setSession({
        ...session,
        balance: res.data.balance,
      } as any);
      onOpenChange(false);
    } catch (err) {
      toast.error(
        isAxiosError(err)
          ? (err.response?.data?.error ?? err.message)
          : "User update failed.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-2xl border border-border">
        <DialogHeader>
          <DialogTitle>Update User Info</DialogTitle>
          <DialogDescription>{`Update user [${user.name}]`}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => handleChange("name", e.target.value)}
              placeholder="Enter name"
              className="p-6 w-full"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => handleChange("email", e.target.value)}
              placeholder="Enter email"
              className="p-6 w-full"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              type="tel"
              value={formData.phone ?? ""}
              onChange={(e) => handleChange("phone", e.target.value)}
              placeholder="Enter phone number"
              className="p-6 w-full"
            />
          </div>

          <div className="grid gap-2">
            <Label>Role</Label>
            <Select
              value={formData.role}
              onValueChange={(v: UserRole) => handleChange("role", v)}
            >
              <SelectTrigger className="w-full p-6">
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                {Object.keys(UserRole).map((u, i) => {
                  return (
                    <SelectItem value={u} key={i}>
                      {u}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>Status</Label>
            <Switch
              checked={formData.isActive}
              onCheckedChange={(checked) => handleChange("isActive", checked)}
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
            {submitting ? "Updating..." : "Update"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
