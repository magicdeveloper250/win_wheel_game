// =============================================================================
// src/lib/permissions.ts  —  single source of truth for perm keys
// =============================================================================
export const P = {
  BROWSE_JOBS:           "jobs:browse",
  APPLY_TO_JOBS:         "jobs:apply",
  VIEW_MATCHES:          "jobs:view_matches",
  REFRESH_MATCHES:       "jobs:refresh_matches",
  EDIT_OWN_PROFILE:      "profile:edit",
  UPLOAD_AVATAR:         "profile:upload_avatar",
  VIEW_OWN_APPLICATIONS: "applications:view_own",
  CREATE_JOBS:           "jobs:create",
  EDIT_OWN_JOBS:         "jobs:edit_own",
  DELETE_OWN_JOBS:       "jobs:delete_own",
  VIEW_APPLICANTS:       "applicants:view",
  UPDATE_APP_STATUS:     "applicants:update_status",
  CREATE_COMPANY:        "companies:create",
  EDIT_OWN_COMPANY:      "companies:edit_own",
  DELETE_OWN_COMPANY:    "companies:delete_own",
  VIEW_ALL_USERS:        "admin:view_users",
  MANAGE_USERS:          "admin:manage_users",
  GRANT_PERMISSIONS:     "admin:grant_permissions",
  MANAGE_ALL_JOBS:       "admin:manage_jobs",
  MANAGE_ALL_COMPANIES:  "admin:manage_companies",
  MANAGE_ALL_APPS:       "admin:manage_applications",
  VIEW_ANALYTICS:        "analytics:view",
} as const
 
export type Permission = typeof P[keyof typeof P]