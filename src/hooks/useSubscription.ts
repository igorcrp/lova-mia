
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";

export interface SubscriptionData {
  planType: "free" | "premium";
  isLoading: boolean;
  error: string | null;
}

export function useSubscription(user: User | null): SubscriptionData {
  const [planType, setPlanType] = useState<"free" | "premium">("free");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setPlanType("free");
      setIsLoading(false);
      return;
    }

    const fetchSubscription = async () => {
      try {
        setIsLoading(true);
        const { data, error } = await supabase
          .from("users")
          .select("plan_type")
          .eq("id", user.id)
          .single();

        if (error) {
          console.error("Error fetching subscription:", error);
          setError("Failed to fetch subscription data");
          setPlanType("free");
        } else {
          setPlanType(data?.plan_type || "free");
        }
      } catch (err) {
        console.error("Subscription fetch error:", err);
        setError("Failed to fetch subscription data");
        setPlanType("free");
      } finally {
        setIsLoading(false);
      }
    };

    fetchSubscription();
  }, [user]);

  return { planType, isLoading, error };
}
