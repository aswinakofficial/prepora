import { isAdminUser } from "@prepora/auth";
import { createServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
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

// Delegates to the one canonical authorization rule (packages/auth's
// isAdminUser) instead of re-parsing ADMIN_USERS itself — a second,
// independent copy of that rule previously lived here and could drift
// from the version packages/api's adminProcedure actually enforces. See
// docs/architecture/prepora-next-level-plan.md finding #20.
const checkAdminRightsServerFn = createServerFn({ method: "POST" })
  .validator((email: string) => email)
  .handler(async (ctx) => {
    return { authorized: isAdminUser({ email: ctx.data }) };
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

      // Check against server ADMIN_USERS environment list
      setIsCheckingAdmin(true);
      checkAdminRightsServerFn({ data: user.email })
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
