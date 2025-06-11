
import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '@/services/api';
import { useAuth } from './AuthContext';

interface SubscriptionContextType {
  isSubscribed: boolean;
  subscriptionTier: string;
  subscriptionEnd?: string;
  isLoading: boolean;
  checkSubscription: () => Promise<void>;
  upgradeToPremium: () => Promise<void>;
  manageSubscription: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export const SubscriptionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscriptionTier, setSubscriptionTier] = useState('free');
  const [subscriptionEnd, setSubscriptionEnd] = useState<string>();
  const [isLoading, setIsLoading] = useState(false);

  const checkSubscription = async () => {
    if (!user) {
      setIsSubscribed(false);
      setSubscriptionTier('free');
      return;
    }

    try {
      setIsLoading(true);
      const data = await api.subscription.checkSubscription();
      setIsSubscribed(data.subscribed);
      setSubscriptionTier(data.subscription_tier || 'free');
      setSubscriptionEnd(data.subscription_end);
    } catch (error) {
      console.error('Failed to check subscription:', error);
      setIsSubscribed(false);
      setSubscriptionTier('free');
    } finally {
      setIsLoading(false);
    }
  };

  const upgradeToPremium = async () => {
    try {
      const { url } = await api.subscription.createCheckoutSession();
      window.location.href = url;
    } catch (error) {
      console.error('Failed to upgrade:', error);
      throw error;
    }
  };

  const manageSubscription = async () => {
    try {
      const { url } = await api.subscription.getCustomerPortal();
      window.location.href = url;
    } catch (error) {
      console.error('Failed to open customer portal:', error);
      throw error;
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
      subscriptionEnd,
      isLoading,
      checkSubscription,
      upgradeToPremium,
      manageSubscription
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
