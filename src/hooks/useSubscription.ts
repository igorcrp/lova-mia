
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Subscriber } from '@/types';

export function useSubscription() {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<Subscriber | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setSubscription(null);
      setLoading(false);
      return;
    }

    const fetchSubscription = async () => {
      try {
        const { data, error } = await supabase
          .from('subscribers')
          .select('*')
          .eq('user_id', user.id)
          .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 is "no rows returned"
          console.error('Error fetching subscription:', error);
        } else {
          setSubscription(data);
        }
      } catch (error) {
        console.error('Error fetching subscription:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSubscription();
  }, [user]);

  const isPremium = subscription?.subscription_tier === 'premium' && subscription?.subscribed;
  const isFree = !isPremium;

  const createSubscription = async () => {
    if (!user) return null;

    try {
      const { data, error } = await supabase.functions.invoke('create-subscription');
      
      if (error) throw error;
      
      return data.url;
    } catch (error) {
      console.error('Error creating subscription:', error);
      throw error;
    }
  };

  return {
    subscription,
    loading,
    isPremium,
    isFree,
    createSubscription,
  };
}
