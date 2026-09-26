import { createServerFn } from "@tanstack/react-start";
import { getWebRequest } from "@tanstack/react-start/server";
import { useEffect, useState } from "react";
import { requireAdmin } from "../../lib/auth";
import { authClient } from "../../lib/auth-client";

export type UserRole = "admin" | "user" | "guest";

export interface RBACState {
  user: any | null;
  role: UserRole;
  isAdmin: boolean;
  isAuthenticated: boolean;
  isLoading: boolean;
  hasRole: (allowedRoles: UserRole[]) => boolean;
}

// Is the *signed-in* user an admin? Resolved from the session cookie on the server, through the
// same rule packages/api's adminProcedure enforces (packages/auth's isAdminUser). It deliberately
// takes no input: a previous version accepted any email from the browser and answered whether that
// address was an admin, without requiring sign-in — which let anyone enumerate admin emails.
const checkCurrentUserIsAdminFn = createServerFn({ method: "GET" }).handler(async () => {
  const request = getWebRequest();
  if (!request) return { authorized: false };
  const result = await requireAdmin({ request: { headers: new Headers(request.headers) } });
  return { authorized: result.authorized };
});

export function useRBAC(): RBACState {
  const { data: session, isPending: isLoadingSession } = authClient.useSession();
  const [isAdminServer, setIsAdminServer] = useState(false);
  const [isCheckingAdmin, setIsCheckingAdmin] = useState(false);

  const user = session?.user ?? null;
  const isAuthenticated = !!user;

  useEffect(() => {
    if (user?.email) {
      // Check if role is directly 'admin' on user object
      if ((user as any)?.role === "admin") {
        setIsAdminServer(true);
        return;
      }

      // Check against the server's ADMIN_USERS list, for this session
      setIsCheckingAdmin(true);
      checkCurrentUserIsAdminFn()
        .then((res) => setIsAdminServer(res.authorized))
        .catch(() => setIsAdminServer(false))
        .finally(() => setIsCheckingAdmin(false));
    } else {
      setIsAdminServer(false);
    }
  }, [user?.email, (user as any)?.role]);

  const isAdmin = isAuthenticated && ((user as any)?.role === "admin" || isAdminServer);
  const role: UserRole = !isAuthenticated ? "guest" : isAdmin ? "admin" : "user";

  const hasRole = (allowedRoles: UserRole[]): boolean => {
    return allowedRoles.includes(role);
  };

  return {
    user,
    role,
    isAdmin,
    isAuthenticated,
    isLoading: isLoadingSession || isCheckingAdmin,
    hasRole,
  };
}
