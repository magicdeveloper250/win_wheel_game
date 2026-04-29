import useSession from "@/hooks/useSession"
import useUserAxios from "@/hooks/useUserAxios"
import { googleLogout } from "@react-oauth/google"
import { Loader2 } from "lucide-react"
import { useEffect, useState } from "react"

function Logout() {
  const [loggingOut, setLoggingOut] = useState(false)
  const { setSession } = useSession()
  const axios = useUserAxios()
  const handleLogout = async () => {
    try {
      setLoggingOut(true)
      await axios.post("/auth/logout")
      googleLogout()
    } catch (error) {
         setSession(undefined)
    } finally {
      setSession(undefined)
      setLoggingOut(false)
    }
  }
  useEffect(()=>{
    handleLogout()
  },[])
  return <div className="flex w-full items-center justify-center">
    {loggingOut&&<Loader2 className="animate-spin"/>}
  </div>
}

export default Logout
