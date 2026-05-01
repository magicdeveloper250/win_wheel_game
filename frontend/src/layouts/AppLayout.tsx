import Sidebar from "@/components/ui/Sidebar";
import useSession from "@/hooks/useSession";
import { UserRole } from "@/lib/types";
import { Navigate, Outlet } from "react-router-dom";

function AppLayout() {

  const {session}= useSession()
  console.log( session?.role == UserRole.ADMIN)
  return session?.role !== UserRole.ADMIN ? (
    <Navigate to="/unauthorized" replace />
  ) :  (
    
    <div className="flex flex-col md:flex-row h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}

export default AppLayout;