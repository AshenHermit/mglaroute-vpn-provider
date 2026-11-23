import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import { useEffect } from 'react';
import { ReactNode } from 'react';

interface ProtectedRouteProps {
  children: ReactNode;
  requireSetup?: boolean;
}

export function ProtectedRoute({ children, requireSetup = true }: ProtectedRouteProps) {
  const { token, isFirstRun, checkFirstRun } = useAuthStore();
  const location = useLocation();

  useEffect(() => {
    if (token && isFirstRun === null) {
      checkFirstRun();
    }
  }, [token, isFirstRun, checkFirstRun]);

  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requireSetup && isFirstRun === true) {
    return <Navigate to="/setup" replace />;
  }

  if (!requireSetup && isFirstRun === false) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

export function PublicRoute({ children }: { children: ReactNode }) {
  const { token, isFirstRun, checkFirstRun } = useAuthStore();
  const location = useLocation();

  useEffect(() => {
    if (!token && isFirstRun === null) {
      checkFirstRun();
    }
  }, [token, isFirstRun, checkFirstRun]);

  if (token) {
    return <Navigate to="/" replace />;
  }

  if (isFirstRun === false) {
    return <Navigate to="/login" replace />;
  }

  if (isFirstRun === true && location.pathname !== '/setup') {
    return <Navigate to="/setup" replace />;
  }

  return <>{children}</>;
}