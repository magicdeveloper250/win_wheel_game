import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
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
import RegisterPage from "./pages/RegisterPage";
import UserAppLayout from "./layouts/UserAppLayout";
import UserDashboardPage from "./pages/UserDashboardPage";
import UserTransactionsPage from "./pages/UserTransactionsPage";
import UserProfilePage from "./pages/UserProfilePage";
import UserMyBetsPage from "./pages/UserMyBetsPage";
import UserWithdrawPage from "./pages/UserWithdrawPage";
import UserChangePasswordPage from "./pages/UserChangePasswordPage";
import useSession from "@/hooks/useSession";
import { UserRole } from "./lib/types";
import UsersPage from "./pages/UsersPage";

const RootRedirect = () => {
  const { session } = useSession();
  return session?.role === UserRole.ADMIN ? (
    <Navigate to="/dashboard" />
  ) : (
    <Navigate to="/app" />
  );
};

const App = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<RefreshLayout />}>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/logout" element={<LogoutPage />} />
          <Route path="/unauthorized" element={<UnauthorizedPage />} />
          <Route path="*" element={<NotFoundPage />} />
          <Route element={<LoginRequiredLayout />}>
            <Route element={<AppLayout />}>
              <Route index element={<DashboardPage />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/sessions" element={<SessionsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/users" element={<UsersPage />} />
              <Route path="financials" element={<FinancialPage />} />
              <Route path="profile" element={<UserProfilePage />} />
              <Route
                path="change-password"
                element={<UserChangePasswordPage />}
              />
            </Route>
            <Route element={<NotificationLayout />}>
              <Route path="/app" element={<UserAppLayout />}>
                <Route index element={<UserDashboardPage />} />
                <Route path="game" element={<GamePage />} />
                <Route path="dashboard" element={<UserDashboardPage />} />
                <Route path="transactions" element={<UserTransactionsPage />} />
                <Route path="profile" element={<UserProfilePage />} />
                <Route
                  path="change-password"
                  element={<UserChangePasswordPage />}
                />
                <Route path="my-bets" element={<UserMyBetsPage />} />
                <Route path="withdraw" element={<UserWithdrawPage />} />
              </Route>
            </Route>
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
};

export default App;
