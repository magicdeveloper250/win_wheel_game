import { usePermissions } from "@/contexts/PermissionContext"
import type { Permission } from "@/lib/permissions"
import type { ReactNode } from "react"
import { Navigate } from "react-router-dom"

interface ProtectedRouteProps {
  perm: Permission | Permission[]
  mode?: "all" | "any"
  children: ReactNode
  redirectTo?: string
}
 
export function ProtectedRoute({
  perm,
  mode = "all",
  children,
  redirectTo = "/",
}: ProtectedRouteProps) {
  const { can, canAny, loading } = usePermissions()
 
  if (loading) return null
 
  const perms   = Array.isArray(perm) ? perm : [perm]
  const allowed = mode === "any" ? canAny(...perms) : can(...perms)
 
  return allowed ? <>{children}</> : <Navigate to={redirectTo} replace />
}
 