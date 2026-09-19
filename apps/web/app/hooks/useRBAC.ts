import React, { useState, useEffect } from "react";
import { authClient } from "../../lib/auth-client";
import { createServerFn } from "@tanstack/react-start";

export type UserRole = "admin" | "user" | "guest";

export interface RBACState {
  user: any | null;
  role: UserRole;
  isAdmin: boolean;
  isAuthenticated: boolean;
  isLoading: boolean;
  hasRole: (allowedRoles: UserRole[]) => boolean;
}

const checkAdminRightsServerFn = createServerFn({ method: "POST" })
  .validator((email: string) => email)
  .handler(async (ctx) => {
    const email = ctx.data.toLowerCase();
    const adminUsersEnv = process.env.ADMIN_USERS || (globalThis as any)?.ADMIN_USERS || "";
    
    if (!adminUsersEnv) {
      return { authorized: false };
    }
    
    const allowed = adminUsersEnv
      .split(",")
      .map((e: string) => e.trim().replace(/['"]/g, "").toLowerCase());
    
    return { authorized: allowed.includes(email) };
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
