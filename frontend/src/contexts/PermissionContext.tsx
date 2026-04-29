// src/context/PermissionContext.tsx
// =============================================================================
import {
  createContext, useCallback, useContext,
  useEffect, useState, type ReactNode,
} from "react"
import { type Permission } from "@/lib/permissions"
import useUserAxios from "@/hooks/useUserAxios"
 
interface PermCtx {
  permissions: Set<Permission>
  role:        string | null
  loading:     boolean
  can:         (...p: Permission[]) => boolean
  canAny:      (...p: Permission[]) => boolean
  refresh:     () => Promise<void>
}
 
const PermissionContext = createContext<PermCtx>({
  permissions: new Set(), role: null, loading: true,
  can: () => false, canAny: () => false, refresh: async () => {},
})
 
export function PermissionProvider({ children }: { children: ReactNode }) {
  const axios = useUserAxios()
  const [permissions, setPermissions] = useState<Set<Permission>>(new Set())
  const [role,        setRole]        = useState<string | null>(null)
  const [loading,     setLoading]     = useState(true)
 
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await axios.get("/users/me/permissions")
      setPermissions(new Set(data.effective as Permission[]))
      setRole(data.role)
    } catch {
      setPermissions(new Set())
      setRole(null)
    } finally {
      setLoading(false)
    }
  }, [])
 
  useEffect(() => { load() }, [])
 
  const isSuperuser = permissions.has("*" as Permission)
 
  const can    = useCallback((...perms: Permission[]) =>
    isSuperuser || perms.every((p) => permissions.has(p)), [permissions])
 
  const canAny = useCallback((...perms: Permission[]) =>
    isSuperuser || perms.some((p)  => permissions.has(p)), [permissions])
 
  return (
    <PermissionContext.Provider value={{ permissions, role, loading, can, canAny, refresh: load }}>
      {children}
    </PermissionContext.Provider>
  )
}
 
export const usePermissions = () => useContext(PermissionContext)
 