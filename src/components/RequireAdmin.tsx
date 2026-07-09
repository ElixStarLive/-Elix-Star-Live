import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';

// Admin user IDs — in production, check a role/claim from backend
const ADMIN_USER_IDS = (import.meta.env.VITE_ADMIN_USER_IDS || '').split(',').filter(Boolean);

export default function RequireAdmin() {
  const { user, isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) return null;

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  const isAdmin =
    ADMIN_USER_IDS.includes(user.id) ||
    (user.email && ADMIN_USER_IDS.includes(user.email)) ||
    (user.email && user.email.endsWith('@elixstar.com'));

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
