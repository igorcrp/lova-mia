
import { SubscriptionCard } from "@/components/SubscriptionCard";
import { useSubscription } from "@/hooks/useSubscription";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

export default function SubscriptionPage() {
  const { subscription, isLoading, checkSubscription } = useSubscription();

  const handleRefresh = () => {
    checkSubscription();
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Subscription Plans</h1>
          <p className="text-muted-foreground">Choose the plan that fits your needs</p>
        </div>
        <Button onClick={handleRefresh} variant="outline" disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Current Status */}
      <Card>
        <CardHeader>
          <CardTitle>Current Status</CardTitle>
          <CardDescription>Your current subscription details</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Plan</p>
              <p className="text-lg font-semibold capitalize">
                {subscription.subscription_tier}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Status</p>
              <p className="text-lg font-semibold">
                {subscription.subscribed ? 'Active' : 'Inactive'}
              </p>
            </div>
            {subscription.subscription_end && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Next Billing</p>
                <p className="text-lg font-semibold">
                  {new Date(subscription.subscription_end).toLocaleDateString()}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Subscription Cards */}
      <SubscriptionCard />
    </div>
  );
}
