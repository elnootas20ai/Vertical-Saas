import { createContext, useContext, useState, ReactNode } from 'react';

export type SubscriptionStatus = 
  | 'subscription_active'
  | 'trial_active'
  | 'trial_expired'
  | 'payment_failed'
  | 'grace_period'
  | 'suspended';

interface SubscriptionContextType {
  status: SubscriptionStatus;
  setStatus: (status: SubscriptionStatus) => void;
  trialDaysRemaining: number;
  graceHoursRemaining: number;
  isBlocked: boolean; // Para acciones críticas
  isSuspended: boolean; // Para bloqueo total
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SubscriptionStatus>('trial_active');
  const [trialDaysRemaining] = useState(7); // Simulado
  const [graceHoursRemaining] = useState(36); // Simulado

  const isBlocked = status === 'payment_failed' || status === 'grace_period';
  const isSuspended = status === 'suspended';

  return (
    <SubscriptionContext.Provider
      value={{
        status,
        setStatus,
        trialDaysRemaining,
        graceHoursRemaining,
        isBlocked,
        isSuspended,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error('useSubscription must be used within SubscriptionProvider');
  }
  return context;
}
