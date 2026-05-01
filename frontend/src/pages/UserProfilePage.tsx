import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import useSession from "@/hooks/useSession";
import useUserAxios from "@/hooks/useUserAxios";
import { cn } from "@/lib/utils";

export default function UserProfilePage() {
  const { session, setSession } = useSession();
  const axios = useUserAxios();
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm({
      name: session?.name ?? "",
      email: session?.email ?? "",
      phone: session?.phone ?? "",
    });
  }, [session]);

  const save = async () => {
    if (!session?.id) return;
    setSaving(true);
    try {
      const res = await axios.patch(`/auth/${session.id}`, form);
      setSession({ ...(session as any), ...res.data });
      toast.success("Profile updated.");
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? "Failed to update profile.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full rounded-lg border border-border bg-card p-4 space-y-4">
      <div className="text-lg font-semibold">Profile</div>
      <div className="grid gap-2">
        <Label>Name</Label>
        <Input
          value={form.name}
          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          className={cn("p-6")}
        />
      </div>
      <div className="grid gap-2">
        <Label>Email</Label>
        <Input
          value={form.email}
          onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
          className={cn("p-6")}
        />
      </div>
      <div className="grid gap-2">
        <Label>Phone</Label>
        <Input
          value={form.phone}
          onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
          className={cn("p-6")}
        />
      </div>
      <Button onClick={save} disabled={saving} className={cn("p-6")}>
        {saving ? "Saving..." : "Save Changes"}
      </Button>
    </div>
  );
}
