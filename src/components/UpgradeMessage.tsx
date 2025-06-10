
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/use-toast";

interface UpgradeMessageProps {
  user: any;
}

export function UpgradeMessage({ user }: UpgradeMessageProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleUpgrade = async () => {
    if (!user) {
      toast({
        variant: "destructive",
        title: "Authentication required",
        description: "Please log in to upgrade your plan",
      });
      return;
    }

    try {
      setIsLoading(true);
      const { data, error } = await supabase.functions.invoke("create-checkout-session");

      if (error) {
        throw error;
      }

      if (data?.url) {
        // Redirect to Stripe checkout in the same tab
        window.location.href = data.url;
      }
    } catch (error) {
      console.error("Error creating checkout session:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to start checkout process. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mt-2 text-center">
      <p className="text-sm text-muted-foreground mb-2">
        Upgrade to Premium for full access to all features and unlimited results.
      </p>
      <Button 
        onClick={handleUpgrade} 
        disabled={isLoading}
        size="sm"
        variant="outline"
      >
        {isLoading ? "Processing..." : "Upgrade to Premium - $39/month"}
      </Button>
    </div>
  );
}
