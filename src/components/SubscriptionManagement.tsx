
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function SubscriptionManagement() {
  const [isLoading, setIsLoading] = useState(false);
  const { openCustomerPortal } = useSubscription();
  const { toast } = useToast();

  const handleManageSubscription = async () => {
    try {
      setIsLoading(true);
      await openCustomerPortal();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to open subscription management. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full">
      <Button 
        onClick={handleManageSubscription}
        disabled={isLoading}
        className="w-full justify-between"
        variant="outline"
      >
        {isLoading ? 'Opening...' : 'Manage Subscription'}
        <ExternalLink className="h-4 w-4 ml-2" />
      </Button>
    </div>
  );
}
