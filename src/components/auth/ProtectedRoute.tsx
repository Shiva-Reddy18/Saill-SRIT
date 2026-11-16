import React, { useEffect, useState } from 'react';
import { Page } from '../../types';
import { UserRole } from '../../types/auth';
import { AccessDenied } from './AccessDenied';
import { useAuth } from '../../context/AuthContext';

interface ProtectedRouteProps {
  page: Page;
  onReturnToDashboard: (page: Page) => void;
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  page,
  onReturnToDashboard,
  children
}) => {
  const { user, role, isLoading, refreshUser, hasAccess, getRedirectPage } = useAuth();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    let active = true;
    setIsChecking(true);
    void refreshUser().catch((error: unknown) => {
      console.error('[ProtectedRoute] Account authorization check failed:', error);
    }).finally(() => {
      if (active) setIsChecking(false);
    });
    return () => {
      active = false;
    };
  }, [page, refreshUser]);

  const dashboardRoles: Partial<Record<Page, UserRole>> = {
    dashboard: 'STUDENT',
    'faculty-dashboard': 'FACULTY_INCHARGE',
    'admin-control': 'ADMINISTRATOR'
  };
  const dashboardRole = dashboardRoles[page];
  const redirectPage = !user || user.status !== 'approved'
    ? 'login'
    : dashboardRole && dashboardRole !== role
      ? getRedirectPage()
      : null;

  useEffect(() => {
    if (!isLoading && !isChecking && redirectPage) {
      onReturnToDashboard(redirectPage);
    }
  }, [isLoading, isChecking, redirectPage, onReturnToDashboard]);

  if (isLoading || isChecking) {
    return <div role="status" className="p-8 text-center text-sm font-semibold">Verifying account access…</div>;
  }

  if (redirectPage || !user) return null;

  const isAuthorized = hasAccess(page);

  if (!isAuthorized) {
    return (
      <AccessDenied
        userRole={role}
        onReturnToDashboard={onReturnToDashboard}
      />
    );
  }

  return <>{children}</>;
};
