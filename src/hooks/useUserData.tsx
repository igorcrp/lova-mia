
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  level_id: number | null;
  status_users: string | null;
  email_verified: boolean | null;
  created_at: string | null;
  updated_at: string | null;
}

export const useUserData = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch all users (only works for admins due to RLS policies)
  const useUsers = () => {
    return useQuery({
      queryKey: ['users'],
      queryFn: async () => {
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Error fetching users:', error);
          throw new Error('Erro ao buscar usuários');
        }

        return data as UserProfile[];
      },
      enabled: !!user && user.level_id === 2, // Only enable for admins
    });
  };

  // Fetch current user profile
  const useCurrentUser = () => {
    return useQuery({
      queryKey: ['currentUser', user?.email],
      queryFn: async () => {
        if (!user?.email) return null;

        const { data, error } = await supabase
          .from('users')
          .select('*')
          .eq('email', user.email)
          .maybeSingle();

        if (error) {
          console.error('Error fetching current user:', error);
          throw new Error('Erro ao buscar dados do usuário');
        }

        return data as UserProfile;
      },
      enabled: !!user?.email,
    });
  };

  // Update user mutation
  const updateUser = useMutation({
    mutationFn: async (userData: Partial<UserProfile> & { id: string }) => {
      const { data, error } = await supabase
        .from('users')
        .update(userData)
        .eq('id', userData.id)
        .select()
        .single();

      if (error) {
        console.error('Error updating user:', error);
        throw new Error('Erro ao atualizar usuário');
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['currentUser'] });
      toast.success('Usuário atualizado com sucesso');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Create user mutation
  const createUser = useMutation({
    mutationFn: async (userData: Omit<UserProfile, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase
        .from('users')
        .insert(userData)
        .select()
        .single();

      if (error) {
        console.error('Error creating user:', error);
        throw new Error('Erro ao criar usuário');
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('Usuário criado com sucesso');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Delete user mutation
  const deleteUser = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from('users')
        .delete()
        .eq('id', userId);

      if (error) {
        console.error('Error deleting user:', error);
        throw new Error('Erro ao deletar usuário');
      }

      return userId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('Usuário deletado com sucesso');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  return {
    useUsers,
    useCurrentUser,
    updateUser,
    createUser,
    deleteUser,
  };
};
