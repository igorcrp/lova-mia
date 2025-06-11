
import { Button } from "@/components/ui/button";
import { useSubscription } from "@/contexts/SubscriptionContext";

export const UpgradeMessage = () => {
  const { upgradeToPremium } = useSubscription();

  const handleUpgrade = async () => {
    try {
      await upgradeToPremium();
    } catch (error) {
      console.error('Upgrade failed:', error);
    }
  };

  return (
    <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-md mt-4">
      <p className="text-sm text-blue-700">
        Showing limited results. Upgrade to Premium for unlimited access and advanced features.
      </p>
      <Button 
        onClick={handleUpgrade}
        size="sm"
        className="bg-blue-600 hover:bg-blue-700 text-white"
      >
        Upgrade to Premium - $39/month
      </Button>
    </div>
  );
};
