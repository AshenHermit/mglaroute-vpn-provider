import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import { useEffect } from 'react';
import { ReactNode } from 'react';

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { token, isFirstRun, checkFirstRun, clearAuth } = useAuthStore();
  const location = useLocation();

  useEffect(() => {
    if (isFirstRun === null) {
      checkFirstRun();
    }
  }, [isFirstRun, checkFirstRun]);

  // A token persisted from a previous install is invalid on a fresh database.
  useEffect(() => {
    if (isFirstRun === true && token) {
      clearAuth();
    }
  }, [isFirstRun, token, clearAuth]);

  if (isFirstRun === null) {
    return null;
  }

  if (isFirstRun) {
    return <Navigate to="/setup" replace />;
  }

  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

export function PublicRoute({ children }: { children: ReactNode }) {
  const { token, isFirstRun, checkFirstRun } = useAuthStore();
  const location = useLocation();

  useEffect(() => {
    if (isFirstRun === null) {
      checkFirstRun();
    }
  }, [isFirstRun, checkFirstRun]);

  if (isFirstRun === null) {
    return null;
  }

  // First run: /setup is the only reachable page. Ignore any persisted token,
  // otherwise /setup -> / -> /setup becomes a redirect loop.
  if (isFirstRun) {
    if (location.pathname !== '/setup') {
      return <Navigate to="/setup" replace />;
    }
    return <>{children}</>;
  }

  if (token) {
    return <Navigate to="/" replace />;
  }

  if (location.pathname === '/setup') {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
