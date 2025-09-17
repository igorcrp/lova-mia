import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export const useStripeSync = () => {
  useEffect(() => {
    // Função para fazer sincronização automática
    const syncStripeData = async () => {
      try {
        // Sincronizar customers
        const customersResponse = await supabase.functions.invoke('sync-stripe-customers');
        
        if (customersResponse.error) {
          console.error('Erro ao sincronizar customers:', customersResponse.error);
          return;
        }

        // Sincronizar subscriptions
        const subscriptionsResponse = await supabase.functions.invoke('sync-stripe-subscriptions');
        
        if (subscriptionsResponse.error) {
          console.error('Erro ao sincronizar subscriptions:', subscriptionsResponse.error);
          return;
        }

        console.log('Sincronização automática do Stripe concluída');
      } catch (error) {
        console.error('Erro na sincronização automática do Stripe:', error);
      }
    };

    // Sincronizar na inicialização
    syncStripeData();

  // Configurar intervalo para sincronização automática a cada 2 minutos para detectar mudanças
  const interval = setInterval(syncStripeData, 2 * 60 * 1000);

    // Limpar intervalo ao desmontar
    return () => clearInterval(interval);
  }, []);

  // Função para sincronização manual se necessário
  const manualSync = async () => {
    try {
      toast.info("Iniciando sincronização manual...");
      
      const customersResponse = await supabase.functions.invoke('sync-stripe-customers');
      const subscriptionsResponse = await supabase.functions.invoke('sync-stripe-subscriptions');
      
      if (customersResponse.error || subscriptionsResponse.error) {
        console.error('Sync errors:', { 
          customersError: customersResponse.error,
          subscriptionsError: subscriptionsResponse.error 
        });
        throw new Error('Erro na sincronização');
      }

      toast.success("Sincronização manual concluída!");
      return true;
    } catch (error) {
      console.error('Erro na sincronização manual:', error);
      toast.error("Erro na sincronização manual");
      return false;
    }
  };

  // Função para sincronizar usuário específico
  const syncSpecificUser = async (email: string) => {
    try {
      toast.info(`Sincronizando usuário ${email}...`);
      
      const customersResponse = await supabase.functions.invoke('sync-stripe-customers', {
        body: { email }
      });
      const subscriptionsResponse = await supabase.functions.invoke('sync-stripe-subscriptions', {
        body: { email }
      });
      
      if (customersResponse.error || subscriptionsResponse.error) {
        console.error('Sync errors for user:', { 
          email,
          customersError: customersResponse.error,
          subscriptionsError: subscriptionsResponse.error 
        });
        throw new Error(`Erro na sincronização do usuário ${email}`);
      }

      toast.success(`Usuário ${email} sincronizado com sucesso!`);
      return true;
    } catch (error) {
      console.error('Erro na sincronização do usuário:', error);
      toast.error(`Erro na sincronização do usuário ${email}`);
      return false;
    }
  };

  return { manualSync, syncSpecificUser };
};