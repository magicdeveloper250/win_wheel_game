import { BrowserRouter, Route, Routes } from "react-router-dom";
import RefreshLayout from "@/layouts/RefreshLayout";
import LoginRequiredLayout from "@/layouts/LoginRequiredLayout";
import NotificationLayout from "@/layouts/NotificationLayout";
import AppLayout from "@/layouts/AppLayout";
import GamePage from "./pages/GamePage";
import LogoutPage from "./pages/LogoutPage";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import UnauthorizedPage from "./pages/UnauthorizedPage";
import NotFoundPage from "./pages/NotFoundPage";
import SessionsPage from "./pages/SessionsPage";
import SettingsPage from "./pages/SettingsPage";
import FinancialPage from "./pages/FinancialPage";

const App = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<GamePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/logout" element={<LogoutPage />} />
        <Route path="/unauthorized" element={<UnauthorizedPage />} />
        <Route path="*" element={<NotFoundPage />} />
        <Route element={<RefreshLayout />}>
          <Route element={<AppLayout />}>
            <Route element={<LoginRequiredLayout />}>
              <Route element={<NotificationLayout />}>
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/sessions" element={<SessionsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="financials" element={<FinancialPage />} />
              </Route>
            </Route>
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
};

export default App;
