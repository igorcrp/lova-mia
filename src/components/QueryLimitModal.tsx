import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Crown } from "lucide-react";
import { useSubscription } from "@/contexts/SubscriptionContext";

interface QueryLimitModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function QueryLimitModal({ isOpen, onClose }: QueryLimitModalProps) {
  const { createCheckout, isLoading } = useSubscription();

  const handleUpgrade = async () => {
    await createCheckout();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Crown className="h-6 w-6 text-yellow-500" />
            Upgrade to Premium
          </DialogTitle>
          <DialogDescription className="pt-4 text-base">
            You&apos;ve seen the power of the data. Continue with unlimited access for $39/month.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 pt-4">
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>✓ Unlimited daily queries</p>
            <p>✓ Advanced analytics features</p>
            <p>✓ Premium processing (98% faster)</p>
            <p>✓ Priority support</p>
          </div>
          <div className="flex gap-3 pt-4">
            <Button
              onClick={handleUpgrade}
              disabled={isLoading}
              className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
            >
              <Crown className="h-4 w-4 mr-2" />
              Upgrade Now
            </Button>
            <Button
              onClick={onClose}
              variant="outline"
              className="flex-1"
            >
              Maybe Later
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}