import React from "react";
import { useRBAC, UserRole } from "../../hooks/useRBAC";

interface RoleGuardProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
  requireAdmin?: boolean;
  fallback?: React.ReactNode;
  loadingFallback?: React.ReactNode;
}

/**
 * Declarative component guard that renders children only if the logged-in user
 * matches the allowed role requirements.
 */
export function RoleGuard({
  children,
  allowedRoles,
  requireAdmin = false,
  fallback = null,
  loadingFallback = null,
}: RoleGuardProps) {
  const { role, isAdmin, isLoading } = useRBAC();

  if (isLoading) {
    return <>{loadingFallback}</>;
  }

  if (requireAdmin && !isAdmin) {
    return <>{fallback}</>;
  }

  if (allowedRoles && !allowedRoles.includes(role)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
