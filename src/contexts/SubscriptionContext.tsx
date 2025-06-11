
import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '@/services/api';
import { useAuth } from './AuthContext';

interface SubscriptionContextType {
  isSubscribed: boolean;
  subscriptionTier: string;
  planType: string;
  isLoading: boolean;
  checkSubscription: () => Promise<void>;
  createCheckoutSession: () => Promise<void>;
  createCustomerPortal: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export const SubscriptionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscriptionTier, setSubscriptionTier] = useState('free');
  const [planType, setPlanType] = useState('free');
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();

  const checkSubscription = async () => {
    if (!user) return;
    
    setIsLoading(true);
    try {
      const result = await api.subscription.checkSubscription();
      setIsSubscribed(result.subscribed);
      setSubscriptionTier(result.subscription_tier);
      setPlanType(result.plan_type);
    } catch (error) {
      console.error('Failed to check subscription:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const createCheckoutSession = async () => {
    setIsLoading(true);
    try {
      const result = await api.subscription.createCheckoutSession();
      if (result.url) {
        window.location.href = result.url; // Open in same tab as requested
      } else if (result.error) {
        console.error('Checkout error:', result.error);
      }
    } catch (error) {
      console.error('Failed to create checkout session:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const createCustomerPortal = async () => {
    setIsLoading(true);
    try {
      const result = await api.subscription.createCustomerPortal();
      if (result.url) {
        window.open(result.url, '_blank');
      } else if (result.error) {
        console.error('Portal error:', result.error);
      }
    } catch (error) {
      console.error('Failed to create customer portal:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      checkSubscription();
    }
  }, [user]);

  return (
    <SubscriptionContext.Provider value={{
      isSubscribed,
      subscriptionTier,
      planType,
      isLoading,
      checkSubscription,
      createCheckoutSession,
      createCustomerPortal
    }}>
      {children}
    </SubscriptionContext.Provider>
  );
};

export const useSubscription = () => {
  const context = useContext(SubscriptionContext);
  if (context === undefined) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
};
