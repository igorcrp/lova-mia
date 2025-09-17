import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './AuthContext';
import { useDailyQueries } from '@/hooks/useDailyQueries';

interface SubscriptionContextType {
  isSubscribed: boolean;
  subscriptionTier: string | null;
  subscriptionEnd: string | null;
  isLoading: boolean;
  checkSubscription: () => Promise<void>;
  createCheckout: () => Promise<void>;
  openCustomerPortal: () => Promise<void>;
  // Daily queries for free users
  queriesUsed: number;
  queriesRemaining: number;
  dailyLimit: number;
  isQueryLimitReached: boolean;
  incrementQueries: () => void;
  canRunQuery: boolean;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscriptionTier, setSubscriptionTier] = useState<string | null>(null);
  const [subscriptionEnd, setSubscriptionEnd] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();
  
  // Daily queries hook for free users
  const { 
    queriesUsed, 
    queriesRemaining, 
    dailyLimit, 
    isLimitReached, 
    incrementQueries 
  } = useDailyQueries();

  const checkSubscription = async () => {
    if (!user) {
      setIsSubscribed(false);
      setSubscriptionTier(null);
      setSubscriptionEnd(null);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      
      // Get the current session to ensure we have a valid token
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        console.error('No valid session found:', sessionError);
        setIsSubscribed(false);
        setSubscriptionTier(null);
        setSubscriptionEnd(null);
        setIsLoading(false);
        return;
      }

      console.log('Calling get_subscription_status_secure for user:', session.user.email);
      
      const { data, error } = await supabase.rpc('get_subscription_status_secure');
      
      if (error) {
        console.error('Error checking subscription:', error);
        setIsSubscribed(false);
        setSubscriptionTier(null);
        setSubscriptionEnd(null);
      } else {
        console.log('Subscription check response:', data);
        setIsSubscribed(data[0]?.subscribed || false);
        setSubscriptionTier(data[0]?.subscription_tier || null);
        setSubscriptionEnd(data[0]?.subscription_end || null);
      }
    } catch (error) {
      console.error('Error in checkSubscription:', error);
      setIsSubscribed(false);
      setSubscriptionTier(null);
      setSubscriptionEnd(null);
    } finally {
      setIsLoading(false);
    }
  };

  const createCheckout = async () => {
    setIsLoading(true);
    try {
      // Get the current session to ensure we have a valid token
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        console.error('No valid session found for checkout:', sessionError);
        setIsLoading(false);
        return;
      }

      console.log('Creating checkout with session:', session.user.email);
      
      // Start checkout creation and immediately open loading tab
      const checkoutPromise = supabase.functions.invoke('create-checkout', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      // Open a new tab immediately with loading message
      const newTab = window.open('about:blank', '_blank');
      if (newTab) {
        newTab.document.write('<html><body><div style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:Arial,sans-serif;"><div>Loading checkout... Please wait</div></div></body></html>');
      }

      const { data, error } = await checkoutPromise;
      
      if (error) {
        console.error('Error creating checkout:', error);
        if (newTab) {
          newTab.close();
        }
        setIsLoading(false);
        return;
      }
      
      console.log('Checkout response:', data);
      
      if (data.url && newTab) {
        newTab.location.href = data.url;
      } else if (data.url) {
        window.open(data.url, '_blank');
      }
    } catch (error) {
      console.error('Error in createCheckout:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const openCustomerPortal = async () => {
    try {
      // Get the current session to ensure we have a valid token
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        console.error('No valid session found for customer portal:', sessionError);
        return;
      }

      console.log('Opening customer portal with session:', session.user.email);
      
      const { data, error } = await supabase.functions.invoke('customer-portal', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      
      if (error) {
        console.error('Error opening customer portal:', error);
        return;
      }
      
      console.log('Customer portal response:', data);
      
      if (data.url) {
        window.open(data.url, '_blank');
      }
    } catch (error) {
      console.error('Error in openCustomerPortal:', error);
    }
  };

  useEffect(() => {
    checkSubscription();
  }, [user]);

  return (
    <SubscriptionContext.Provider
      value={{
        isSubscribed,
        subscriptionTier,
        subscriptionEnd,
        isLoading,
        checkSubscription,
        createCheckout,
        openCustomerPortal,
        // Daily queries for free users
        queriesUsed,
        queriesRemaining,
        dailyLimit,
        isQueryLimitReached: isLimitReached,
        incrementQueries,
        canRunQuery: true, // Remove all limitations for Free users
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const context = useContext(SubscriptionContext);
  if (context === undefined) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
}
