import Sidebar from "@/components/ui/Sidebar";
import { Outlet } from "react-router-dom";

function AppLayout() {
  return (
    // Mobile: column (topbar on top, content below)
    // Desktop: row (sidebar left, content right)
    <div className="flex flex-col md:flex-row h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}

export default AppLayout;