import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import useSession from "@/hooks/useSession";
import useUserAxios from "@/hooks/useUserAxios";
import { User, Mail, Phone, Save } from "lucide-react";

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
      toast.success("Profile updated successfully.");
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? "Failed to update profile.");
    } finally {
      setSaving(false);
    }
  };

  const initials = form.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4 sm:px-6 lg:px-8">
      <div className="w-full  space-y-6">

        <div>
          <h1 className="text-2xl font-bold tracking-tight">Account Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your personal information and contact details.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">

          <div className="bg-muted/40 px-6 py-5 flex items-center gap-4 border-b border-border">
            <Avatar className="h-14 w-14">
              <AvatarFallback className="text-lg font-semibold bg-primary text-primary-foreground">
                {initials || <User className="h-6 w-6" />}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold text-base leading-tight">
                {form.name || "Your Name"}
              </p>
              <p className="text-sm text-muted-foreground">{form.email || "your@email.com"}</p>
            </div>
          </div>

          <div className="px-6 py-6 space-y-5">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Personal Information
            </p>

            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-sm font-medium">
                Full Name
              </Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  className="pl-9 h-10"
                  placeholder="John Doe"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-sm font-medium">
                Email Address
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                  className="pl-9 h-10"
                  placeholder="john@example.com"
                />
              </div>
            </div>

            {/* Phone */}
            <div className="space-y-1.5">
              <Label htmlFor="phone" className="text-sm font-medium">
                Phone Number
              </Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                  className="pl-9 h-10"
                  placeholder="+1 (555) 000-0000"
                />
              </div>
            </div>
          </div>

          <Separator />
          <div className="px-6 py-4 flex items-center justify-between bg-muted/20">
            <p className="text-xs text-muted-foreground">
              All changes are saved to your account.
            </p>
            <Button
              onClick={save}
              disabled={saving}
              size="sm"
              className="gap-2"
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>

      </div>
    </div>
  );
}