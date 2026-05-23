import { useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

import useSession from "@/hooks/useSession";
import useUserAxios from "@/hooks/useUserAxios";
import PasswordInput from "@/components/ui/PasswordInput";
import StrengthBar from "@/components/ui/PasswordStrengthBar";




export default function UserChangePasswordPage() {
  const axios = useUserAxios();
  const { session } = useSession();

  const [password, setPassword]               = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword]       = useState(false);
  const [showConfirm, setShowConfirm]         = useState(false);
  const [saving, setSaving]                   = useState(false);
  const [error, setError]                     = useState<string | null>(null);

  const mismatch = confirmPassword.length > 0 && password !== confirmPassword;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!session?.id) { setError("Session not found."); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }

    setSaving(true);
    try {
      await axios.patch(`/auth/${session.id}/password`, { password });
      toast.success("Password updated successfully.");
      setPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "Failed to change password.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full p-2">
      <form
        onSubmit={submit}
        className="rounded-xl border border-border bg-card shadow-sm overflow-hidden"
      >
        <div className="flex items-center gap-3 border-b border-border px-5 py-4 bg-muted/30">
          <div className="rounded-lg bg-primary/10 p-2 shrink-0">
            <ShieldCheck size={16} className="text-primary" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-foreground">Change Password</h1>
            <p className="text-xs text-muted-foreground">
              Use a strong password with at least 6 characters
            </p>
          </div>
        </div>

        <div className="px-5 py-5 space-y-5">
          <div className="space-y-1">
            <PasswordInput
              id="new-password"
              label="New Password"
              value={password}
              onChange={setPassword}
              show={showPassword}
              onToggleShow={() => setShowPassword((v) => !v)}
            />
            <StrengthBar password={password} />
          </div>

          <div className="space-y-1">
            <PasswordInput
              id="confirm-new-password"
              label="Confirm New Password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              show={showConfirm}
              onToggleShow={() => setShowConfirm((v) => !v)}
            />
            {mismatch && (
              <p className="text-xs text-destructive font-medium pt-0.5">
                Passwords do not match
              </p>
            )}
          </div>

          {error && (
            <Alert variant="destructive" className="py-2.5">
              <AlertDescription className="text-xs">{error}</AlertDescription>
            </Alert>
          )}

          <Button
            type="submit"
            disabled={saving || mismatch || password.length < 6}
            className="w-full h-11 gap-2 font-semibold"
          >
            {saving ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                Updating…
              </>
            ) : (
              <>
                <ShieldCheck size={15} />
                Update Password
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}