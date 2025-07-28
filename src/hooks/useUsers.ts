
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface User {
  id: string;
  email: string;
  name: string | null;
  status_users: "active" | "pending" | "inactive" | null;
  email_verified: boolean | null;
  plan_type: "free" | "premium";
  level_id: number | null;
}

export function useUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUsers = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('users')
        .select('id, email, name, status_users, email_verified, plan_type, level_id')
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
        plan_type: (user.plan_type === 'free' || user.plan_type === 'premium') 
          ? user.plan_type 
          : 'free',
        email_verified: user.email_verified || false
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
    plan_type: "free" | "premium";
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

      const newUser: User = {
        ...data,
        status_users: (data.status_users === 'active' || data.status_users === 'pending' || data.status_users === 'inactive') 
          ? data.status_users 
          : 'pending',
        plan_type: (data.plan_type === 'free' || data.plan_type === 'premium') 
          ? data.plan_type 
          : 'free',
        email_verified: data.email_verified || false
      };

      setUsers([newUser, ...users]);
      toast.success("User added successfully");
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
