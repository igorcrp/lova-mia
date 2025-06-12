
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Crown } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
import { toast } from "sonner";

export const SubscriptionCard = () => {
  const { subscription, isPremium, isFree, createCheckout, openCustomerPortal } = useSubscription();

  const handleUpgrade = async () => {
    const checkoutUrl = await createCheckout();
    if (checkoutUrl) {
      window.location.href = checkoutUrl;
    } else {
      toast.error("Failed to create checkout session");
    }
  };

  const handleManage = async () => {
    const portalUrl = await openCustomerPortal();
    if (portalUrl) {
      window.location.href = portalUrl;
    } else {
      toast.error("Failed to open customer portal");
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Free Plan */}
      <Card className={`relative ${isFree ? 'ring-2 ring-primary' : ''}`}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl">Free Plan</CardTitle>
            {isFree && <Badge variant="default">Current Plan</Badge>}
          </div>
          <CardDescription>
            <span className="text-2xl font-bold">$0</span>
            <span className="text-muted-foreground">/month</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 mb-6">
            <li className="flex items-center">
              <Check className="h-4 w-4 text-green-500 mr-2" />
              1 Month period limit
            </li>
            <li className="flex items-center">
              <Check className="h-4 w-4 text-green-500 mr-2" />
              10 Stock results limit
            </li>
            <li className="flex items-center">
              <Check className="h-4 w-4 text-green-500 mr-2" />
              Basic features
            </li>
          </ul>
          {isFree && (
            <Button variant="outline" className="w-full" disabled>
              Current Plan
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Premium Plan */}
      <Card className={`relative ${isPremium ? 'ring-2 ring-primary' : ''}`}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl flex items-center">
              <Crown className="h-5 w-5 text-yellow-500 mr-2" />
              Premium Plan
            </CardTitle>
            {isPremium && <Badge variant="default">Current Plan</Badge>}
          </div>
          <CardDescription>
            <span className="text-2xl font-bold">$39</span>
            <span className="text-muted-foreground">/month</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 mb-6">
            <li className="flex items-center">
              <Check className="h-4 w-4 text-green-500 mr-2" />
              Unlimited period access
            </li>
            <li className="flex items-center">
              <Check className="h-4 w-4 text-green-500 mr-2" />
              Unlimited stock results
            </li>
            <li className="flex items-center">
              <Check className="h-4 w-4 text-green-500 mr-2" />
              All filters enabled
            </li>
            <li className="flex items-center">
              <Check className="h-4 w-4 text-green-500 mr-2" />
              Premium features
            </li>
          </ul>
          {isPremium ? (
            <Button onClick={handleManage} className="w-full">
              Manage Subscription
            </Button>
          ) : (
            <Button onClick={handleUpgrade} className="w-full">
              Upgrade to Premium
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
