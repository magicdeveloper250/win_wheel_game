import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Logo from "@/components/ui/Logo";
import { usePermissions } from "@/contexts/PermissionContext";
import useSession from "@/hooks/useSession";
import useUserAxios from "@/hooks/useUserAxios";
import { UserRole } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ArrowRight, Loader2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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
     if(resp.data.role === UserRole.ADMIN){
      navigate("/dashboard");
     } else {
      navigate("/app");
     }
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Invalid email or password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen items-center align-middle justify-center px-4">
      <form
        className="w-full max-w-md flex flex-col gap-4 p-5 rounded-lg border border-border bg-primary/10"
        onSubmit={handleLogin}
      >
        <div className="flex justify-center">
          <Logo />
        </div>
        <div className="text-center">
          <h1 className="text-xl font-bold">Login</h1>
          <p className="text-sm text-muted-foreground">Welcome back</p>
        </div>
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
        <p className="text-sm text-center text-muted-foreground">
          Don't have an account?{" "}
          <Link to="/register" className="text-primary hover:underline">
            Register
          </Link>
        </p>
      </form>
    </div>
  );
}

export default LoginPage;
