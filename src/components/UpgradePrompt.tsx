
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Crown, ArrowUp } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
import { toast } from "sonner";

export const UpgradePrompt = () => {
  const { createCheckout } = useSubscription();

  const handleUpgrade = async () => {
    const checkoutUrl = await createCheckout();
    if (checkoutUrl) {
      window.location.href = checkoutUrl;
    } else {
      toast.error("Failed to create checkout session");
    }
  };

  return (
    <Card className="mt-4 border-amber-200 bg-amber-50">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Crown className="h-5 w-5 text-amber-600" />
            <div>
              <p className="text-sm font-medium text-amber-800">
                Upgrade to Premium for full access
              </p>
              <p className="text-xs text-amber-600">
                Unlock unlimited results, all filters, and extended periods
              </p>
            </div>
          </div>
          <Button 
            onClick={handleUpgrade}
            size="sm" 
            className="bg-amber-600 hover:bg-amber-700"
          >
            <ArrowUp className="h-4 w-4 mr-1" />
            Upgrade
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
