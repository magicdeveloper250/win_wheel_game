import { Navigate, Outlet } from "react-router-dom"
import useSession from "@/hooks/useSession"
const LoginRequiredLayout: React.FC = () => {
  const { session, setSession } = useSession()

  if (!session) {
     setSession(undefined)
     return <Navigate to="/login" />
  }

  return (
      <Outlet />
  )
}

export default LoginRequiredLayout
