import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';

export default function RequireAuth() {
  const location = useLocation();
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) return null;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}

