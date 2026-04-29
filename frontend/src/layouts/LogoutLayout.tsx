import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Loader } from "lucide-react";
import useUserAxios from "../hooks/useUserAxios";
import useSession from "@/hooks/useSession";
import { toast } from "sonner";
const Logout: React.FC = () => {
  const axios = useUserAxios();
  const{setSession}= useSession()
  const [isLoggedOut, setIsLoggedOut] = useState(false);

  const logout = async () => {
    try {
      await axios.post("/auth/logout/", {});
      setSession(undefined);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      toast.error( errorMessage );
    } finally {
      setIsLoggedOut(true);
       
    }
  };

  useEffect(() => {
    logout();
  }, []);

  return !isLoggedOut ? (
    <div className="flex justify-center items-center">
      <Loader className="animate-spin" />
    </div>
  ) : (
    <Navigate to="/" state={{ message: "Logged out" }} />
  );
};

export default Logout;
