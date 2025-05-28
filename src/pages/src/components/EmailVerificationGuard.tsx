const handleLogin = async (email: string, password: string) => {
  try {
    setIsSubmitting(true);
    console.log("Attempting login for:", email);
    
    // Verificar se o email existe antes de tentar login
    const emailExists = await checkEmailExists(email);
    if (!emailExists) {
      toast.error("Email não cadastrado. Registre-se agora!");
      return;
    }
    
    // Proceed with login - let the auth context handle the validation
    await login(email, password);
  } catch (error: any) {
    console.error("Login failed", error);
    // Error is already handled in the auth context
  } finally {
    setIsSubmitting(false);
  }
};
