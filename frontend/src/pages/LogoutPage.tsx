import useSession from "@/hooks/useSession"
import useUserAxios from "@/hooks/useUserAxios"
import { Loader2 } from "lucide-react"
import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"

function LogoutPage() {
  const [loggingOut, setLoggingOut] = useState(false)
  const { setSession } = useSession()
  const navigate = useNavigate()
  const axios = useUserAxios()
  const handleLogout = async () => {
    try {
      setLoggingOut(true)
      await axios.post("/auth/logout")
    } catch (error) {
         setSession(undefined)
    } finally {
      setSession(undefined)
      setLoggingOut(false)
      navigate("/login")
    }
  }
  useEffect(()=>{
    handleLogout()
  },[])
  return <div className="flex w-full items-center justify-center">
    {loggingOut&&<Loader2 className="animate-spin"/>}
  </div>
}

export default LogoutPage
