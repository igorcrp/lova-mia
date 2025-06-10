
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface SubscriptionData {
  subscribed: boolean;
  subscription_tier: string;
  subscription_end?: string;
}

export const useSubscription = () => {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<SubscriptionData>({
    subscribed: false,
    subscription_tier: 'free'
  });
  const [isLoading, setIsLoading] = useState(false);

  const checkSubscription = async () => {
    if (!user) {
      setSubscription({ subscribed: false, subscription_tier: 'free' });
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('check-subscription');
      if (error) throw error;
      
      setSubscription(data);
    } catch (error) {
      console.error('Error checking subscription:', error);
      setSubscription({ subscribed: false, subscription_tier: 'free' });
    } finally {
      setIsLoading(false);
    }
  };

  const createCheckout = async () => {
    if (!user) return null;

    try {
      const { data, error } = await supabase.functions.invoke('create-checkout');
      if (error) throw error;
      
      return data.url;
    } catch (error) {
      console.error('Error creating checkout:', error);
      return null;
    }
  };

  const openCustomerPortal = async () => {
    if (!user) return null;

    try {
      const { data, error } = await supabase.functions.invoke('customer-portal');
      if (error) throw error;
      
      return data.url;
    } catch (error) {
      console.error('Error opening customer portal:', error);
      return null;
    }
  };

  useEffect(() => {
    if (user) {
      checkSubscription();
    }
  }, [user]);

  const isPremium = subscription.subscription_tier === 'premium' && subscription.subscribed;
  const isFree = subscription.subscription_tier === 'free' || !subscription.subscribed;

  return {
    subscription,
    isLoading,
    isPremium,
    isFree,
    checkSubscription,
    createCheckout,
    openCustomerPortal
  };
};
