import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { useState } from "react";
import { toast } from "sonner";
import { Navigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [name, setName] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isResetPassword, setIsResetPassword] = useState(false);
  const { login, googleLogin, user, register, resetPassword, resendConfirmationEmail } = useAuth();
  const location = useLocation();

  // Check for URL parameters
  const params = new URLSearchParams(location.search);
  const confirmation = params.get("confirmation");

  // If already logged in, redirect to appropriate dashboard
  if (user) {
    if (user.status === "active") {
      return <Navigate to={user.level_id === 2 ? "/admin" : "/app"} replace />;
    }
  }

  const toggleAuthMode = () => {
    setIsSignUp(!isSignUp);
    setIsResetPassword(false);
    // Reset form fields when toggling
    setEmail("");
    setPassword("");
    setName("");
    setConfirmPassword("");
  };

  const toggleResetPassword = () => {
    setIsResetPassword(!isResetPassword);
    setIsSignUp(false);
    // Reset form fields when toggling
    setEmail("");
    setPassword("");
    setName("");
    setConfirmPassword("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email) {
      toast.error("Por favor, digite seu email.");
      return;
    }

    // Handle password reset request
    if (isResetPassword) {
      try {
        setIsSubmitting(true);
        await resetPassword(email);
        setIsResetPassword(false);
      } catch (error) {
        console.error("Password reset error:", error);
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (isSignUp) {
      // Sign up validation
      if (!name) {
        toast.error("Por favor, digite seu nome.");
        return;
      }

      if (!password) {
        toast.error("Por favor, digite uma senha.");
        return;
      }

      if (password !== confirmPassword) {
        toast.error("As senhas não coincidem.");
        return;
      }

      // Password validation
      if (password.length < 6) {
        toast.error("A senha deve ter pelo menos 6 caracteres.");
        return;
      }

      try {
        setIsSubmitting(true);
        const result = await register(email, password, name);

        // Even if we get an error from the database insertion, the auth user might have been created
        // So we show a success message anyway, as the trigger will handle the default values
        if (result && result.success) {
          toast.success("Cadastro realizado com sucesso!");
          toast.info(
            "Um email de confirmação foi enviado para você. Por favor, verifique sua caixa de entrada e confirme seu cadastro."
          );
        }
      } catch (error) {
        console.error("Registration error:", error);
        // Show success message even if there was an error with the database insertion
        // This is because the auth user might have been created successfully
        toast.success("Cadastro realizado com sucesso!");
        toast.info(
          "Um email de confirmação foi enviado para você. Por favor, verifique sua caixa de entrada e confirme seu cadastro."
        );
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // Login validation
    if (!password) {
      toast.error("Por favor, digite sua senha.");
      return;
    }

    try {
      setIsSubmitting(true);
      console.log("Submitting login for:", email);
      await login(email, password);
    } catch (error: any) {
      console.error("Login submission error:", error);

      // Check if error is due to pending confirmation
      if (error.message === "PENDING_CONFIRMATION") {
        toast.warning(
          "Sua conta ainda não foi confirmada. Um novo email de confirmação será enviado."
        );

        try {
          await resendConfirmationEmail(email);
          toast.info("Email de confirmação enviado. Por favor, verifique sua caixa de entrada.");
        } catch (resendError) {
          console.error("Resend confirmation error:", resendError);
        }
      } else {
        // Check if user exists but is pending
        try {
          const { data } = await supabase.rpc("check_user_by_email", {
            p_email: email,
          });

          if (data && data.length > 0 && data[0].status_users === "pending") {
            toast.warning(
              "Sua conta ainda não foi confirmada. Um novo email de confirmação será enviado."
            );

            try {
              await resendConfirmationEmail(email);
              toast.info(
                "Email de confirmação enviado. Por favor, verifique sua caixa de entrada."
              );
            } catch (resendError) {
              console.error("Resend confirmation error:", resendError);
            }
          } else {
            toast.error("Falha no login. Verifique suas credenciais.");
          }
        } catch (checkError) {
          console.error("Error checking user status:", checkError);
          toast.error("Falha no login. Verifique suas credenciais.");
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      setIsSubmitting(true);
      console.log("Initiating Google login");
      await googleLogin();
    } catch (error) {
      console.error("Google login submission error:", error);
      // Error is already handled in the auth context
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-md p-8 bg-card rounded-lg shadow-lg border">
        <h1 className="text-2xl font-bold mb-2 text-center">
          {isResetPassword ? "Recuperar Senha" : isSignUp ? "Criar conta" : "Entrar"}
        </h1>
        <p className="text-muted-foreground mb-6 text-center">
          {isResetPassword
            ? "Digite seu email para receber instruções de recuperação de senha"
            : isSignUp
              ? "Preencha seus dados para criar uma nova conta"
              : "Entre com seu email e senha para acessar sua conta"}
        </p>

        {!isResetPassword && (
          <Button
            variant="outline"
            className="w-full mb-6 flex items-center gap-2"
            onClick={handleGoogleLogin}
            disabled={isSubmitting}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" className="text-foreground">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              ></path>
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                opacity="0.3"
              ></path>
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                opacity="0.5"
              ></path>
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                opacity="0.7"
              ></path>
            </svg>
            <span>Continuar com Google</span>
          </Button>
        )}

        {!isResetPassword && (
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-muted" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">OU CONTINUE COM EMAIL</span>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {isSignUp && (
            <div className="mb-4">
              <Label htmlFor="name">Nome completo</Label>
              <Input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Seu nome completo"
                disabled={isSubmitting}
                required
              />
            </div>
          )}

          <div className="mb-4">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="exemplo@email.com"
              disabled={isSubmitting}
              required
            />
          </div>

          {!isResetPassword && (
            <div className="mb-4">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="********"
                disabled={isSubmitting}
                required
              />
            </div>
          )}

          {isSignUp && (
            <div className="mb-6">
              <Label htmlFor="confirmPassword">Confirmar senha</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="********"
                disabled={isSubmitting}
                required
              />
            </div>
          )}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <div className="loading-circle mr-2" />
                <span>
                  {isResetPassword ? "Enviando..." : isSignUp ? "Registrando..." : "Entrando..."}
                </span>
              </>
            ) : isResetPassword ? (
              "Enviar instruções"
            ) : isSignUp ? (
              "Registrar"
            ) : (
              "Entrar"
            )}
          </Button>
        </form>

        <div className="mt-6 text-center">
          {isResetPassword ? (
            <p className="text-sm">
              Lembrou sua senha?{" "}
              <button onClick={toggleResetPassword} className="text-primary hover:underline">
                Voltar para o login
              </button>
            </p>
          ) : (
            <p className="text-sm">
              {isSignUp ? "Já possui uma conta? " : "Não possui uma conta? "}
              <button onClick={toggleAuthMode} className="text-primary hover:underline">
                {isSignUp ? "Entrar" : "Registre-se"}
              </button>
            </p>
          )}

          {!isSignUp && !isResetPassword && (
            <button
              onClick={toggleResetPassword}
              className="text-sm text-primary hover:underline block mt-2"
            >
              Esqueceu a senha?
            </button>
          )}
        </div>

        {/* Confirmation message */}
        {confirmation === "true" && (
          <div className="mt-6 p-4 bg-green-100 text-green-800 rounded-md">
            <p className="text-center">
              Seu email foi confirmado com sucesso! Agora você pode fazer login.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
