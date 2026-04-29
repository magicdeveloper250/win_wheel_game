import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Logo from "@/components/ui/Logo";
import { usePermissions } from "@/contexts/PermissionContext";
import useSession from "@/hooks/useSession";
import useUserAxios from "@/hooks/useUserAxios";
import { cn } from "@/lib/utils";
import { ArrowRight, Loader2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
interface LoginData {
  email: string;
  password: string;
}

function LoginPage() {
  const [loading, setLoading] = useState(false);
  const { refresh } = usePermissions();
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const [loginData, setLoginData] = useState<LoginData>({
    email: "",
    password: "",
  });

  const { setSession } = useSession();
  const axios = useUserAxios();
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const resp = await axios.post("/auth/login", {
        ...loginData,
        type: "custom",
      });
      refresh();
      setSession(resp.data);
      navigate("/dashboard");
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Invalid email or password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen items-center align-middle justify-center">
      <Logo />
      <form
        className="flex flex-col gap-4 p-4 rounded bg-primary/10"
        onSubmit={handleLogin}
      >
        <div>
          <label htmlFor="email">Email</label>
          <Input
            type="email"
            id="email"
            className={cn("p-6")}
            required
            value={loginData.email}
            onChange={(e) =>
              setLoginData((p) => ({ ...p, email: e.target.value }))
            }
          />
        </div>
        <div>
          <label htmlFor="password">Password</label>
          <Input
            type="password"
            id="password"
            className={cn("p-6")}
            required
            value={loginData.password}
            onChange={(e) =>
              setLoginData((p) => ({ ...p, password: e.target.value }))
            }
          />
        </div>
        <div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription className="text-sm">{error}</AlertDescription>
            </Alert>
          )}
        </div>
        <div className="flex justify-center items-center">
          <Button
            className={cn("p-6 cursor-pointer hover:opacity-85")}
            type="submit"
            disabled={loading}
          >
            Authorize Access{" "}
            {loading ? (
              <Loader2 className="animate-spin" />
            ) : (
              <ArrowRight />
            )}{" "}
          </Button>
        </div>
      </form>
    </div>
  );
}

export default LoginPage;
