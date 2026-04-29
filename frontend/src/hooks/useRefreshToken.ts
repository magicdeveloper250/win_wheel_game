import { isAxiosError } from "axios"
import axios from "@/lib/axios"
import { toast } from "sonner"
import useSession from "./useSession"
import type { Session } from "@/contexts/userSessionContext"
import { usePermissions } from "@/contexts/PermissionContext"
const useRefreshToken = () => {
  const { setSession } = useSession()
  const{refresh:refreshPermissions}=usePermissions()

  const refresh = async () => {
    try {
      const resp = await axios.post("/auth/refresh/", {})
      const sessionData = resp.data as Session
      setSession(sessionData)
      refreshPermissions()
      return sessionData.token
    } catch (err: any) {
      const error = err
      if (isAxiosError(err)) {
        toast.error(
          error.response?.data?.message || error.message || "Unknown error"
        )
      }
    } 
  }

  return refresh
}

export default useRefreshToken
