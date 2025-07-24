
import { Button } from "@/components/ui/button";
import { Crown } from "lucide-react";
import { useSubscription } from "@/contexts/SubscriptionContext";

export function PremiumUpgrade() {
  const { isSubscribed, createCheckout, openCustomerPortal, isLoading } = useSubscription();

  if (isSubscribed) {
    return (
      <div className="mt-6 card-premium p-4 animate-fade-in">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-accent rounded-full premium-glow">
              <Crown className="h-4 w-4 text-accent-foreground" />
            </div>
            <div>
              <span className="text-sm font-semibold text-card-foreground">
                Premium Plan Active
              </span>
              <p className="text-xs text-muted-foreground">
                Enjoy unlimited access to all features
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={openCustomerPortal}
            disabled={isLoading}
            className="hover-lift border-border/50 hover:border-accent/50"
          >
            Manage
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 card-premium p-6 animate-slide-up premium-glow">
      <div className="text-center mb-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-gradient-accent rounded-full mb-3">
          <Crown className="h-4 w-4 text-accent-foreground" />
          <span className="text-sm font-semibold text-accent-foreground">Premium Upgrade</span>
        </div>
        <h3 className="text-lg font-display mb-2">
          Unlock <span className="gradient-text">Professional Trading</span>
        </h3>
        <p className="text-sm text-muted-foreground">
          Join thousands of successful traders who trust our premium platform
        </p>
      </div>
      
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="text-center p-3 rounded-lg bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20">
          <div className="text-lg font-semibold text-primary">70%</div>
          <div className="text-xs text-muted-foreground">Faster Processing</div>
        </div>
        <div className="text-center p-3 rounded-lg bg-gradient-to-br from-success/5 to-success/10 border border-success/20">
          <div className="text-lg font-semibold text-success">∞</div>
          <div className="text-xs text-muted-foreground">Unlimited Access</div>
        </div>
      </div>
      
      <div className="flex items-center justify-between">
        <div>
          <div className="text-lg font-display">
            $39<span className="text-sm text-muted-foreground font-normal">/month</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Advanced analytics • Priority support • Full platform access
          </p>
        </div>
        <Button
          onClick={createCheckout}
          disabled={isLoading}
          className="btn-premium text-white font-semibold px-6"
          size="lg"
        >
          <Crown className="h-4 w-4 mr-2" />
          Upgrade Now
        </Button>
      </div>
      
      <div className="mt-4 pt-4 border-t border-border/50">
        <p className="text-xs text-center text-muted-foreground">
          💳 Secure payment • 🔄 Cancel anytime • 🛡️ 30-day money-back guarantee
        </p>
      </div>
    </div>
  );
}
