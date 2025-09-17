import { useState, useEffect } from 'react';

const ADMIN_LAST_ROUTE_KEY = 'admin_last_route';

export function useAdminNavigation() {
  const [lastRoute, setLastRoute] = useState<string>(() => {
    return localStorage.getItem(ADMIN_LAST_ROUTE_KEY) || '/admin/dashboard';
  });

  const saveLastRoute = (route: string) => {
    if (route.startsWith('/admin')) {
      // If it's just '/admin', save '/admin/dashboard' instead
      const routeToSave = route === '/admin' ? '/admin/dashboard' : route;
      localStorage.setItem(ADMIN_LAST_ROUTE_KEY, routeToSave);
      setLastRoute(routeToSave);
    }
  };

  const getLastRoute = () => {
    return localStorage.getItem(ADMIN_LAST_ROUTE_KEY) || '/admin/dashboard';
  };

  useEffect(() => {
    // Save current route when component unmounts or route changes
    const handleBeforeUnload = () => {
      const currentPath = window.location.pathname;
      if (currentPath.startsWith('/admin')) {
        saveLastRoute(currentPath);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  return {
    lastRoute,
    saveLastRoute,
    getLastRoute
  };
}