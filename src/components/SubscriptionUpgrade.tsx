
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Crown } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
import { toast } from "@/components/ui/use-toast";

export function SubscriptionUpgrade() {
  const { createSubscription } = useSubscription();

  const handleUpgrade = async () => {
    try {
      const checkoutUrl = await createSubscription();
      if (checkoutUrl) {
        window.location.href = checkoutUrl;
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to start subscription process. Please try again.",
      });
    }
  };

  return (
    <Card className="mt-4 border-yellow-200 bg-gradient-to-r from-yellow-50 to-orange-50">
      <CardHeader className="pb-3">
        <div className="flex items-center space-x-2">
          <Crown className="h-5 w-5 text-yellow-600" />
          <CardTitle className="text-lg text-yellow-800">Upgrade to Premium</CardTitle>
        </div>
        <CardDescription className="text-yellow-700">
          Get unlimited access to all features and remove restrictions
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="text-sm text-yellow-700">
            <p className="font-medium mb-2">Premium features include:</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>Access to all time periods (not just 1 month)</li>
              <li>View all stock results (unlimited)</li>
              <li>Full sorting and filtering capabilities</li>
              <li>Advanced analytics and insights</li>
            </ul>
          </div>
          <div className="flex items-center justify-between">
            <div className="text-yellow-800">
              <span className="text-2xl font-bold">$39</span>
              <span className="text-sm">/month</span>
            </div>
            <Button 
              onClick={handleUpgrade}
              className="bg-yellow-600 hover:bg-yellow-700 text-white"
            >
              Upgrade Now
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
