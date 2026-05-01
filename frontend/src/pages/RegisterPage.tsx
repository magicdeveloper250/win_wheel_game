import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button} from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Logo from "@/components/ui/Logo";
import useUserAxios from "@/hooks/useUserAxios";
import useSession from "@/hooks/useSession";
import { usePermissions } from "@/contexts/PermissionContext";
import { cn } from "@/lib/utils";

interface RegisterForm {
  name: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
}

export default function RegisterPage() {
  const axios = useUserAxios();
  const navigate = useNavigate();
  const { setSession } = useSession();
  const { refresh } = usePermissions();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<RegisterForm>({
    name: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (form.password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError("Password and confirm password do not match.");
      return;
    }

    setLoading(true);
    try {
      await axios.post("/auth", {
        name: form.name,
        email: form.email,
        phone: form.phone || undefined,
        password: form.password,
      });
      const loginResp = await axios.post("/auth/login", {
        email: form.email,
        password: form.password,
        type: "custom",
      });
      setSession(loginResp.data);
      refresh();
      toast.success("Account created. You are now logged in.");
      navigate("/app/dashboard");
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "Failed to create account.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-lg border border-border bg-primary/10 p-5 space-y-4">
        <div className="flex justify-center"><Logo /></div>
        <div className="text-center">
          <h1 className="text-xl font-bold">Create Account</h1>
          <p className="text-sm text-muted-foreground">Register as a regular user</p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="name">Name</label>
          <Input id="name" required value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} className={cn("p-6")} />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="email">Email</label>
          <Input id="email" type="email" required value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} className={cn("p-6")} />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="phone">Phone</label>
          <Input id="phone" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} className={cn("p-6")}/>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="password">Password</label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              required
              value={form.password}
              onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
              className="pr-10 p-6"
            />
            <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="confirm-password">Confirm Password</label>
          <div className="relative">
            <Input
              id="confirm-password"
              type={showConfirmPassword ? "text" : "password"}
              required
              value={form.confirmPassword}
              onChange={(e) => setForm((p) => ({ ...p, confirmPassword: e.target.value }))}
              className="pr-10"
            />
            <button type="button" onClick={() => setShowConfirmPassword((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
              {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button type="submit"  className={cn("p-6 cursor-pointer hover:opacity-85 w-full")} disabled={loading}>
          {loading ? <Loader2 className="animate-spin" /> : "Create Account"}
        </Button>

        <p className="text-sm text-center text-muted-foreground">
          Already have an account? <Link to="/login" className="text-primary hover:underline">Login</Link>
        </p>
      </form>
    </div>
  );
}
