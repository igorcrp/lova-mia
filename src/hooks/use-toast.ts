
import * as React from "react";
import {
  ToastActionElement,
  ToastProps,
} from "@/components/ui/toast";

export type ToasterToast = ToastProps & {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: ToastActionElement;
};

// Create a custom hook that extends the original useToast
export const useToast = () => {
  // Implementation of the useToast hook
  const [toasts, setToasts] = React.useState<ToasterToast[]>([]);

  const toast = (props: Omit<ToasterToast, "id">) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prevToasts) => [...prevToasts, { id, ...props }]);
    
    return {
      id,
      dismiss: () => {
        setToasts((prevToasts) => prevToasts.filter((toast) => toast.id !== id));
      },
      update: (props: ToasterToast) => {
        setToasts((prevToasts) =>
          prevToasts.map((toast) =>
            toast.id === id ? { ...toast, ...props } : toast
          )
        );
      },
    };
  };

  const dismiss = (toastId?: string) => {
    setToasts((prevToasts) =>
      toastId
        ? prevToasts.filter((toast) => toast.id !== toastId)
        : []
    );
  };

  return {
    toast,
    dismiss,
    toasts,
  };
};

export { type ToastProps };

// Export the toast function directly for convenience
export const toast = (props: Omit<ToasterToast, "id">) => {
  return useToast().toast(props);
};
