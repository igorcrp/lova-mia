
import { Button } from "@/components/ui/button";
import { Crown } from "lucide-react";
import { useSubscription } from "@/contexts/SubscriptionContext";

export function PremiumUpgrade() {
  const { isSubscribed, createCheckout, openCustomerPortal, isLoading } = useSubscription();

  if (isSubscribed) {
    return (
      <div className="mt-4 p-3 bg-gradient-to-r from-yellow-50 to-yellow-100 dark:from-yellow-900/20 dark:to-yellow-800/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Crown className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
            <span className="text-sm text-yellow-800 dark:text-yellow-200 font-medium">
              Premium Plan Active
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={openCustomerPortal}
            disabled={isLoading}
            className="text-xs"
          >
            Manage Subscription
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 p-3 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Upgrade to <span className="font-semibold text-blue-600 dark:text-blue-400">Premium</span> for unlimited access to all features
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            $39/month • Full platform access • Advanced analytics • Premium Processing (70% faster)...
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
