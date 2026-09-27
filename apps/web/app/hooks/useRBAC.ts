import { useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { getWebRequest } from "@tanstack/react-start/server";
import { requireAdmin } from "../../lib/auth";
import { authClient } from "../../lib/auth-client";

export type UserRole = "admin" | "user" | "guest";

export interface RBACState {
  user: any | null;
  role: UserRole;
  isAdmin: boolean;
  isAuthenticated: boolean;
  /** Loading anything — the session, or (once signed in) whether the user is an admin. */
  isLoading: boolean;
  /** The session itself is still loading: whether anyone is signed in isn't known yet. */
  isSessionLoading: boolean;
  /** Signed in, and whether they're an admin isn't known yet. */
  isAdminLoading: boolean;
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
  const { data: session, isPending: isSessionLoading } = authClient.useSession();

  const user = session?.user ?? null;
  const isAuthenticated = !!user;
  const hasAdminRole = (user as any)?.role === "admin";

  // One shared, cached request for every component that asks (header, Dashboard button, account
  // menus, route guards) — each used to fire its own check, and each started out as "not an
  // admin", so the Dashboard button popped in late. Keyed by user, so signing out or switching
  // accounts never reuses the previous answer.
  const adminQuery = useQuery({
    queryKey: ["current-user-is-admin", user?.id ?? null],
    queryFn: () => checkCurrentUserIsAdminFn(),
    enabled: isAuthenticated && !hasAdminRole,
    staleTime: 5 * 60_000,
  });

  const isAdminLoading = isAuthenticated && !hasAdminRole && adminQuery.isPending;
  const isAdmin = isAuthenticated && (hasAdminRole || adminQuery.data?.authorized === true);
  const role: UserRole = !isAuthenticated ? "guest" : isAdmin ? "admin" : "user";

  const hasRole = (allowedRoles: UserRole[]): boolean => {
    return allowedRoles.includes(role);
  };

  return {
    user,
    role,
    isAdmin,
    isAuthenticated,
    isLoading: isSessionLoading || isAdminLoading,
    isSessionLoading,
    isAdminLoading,
    hasRole,
  };
}
