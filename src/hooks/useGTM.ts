import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

declare global {
  interface Window {
    dataLayer: any[];
  }
}

export const useGTM = () => {
  const location = useLocation();

  useEffect(() => {
    // Initialize dataLayer if it doesn't exist
    window.dataLayer = window.dataLayer || [];
    
    // Push pageview event to GTM
    window.dataLayer.push({
      event: 'pageview',
      page: {
        path: location.pathname,
        url: window.location.href,
        title: document.title,
      },
    });
  }, [location]);
};
