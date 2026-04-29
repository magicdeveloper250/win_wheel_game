import useSession from "@/hooks/useSession";
import { useLocation, Navigate, Outlet } from "react-router-dom";

const AdminRequiredLayout: React.FC = () => {
  const{session}= useSession()
  const location = useLocation();

  return session?.role === "admin" ? (
        <Outlet />
      ) : (
        <Navigate to="/unauthorized" state={{ from: location }} replace />
      )
};

export default AdminRequiredLayout;
