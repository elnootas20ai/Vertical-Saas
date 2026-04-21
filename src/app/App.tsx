import { useEffect } from 'react';
import { RouterProvider } from 'react-router';
import { ThemeProvider } from 'next-themes';
import { router } from './routes';
import { OnboardingProvider, useOnboarding } from './context/OnboardingContext';
import { AuthProvider, useAuth } from './context/AuthContext';

// Puente que conecta el userId del AuthContext con el OnboardingContext
function OnboardingUserSync() {
  const { user } = useAuth();
  const { setUserId } = useOnboarding();

  useEffect(() => {
    setUserId(user?.user_id ?? null);
  }, [user?.user_id, setUserId]);

  return null;
}

export default function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <AuthProvider>
        <OnboardingProvider>
          <OnboardingUserSync />
          <RouterProvider router={router} />
        </OnboardingProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}