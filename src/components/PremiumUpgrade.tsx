
import { Button } from "@/components/ui/button";
import { Crown } from "lucide-react";
import { useSubscription } from "@/contexts/SubscriptionContext";

export function PremiumUpgrade() {
  const { isSubscribed, createCheckout, openCustomerPortal, isLoading, isQueryLimitReached } = useSubscription();

  if (isSubscribed) {
    return null;
  }

  // For free users, show upgrade offer but without blocking functionality
  return (
    <div className="mt-4 p-3 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Upgrade to <span className="font-semibold text-blue-600 dark:text-blue-400">Premium</span> for advanced analytics and premium processing
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            $39/month • Advanced analytics • Premium Processing (98% faster) • Priority support
          </p>
        </div>
        <Button
          onClick={createCheckout}
          disabled={isLoading}
          className="ml-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
          size="sm"
        >
          <Crown className="h-3 w-3 mr-1" />
          Upgrade Now
        </Button>
      </div>
    </div>
  );
}
