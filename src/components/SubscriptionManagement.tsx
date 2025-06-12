
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle, 
  AlertDialogTrigger 
} from "@/components/ui/alert-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { ChevronDown, CreditCard, FileText, XCircle, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function SubscriptionManagement() {
  const [isOpen, setIsOpen] = useState(false);
  const { openCustomerPortal, isLoading } = useSubscription();
  const { toast } = useToast();

  const handleManagePaymentMethod = async () => {
    try {
      await openCustomerPortal();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to open payment management. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleViewPaymentHistory = async () => {
    try {
      await openCustomerPortal();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to open payment history. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleCancelSubscription = async () => {
    try {
      await openCustomerPortal();
      toast({
        title: "Redirecting to Stripe",
        description: "You will be redirected to manage your subscription.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to open subscription management. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="w-full">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <Button 
            variant="outline" 
            className="w-full justify-between"
            disabled={isLoading}
          >
            Manage Subscription
            <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </Button>
        </CollapsibleTrigger>
        
        <CollapsibleContent className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Subscription Management</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Cancel Subscription */}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button 
                    variant="outline" 
                    className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
                    disabled={isLoading}
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Cancel Subscription
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Cancel Subscription</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to cancel your subscription? You will lose access to premium features at the end of your billing period.
                      This action will redirect you to Stripe's customer portal where you can manage your subscription.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep Subscription</AlertDialogCancel>
                    <AlertDialogAction 
                      onClick={handleCancelSubscription}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      Proceed to Cancel
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              {/* Change Payment Method */}
              <Button 
                variant="outline" 
                className="w-full justify-start"
                onClick={handleManagePaymentMethod}
                disabled={isLoading}
              >
                <CreditCard className="h-4 w-4 mr-2" />
                Change Payment Method
                <ExternalLink className="h-3 w-3 ml-auto" />
              </Button>

              {/* Payment History */}
              <Button 
                variant="outline" 
                className="w-full justify-start"
                onClick={handleViewPaymentHistory}
                disabled={isLoading}
              >
                <FileText className="h-4 w-4 mr-2" />
                Payment History & Receipts
                <ExternalLink className="h-3 w-3 ml-auto" />
              </Button>

              <div className="text-xs text-muted-foreground mt-3 p-2 bg-muted/50 rounded">
                <p>All subscription management is handled securely through Stripe's customer portal. You'll be redirected to Stripe to complete these actions.</p>
              </div>
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
