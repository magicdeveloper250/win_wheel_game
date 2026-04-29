import { usePermissions } from "@/contexts/PermissionContext"
import { type Permission } from "@/lib/permissions"
 
export function useCan(perm: Permission | Permission[], mode: "all" | "any" = "all"): boolean {
  const { can, canAny } = usePermissions()
  const perms = Array.isArray(perm) ? perm : [perm]
  return mode === "any" ? canAny(...perms) : can(...perms)
}