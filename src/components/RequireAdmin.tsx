import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';

/** Optional bootstrap allowlist (IDs/emails). Primary gate is profiles.is_admin via /api/auth/me. */
const ADMIN_USER_IDS = (import.meta.env.VITE_ADMIN_USER_IDS || '').split(',').filter(Boolean);

export default function RequireAdmin() {
  const { user, isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) return null;

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  const allowlisted =
    ADMIN_USER_IDS.includes(user.id) ||
    (user.email && ADMIN_USER_IDS.includes(user.email));

  const isAdmin = Boolean(user.isAdmin) || allowlisted;

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
