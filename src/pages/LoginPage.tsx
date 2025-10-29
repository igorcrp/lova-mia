
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { useState, useEffect } from "react";
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
  const [isNewPassword, setIsNewPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "info" | "warning">("info");
  const {
    login,
    googleLogin,
    user,
    register,
    resetPassword,
    resendConfirmationEmail
  } = useAuth();
  const location = useLocation();

  // Check for URL parameters
  const params = new URLSearchParams(location.search);
  const confirmation = params.get('confirmation');
  const provider = params.get('provider');
  const reset = params.get('reset');
  
  // Check if this is a password reset page
  const isPasswordResetPage = location.pathname === '/reset-password';

  // Handle OAuth redirect and password reset
  useEffect(() => {
    if (provider === 'google') {
      
      showMessage("Google login successful! Redirecting...", "success");
    }
    
    if (reset === 'true' || isPasswordResetPage) {
      setIsNewPassword(true);
      showMessage("Please enter your new password below.", "info");
    }
  }, [provider, reset, isPasswordResetPage]);

  // If already logged in, redirect to appropriate dashboard
  if (user) {
    if (user.status === 'active') {
      return <Navigate to={user.level_id === 2 ? "/admin" : "/app"} replace />;
    }
  }

  const showMessage = (text: string, type: "success" | "error" | "info" | "warning" = "info") => {
    setMessage(text);
    setMessageType(type);
    setTimeout(() => setMessage(""), 5000);
  };

  const toggleAuthMode = () => {
    setIsSignUp(!isSignUp);
    setIsResetPassword(false);
    setEmail("");
    setPassword("");
    setName("");
    setConfirmPassword("");
    setMessage("");
  };

  const toggleResetPassword = () => {
    setIsResetPassword(!isResetPassword);
    setIsSignUp(false);
    setIsNewPassword(false);
    setEmail("");
    setPassword("");
    setName("");
    setConfirmPassword("");
    setNewPassword("");
    setConfirmNewPassword("");
    setMessage("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isNewPassword) {
      if (!newPassword) {
        showMessage("Please enter your new password.", "error");
        return;
      }
      if (newPassword !== confirmNewPassword) {
        showMessage("Passwords don't match.", "error");
        return;
      }
      if (newPassword.length < 6) {
        showMessage("Password must be at least 6 characters long.", "error");
        return;
      }

      try {
        setIsSubmitting(true);
        const { error } = await supabase.auth.updateUser({ 
          password: newPassword 
        });
        
        if (error) {
          throw error;
        }
        
        // Sign out after password update to clear any session conflicts
        await supabase.auth.signOut({ scope: 'global' });
        
        showMessage("Password updated successfully! You can now sign in with your new password.", "success");
        setIsNewPassword(false);
        setNewPassword("");
        setConfirmNewPassword("");
        // Redirect to login after successful password reset
        setTimeout(() => {
          window.location.href = "/login";
        }, 2000);
      } catch (error: any) {
        console.error("Password update error:", error);
        showMessage("Failed to update password. Please try again or request a new reset link.", "error");
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (!email) {
      showMessage("Please enter your email address.", "error");
      return;
    }

    if (isResetPassword) {
      try {
        setIsSubmitting(true);
        await resetPassword(email);
        showMessage("Password reset instructions sent to your email.", "success");
        setIsResetPassword(false);
      } catch (error) {
        console.error("Password reset error:", error);
        showMessage("Failed to send password reset email. Please try again.", "error");
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (isSignUp) {
      if (!name) {
        showMessage("Please enter your full name.", "error");
        return;
      }
      if (!password) {
        showMessage("Please enter a password.", "error");
        return;
      }
      if (password !== confirmPassword) {
        showMessage("Passwords don't match.", "error");
        return;
      }
      if (password.length < 6) {
        showMessage("Password must be at least 6 characters long.", "error");
        return;
      }

      try {
        setIsSubmitting(true);
        const result = await register(email, password, name);
        if (result && result.success) {
          showMessage("Registration successful! A confirmation email has been sent to you. Please check your inbox and confirm your registration.", "success");
        }
      } catch (error) {
        console.error("Registration error:", error);
        showMessage("Registration successful! A confirmation email has been sent to you. Please check your inbox and confirm your registration.", "success");
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (!password) {
      showMessage("Please enter your password.", "error");
      return;
    }

    try {
      setIsSubmitting(true);
      
      await login(email, password);
    } catch (error: any) {
      console.error("Login submission error:", error);
      if (error.message === "PENDING_CONFIRMATION") {
        showMessage("Your account hasn't been confirmed yet. A new confirmation email will be sent.", "warning");
        try {
          await resendConfirmationEmail(email);
          showMessage("Confirmation email sent. Please check your inbox.", "info");
        } catch (resendError) {
          console.error("Resend confirmation error:", resendError);
        }
      } else {
        try {
          const { data } = await supabase.rpc('check_user_by_email', {
            p_email: email
          });
          if (data && data.length > 0 && data[0].status_users === 'pending') {
            showMessage("Your account hasn't been confirmed yet. A new confirmation email will be sent.", "warning");
            try {
              await resendConfirmationEmail(email);
              showMessage("Confirmation email sent. Please check your inbox.", "info");
            } catch (resendError) {
              console.error("Resend confirmation error:", resendError);
            }
          } else {
            showMessage("Login failed. Please check your credentials.", "error");
          }
        } catch (checkError) {
          console.error("Error checking user status:", checkError);
          showMessage("Login failed. Please check your credentials.", "error");
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      setIsSubmitting(true);
      
      await googleLogin();
      // Don't show success message here as it will redirect
    } catch (error) {
      console.error("Google login submission error:", error);
      showMessage("Google login failed. Please try again later.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-md p-8 bg-card rounded-lg shadow-lg border">
        
        {message && (
          <div className={`mb-4 p-3 rounded-md text-sm ${
            messageType === "success" ? "bg-green-100 text-green-800" : 
            messageType === "error" ? "bg-red-100 text-red-800" : 
            messageType === "warning" ? "bg-yellow-100 text-yellow-800" : 
            "bg-blue-100 text-blue-800"
          }`}>
            {message}
          </div>
        )}
        
        {!isResetPassword && !isNewPassword && (
          <Button 
            variant="outline" 
            className="w-full mb-6 flex items-center gap-2" 
            onClick={handleGoogleLogin} 
            disabled={isSubmitting}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" className="text-foreground">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"></path>
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" opacity="0.7"></path>
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" opacity="0.5"></path>
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" opacity="0.7"></path>
            </svg>
            <span>Login with Google</span>
          </Button>
        )}
        
        {!isResetPassword && !isNewPassword && (
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-muted" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">
                OR CONTINUE WITH EMAIL
              </span>
            </div>
          </div>
        )}
        
        <form onSubmit={handleSubmit}>
          {isSignUp && (
            <div className="mb-4">
              <Label htmlFor="name">Full Name</Label>
              <Input 
                id="name" 
                type="text" 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                placeholder="Your full name" 
                disabled={isSubmitting} 
                required 
              />
            </div>
          )}

          {isNewPassword && (
            <>
              <div className="mb-4">
                <Label htmlFor="newPassword">New Password</Label>
                <Input 
                  id="newPassword" 
                  type="password" 
                  value={newPassword} 
                  onChange={(e) => setNewPassword(e.target.value)} 
                  placeholder="Enter your new password" 
                  disabled={isSubmitting} 
                  required 
                />
              </div>
              <div className="mb-4">
                <Label htmlFor="confirmNewPassword">Confirm New Password</Label>
                <Input 
                  id="confirmNewPassword" 
                  type="password" 
                  value={confirmNewPassword} 
                  onChange={(e) => setConfirmNewPassword(e.target.value)} 
                  placeholder="Confirm your new password" 
                  disabled={isSubmitting} 
                  required 
                />
              </div>
            </>
          )}
          
          {!isNewPassword && (
            <div className="mb-4">
              <Label htmlFor="email">Email</Label>
              <Input 
                id="email" 
                type="email" 
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
                placeholder="example@email.com" 
                disabled={isSubmitting} 
                required 
              />
            </div>
          )}
          
          {!isResetPassword && !isNewPassword && (
            <div className="mb-4">
              <Label htmlFor="password">Password</Label>
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
              <Label htmlFor="confirmPassword">Confirm Password</Label>
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
                  {isNewPassword ? "Updating Password..." : isResetPassword ? "Sending..." : isSignUp ? "Creating Account..." : "Signing In..."}
                </span>
              </>
            ) : (
              isNewPassword ? "Update Password" : isResetPassword ? "Send Instructions" : isSignUp ? "Create Account" : "Sign In"
            )}
          </Button>
        </form>
        
        <div className="mt-6 text-center">
          {isNewPassword ? (
            <p className="text-sm">
              Remember your password?{" "}
              <button onClick={() => {
                setIsNewPassword(false);
                window.location.href = "/login";
              }} className="text-primary hover:underline">
                Back to sign in
              </button>
            </p>
          ) : isResetPassword ? (
            <p className="text-sm">
              Remember your password?{" "}
              <button onClick={toggleResetPassword} className="text-primary hover:underline">
                Back to sign in
              </button>
            </p>
          ) : (
            <p className="text-sm">
              {isSignUp ? "Already have an account? " : "Don't have an account? "}
              <button onClick={toggleAuthMode} className="text-primary hover:underline">
                {isSignUp ? "Sign In" : "Sign Up"}
              </button>
            </p>
          )}
          
          {!isSignUp && !isResetPassword && !isNewPassword && (
            <div className="text-center mt-2">
              <button onClick={toggleResetPassword} className="text-sm text-primary hover:underline">
                Forgot your password?
              </button>
            </div>
          )}
        </div>
        
        {confirmation === 'true' && (
          <div className="mt-6 p-4 bg-green-100 text-green-800 rounded-md">
            <p className="text-center">
              Your email has been successfully confirmed! You can now sign in.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
