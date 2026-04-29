import { useContext } from "react";
import userSessionContext from "@/contexts/userSessionContext";

const useSession = () => {
  const context = useContext(userSessionContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

export default useSession;
