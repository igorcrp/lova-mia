
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { Crown, Check } from "lucide-react";
import { SubscriptionManagement } from "@/components/SubscriptionManagement";

export default function ProfilePage() {
  const {
    user
  } = useAuth();
  const {
    isSubscribed,
    subscriptionTier,
    subscriptionEnd,
    createCheckout,
    isLoading
  } = useSubscription();
  
  return <div>
      <div className="grid grid-cols-1 md:grid gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader className="p-3">
              <CardTitle className="text-lg">Account Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 p-3">
              <div className="grid grid-cols-3 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input id="fullName" defaultValue={user?.full_name || ""} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" defaultValue={user?.email || ""} readOnly />
                </div>
                <div className="space-y-2">
                  <div>
                    <Label className="text-base">Email Verification</Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      {user?.email_verified ? 'Verified' : 'Not verified'}
                    </p>
                    {!user?.email_verified && <Button variant="outline" size="sm" className="mt-2">
                        Verify Email
                      </Button>}
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" defaultValue="********" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <Input id="confirmPassword" type="password" defaultValue="********" />
                </div>
                <div className="space-y-2">
                  <div className="flex flex-col">
                    <Label className="text-base">Email Notifications</Label>
                    <p className="text-sm text-muted-foreground mb-2">
                      Receive email updates
                    </p>
                    <Switch defaultChecked />
                  </div>
                </div>
              </div>
              
              <div className="flex justify-end">
                <Button>Save Changes</Button>
              </div>
            </CardContent>
          </Card>

          {/* Subscription Plans Section */}
          <Card>
            <CardHeader className="p-3">
              <CardTitle className="text-lg">Subscription Plans</CardTitle>
            </CardHeader>
            <CardContent className="p-3">
              {/* Current Status */}
              <div className="mb-6 p-4 bg-muted/50 rounded-lg">
                <h3 className="font-semibold mb-2">Current Status</h3>
                
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Plan</span>
                    <p className="font-medium">{isSubscribed ? `${subscriptionTier} Plan` : 'Free Plan'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Status</span>
                    <p className="font-medium">Active</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Next Billing</span>
                    <p className="font-medium">
                      {isSubscribed && subscriptionEnd ? new Date(subscriptionEnd).toLocaleDateString() : '-'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Plans Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Free Plan */}
                <div className="relative p-4 border rounded-lg">
                  <h3 className="text-lg font-semibold mb-2">Free Plan</h3>
                  <div className="mb-4">
                    <span className="text-2xl font-bold">$0</span>
                    <span className="text-muted-foreground">/month</span>
                  </div>
                  <ul className="space-y-2 mb-4">
                    <li className="flex items-center gap-2 text-sm">
                      <Check className="h-4 w-4 text-green-500" />
                      1 Month period limit
                    </li>
                    <li className="flex items-center gap-2 text-sm">
                      <Check className="h-4 w-4 text-green-500" />
                      10 Stock results limit
                    </li>
                    <li className="flex items-center gap-2 text-sm">
                      <Check className="h-4 w-4 text-green-500" />
                      Basic features
                    </li>
                  </ul>
                  {!isSubscribed && <Badge variant="outline" className="absolute top-4 right-4 text-green-600 border-green-600">
                      Current Plan
                    </Badge>}
                </div>

                {/* Premium Plan */}
                <div className="relative p-4 border rounded-lg bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20">
                  <div className="flex items-center gap-2 mb-2">
                    <Crown className="h-5 w-5 text-yellow-500" />
                    <h3 className="text-lg font-semibold">Premium Plan</h3>
                  </div>
                  <div className="mb-4">
                    <span className="text-2xl font-bold">$39</span>
                    <span className="text-muted-foreground">/month</span>
                  </div>
                  <ul className="space-y-2 mb-4">
                    <li className="flex items-center gap-2 text-sm">
                      <Check className="h-4 w-4 text-green-500" />
                      Unlimited period access
                    </li>
                    <li className="flex items-center gap-2 text-sm">
                      <Check className="h-4 w-4 text-green-500" />
                      Unlimited stock results
                    </li>
                    <li className="flex items-center gap-2 text-sm">
                      <Check className="h-4 w-4 text-green-500" />
                      All filters enabled
                    </li>
                    <li className="flex items-center gap-2 text-sm">
                      <Check className="h-4 w-4 text-green-500" />
                      Premium features
                    </li>
                  </ul>
                  
                  {isSubscribed ? <>
                      <Badge variant="outline" className="absolute top-4 right-4 text-green-600 border-green-600">
                        Current Plan
                      </Badge>
                      <SubscriptionManagement />
                    </> : <Button onClick={createCheckout} disabled={isLoading} className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700">
                      <Crown className="h-4 w-4 mr-2" />
                      Upgrade to Premium
                    </Button>}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>;
}
