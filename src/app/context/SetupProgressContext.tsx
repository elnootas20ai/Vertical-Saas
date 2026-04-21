import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import {
  getSetupProgressRequest,
  completeStepRequest,
  skipStepRequest,
  skipAllRequest,
  verifyAllStepsRequest,
  type SetupProgress,
  type StepDefinition,
  type SetupStatus,
} from '../lib/setupProgressApi';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SetupProgressContextType {
  progress: SetupProgress | null;
  definitions: StepDefinition[] | null;
  status: SetupStatus | null;
  loading: boolean;
  error: string | null;
  completeStep: (stepKey: string, metadata?: Record<string, unknown>) => Promise<void>;
  skipStep: (stepKey: string) => Promise<void>;
  skipAll: () => Promise<void>;
  verifyAll: () => Promise<void>;
  refresh: () => Promise<void>;
}

const SetupProgressContext = createContext<SetupProgressContextType | undefined>(undefined);

// ─── Helper ──────────────────────────────────────────────────────────────────

function deriveStatus(progress: SetupProgress): SetupStatus {
  const total = progress.steps.length;
  const completed = progress.steps.filter((s) => s.completed || s.skipped).length;
  const pending = progress.steps.filter((s) => !s.completed && !s.skipped).map((s) => s.key);
  let trialDaysRemaining = 0;
  if (progress.trialEndDate) {
    trialDaysRemaining = Math.max(0, Math.ceil((new Date(progress.trialEndDate).getTime() - Date.now()) / 86_400_000));
  }
  return {
    percentComplete: total > 0 ? Math.round((completed / total) * 100) : 0,
    completedCount: completed,
    totalCount: total,
    pendingSteps: pending,
    trialDaysRemaining,
    overallCompleted: progress.overallCompleted,
    skippedAt: progress.skippedAt,
  };
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function SetupProgressProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.user_id ?? null;

  const [progress, setProgress] = useState<SetupProgress | null>(null);
  const [definitions, setDefinitions] = useState<StepDefinition[] | null>(null);
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProgress = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getSetupProgressRequest(userId);
      setProgress(res.progress);
      setDefinitions(res.definitions);
      setStatus(deriveStatus(res.progress));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar progreso');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchProgress();
  }, [fetchProgress]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && userId) fetchProgress();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [fetchProgress, userId]);

  const completeStep = useCallback(
    async (stepKey: string, metadata?: Record<string, unknown>) => {
      if (!userId || !progress) return;

      setProgress((prev) => {
        if (!prev) return prev;
        const next = {
          ...prev,
          steps: prev.steps.map((s) =>
            s.key === stepKey ? { ...s, completed: true, completedAt: new Date().toISOString() } : s,
          ),
        };
        setStatus(deriveStatus(next));
        return next;
      });

      try {
        const res = await completeStepRequest(userId, stepKey, metadata);
        setProgress(res.progress);
        setStatus(deriveStatus(res.progress));
      } catch (err) {
        await fetchProgress();
        setError(err instanceof Error ? err.message : 'Error al completar paso');
      }
    },
    [userId, progress, fetchProgress],
  );

  const skipStepAction = useCallback(
    async (stepKey: string) => {
      if (!userId || !progress) return;

      setProgress((prev) => {
        if (!prev) return prev;
        const next = {
          ...prev,
          steps: prev.steps.map((s) =>
            s.key === stepKey ? { ...s, skipped: true, skippedAt: new Date().toISOString() } : s,
          ),
        };
        setStatus(deriveStatus(next));
        return next;
      });

      try {
        const res = await skipStepRequest(userId, stepKey);
        setProgress(res.progress);
        setStatus(deriveStatus(res.progress));
      } catch (err) {
        await fetchProgress();
        setError(err instanceof Error ? err.message : 'Error al saltar paso');
      }
    },
    [userId, progress, fetchProgress],
  );

  const skipAllAction = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await skipAllRequest(userId);
      setProgress(res.progress);
      setStatus(deriveStatus(res.progress));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al saltar onboarding');
    }
  }, [userId]);

  const verifyAll = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await verifyAllStepsRequest(userId);
      setProgress(res.progress);
      setStatus(deriveStatus(res.progress));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al verificar pasos');
    }
  }, [userId]);

  return (
    <SetupProgressContext.Provider
      value={{
        progress,
        definitions,
        status,
        loading,
        error,
        completeStep,
        skipStep: skipStepAction,
        skipAll: skipAllAction,
        verifyAll,
        refresh: fetchProgress,
      }}
    >
      {children}
    </SetupProgressContext.Provider>
  );
}

export function useSetupProgress() {
  const ctx = useContext(SetupProgressContext);
  if (!ctx) throw new Error('useSetupProgress must be used within SetupProgressProvider');
  return ctx;
}
