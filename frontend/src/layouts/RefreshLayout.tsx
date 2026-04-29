import { useEffect, useRef, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import useRefreshToken from "../hooks/useRefreshToken";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { isAxiosError } from "axios";
import useSession from "@/hooks/useSession";

const RefreshLayout: React.FC = () => {
  const [refreshing, setRefreshing] = useState<boolean>(true);
  const refreshToken = useRefreshToken();
  const { session } = useSession();
  const navigate = useNavigate();
  const hasFetched = useRef(false);

  useEffect(() => {
    if (session) {
      setRefreshing(false);
      return;
    }

    if (hasFetched.current) return;
    hasFetched.current = true;

    const refresh = async (): Promise<void> => {
      try {
        await refreshToken();
      } catch (error: unknown) {
        if (isAxiosError(error)) {
          const status = error.response?.status;

          if (status === 401 || status === 403) {
            navigate("/login", { replace: true });
            return;
          }

          toast.error(error.response?.data?.error ?? error.message ?? "Something went wrong.");
        } else {
          toast.error("Session expired. Please log in again.");
          navigate("/login", { replace: true });
        }
      } finally {
        setRefreshing(false);
      }
    };

    refresh();
  }, [session]);

  if (!refreshing) return <Outlet />;

  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <Loader2
          size={32}
          className="animate-spin text-primary"
          aria-hidden="true"
        />
         
      </div>
    </div>
  );
};

export default RefreshLayout;