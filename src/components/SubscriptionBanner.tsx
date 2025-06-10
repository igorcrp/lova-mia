
import React from 'react';
import { Button } from '@/components/ui/button';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { Crown, Zap } from 'lucide-react';

export const SubscriptionBanner: React.FC = () => {
  const { subscribed, subscriptionTier, createCheckout, manageSubscription, isLoading } = useSubscription();

  if (subscribed && subscriptionTier === 'premium') {
    return (
      <div className="bg-gradient-to-r from-yellow-50 to-orange-50 border border-yellow-200 rounded-lg p-4 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-yellow-600" />
            <div>
              <h3 className="font-medium text-yellow-800">Premium Plan Active</h3>
              <p className="text-sm text-yellow-600">You have full access to all platform features</p>
            </div>
          </div>
          <Button 
            variant="outline" 
            onClick={manageSubscription}
            disabled={isLoading}
            className="border-yellow-300 text-yellow-700 hover:bg-yellow-50"
          >
            Manage Subscription
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4 mb-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-blue-600" />
          <div>
            <h3 className="font-medium text-blue-800">Upgrade to Premium</h3>
            <p className="text-sm text-blue-600">Get unlimited access to all features for $39/month</p>
          </div>
        </div>
        <Button 
          onClick={createCheckout}
          disabled={isLoading}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          Upgrade Now
        </Button>
      </div>
    </div>
  );
};
