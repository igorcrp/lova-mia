
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface User {
  id: string;
  email: string;
  name: string | null;
  status_users: "active" | "pending" | "inactive" | null;
  email_verified: boolean | null;
  level_id: number | null;
  subscribed: boolean | null;
  subscription_tier: string | null;
  subscription_end: string | null;
  stripe_customer_id: string | null;
}

export function useUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUsers = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('users')
        .select('id, email, name, status_users, email_verified, level_id, subscribed, subscription_tier, subscription_end, stripe_customer_id')
        .order('created_at', { ascending: false });

      if (error) {
        console.error("Error fetching users:", error);
        toast.error("Failed to fetch users");
        return;
      }

      const typedUsers: User[] = data.map(user => ({
        ...user,
        status_users: (user.status_users === 'active' || user.status_users === 'pending' || user.status_users === 'inactive') 
          ? user.status_users 
          : 'pending',
        email_verified: user.email_verified || false,
        subscribed: user.subscribed || false,
        subscription_tier: user.subscription_tier || 'Free',
        subscription_end: user.subscription_end || null,
        stripe_customer_id: user.stripe_customer_id || null,
      }));

      setUsers(typedUsers);
    } catch (error) {
      console.error("Failed to fetch users", error);
      toast.error("Failed to fetch users");
    } finally {
      setIsLoading(false);
    }
  };

  const deleteUser = async (userId: string) => {
    try {
      const { error } = await supabase
        .from('users')
        .delete()
        .eq('id', userId);

      if (error) {
        console.error("Error deleting user:", error);
        toast.error("Failed to delete user");
        return;
      }

      setUsers(users.filter(user => user.id !== userId));
      toast.success("User deleted successfully");
    } catch (error) {
      console.error("Failed to delete user", error);
      toast.error("Failed to delete user");
    }
  };

  const updateUserLevel = async (userId: string, levelId: number) => {
    try {
      const { error } = await supabase
        .from('users')
        .update({ level_id: levelId })
        .eq('id', userId);

      if (error) {
        console.error("Error updating user level:", error);
        toast.error("Failed to update user level");
        return;
      }

      setUsers(users.map(user => 
        user.id === userId ? { ...user, level_id: levelId } : user
      ));
      toast.success("User level updated successfully");
    } catch (error) {
      console.error("Failed to update user level", error);
      toast.error("Failed to update user level");
    }
  };

  const updateUserStatus = async (userId: string, status: "active" | "pending" | "inactive") => {
    try {
      const { error } = await supabase
        .from('users')
        .update({ status_users: status })
        .eq('id', userId);

      if (error) {
        console.error("Error updating user status:", error);
        toast.error("Failed to update user status");
        return;
      }

      setUsers(users.map(user => 
        user.id === userId ? { ...user, status_users: status } : user
      ));
      toast.success("User status updated successfully");
    } catch (error) {
      console.error("Failed to update user status", error);
      toast.error("Failed to update user status");
    }
  };

  const addUser = async (userData: {
    email: string;
    name: string;
    level_id: number;
    status_users: "active" | "pending" | "inactive";
    email_verified: boolean;
    subscribed?: boolean;
    subscription_tier?: string;
    subscription_end?: string;
    stripe_customer_id?: string;
  }) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .insert([userData])
        .select()
        .single();

      if (error) {
        console.error("Error adding user:", error);
        toast.error("Failed to add user");
        return;
      }

      // Create Stripe customer for the new user
      try {
        const session = await supabase.auth.getSession();
        if (!session.data.session?.access_token) {
          throw new Error("No valid session for Stripe integration");
        }

        const { data: stripeData, error: stripeError } = await supabase.functions.invoke(
          'create-stripe-customer',
          {
            headers: {
              Authorization: `Bearer ${session.data.session.access_token}`
            },
            body: {
              email: userData.email,
              name: userData.name,
              userId: data.id
            }
          }
        );

        if (stripeError) {
          console.error("Error creating Stripe customer:", stripeError);
          toast.error("User created but Stripe integration failed. Please check Stripe configuration.");
        } else if (stripeData?.stripe_customer_id) {
          // Update the user with the Stripe customer ID (admin has permission)
          const { error: updateError } = await supabase
            .from('users')
            .update({ stripe_customer_id: stripeData.stripe_customer_id })
            .eq('id', data.id);
          
          if (!updateError) {
            data.stripe_customer_id = stripeData.stripe_customer_id;
            toast.success("User and Stripe customer created successfully");
          } else {
            console.error("Failed to update user with Stripe ID:", updateError);
            toast.error("User created but failed to link Stripe customer");
          }
        }
      } catch (stripeError) {
        console.error("Error with Stripe integration:", stripeError);
        toast.error("User created but Stripe integration failed. Please configure STRIPE_SECRET_KEY in edge function secrets.");
      }

      const newUser: User = {
        ...data,
        status_users: (data.status_users === 'active' || data.status_users === 'pending' || data.status_users === 'inactive') 
          ? data.status_users 
          : 'pending',
        email_verified: data.email_verified || false,
        subscribed: data.subscribed || false,
        subscription_tier: data.subscription_tier || 'Free',
        subscription_end: data.subscription_end || null,
        stripe_customer_id: data.stripe_customer_id || null,
      };

      setUsers([newUser, ...users]);
      return newUser;
    } catch (error) {
      console.error("Failed to add user", error);
      toast.error("Failed to add user");
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  return {
    users,
    isLoading,
    deleteUser,
    updateUserLevel,
    updateUserStatus,
    addUser,
    refetch: fetchUsers
  };
}
