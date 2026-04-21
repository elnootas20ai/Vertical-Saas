import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Lock, CheckCircle, AlertCircle, Loader2, Building2, UserPlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ACCESO__Button } from '../../components/design-system/ACCESO__Button';
import { ACCESO__Input } from '../../components/design-system/ACCESO__Input';
import { UdarLogo } from '../../components/UdarLogo';
import { useAuth } from '../../context/AuthContext';

export function AcceptInvite() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { acceptInvite } = useAuth();

  const token = searchParams.get('token') || '';
  const email = searchParams.get('email') || '';
  const { t } = useTranslation();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [redirectTo, setRedirectTo] = useState('/saas/dashboard');

  useEffect(() => {
    if (!token || !email) {
      setError('El enlace de invitación es inválido o ha expirado. Solicita una nueva invitación a tu administrador.');
    }
  }, [token, email]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }

    setLoading(true);
    try {
      const result = await acceptInvite(token, email, newPassword);
      if (result.success) {
        setSuccess(true);
        if (result.redirectTo) {
          setRedirectTo(result.redirectTo);
        }
      } else {
        setError(result.error || 'No se pudo aceptar la invitación');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-800 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl p-8 shadow-sm">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center mb-6">
              <UdarLogo size="lg" />
            </div>
            <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <UserPlus className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              Aceptar invitación
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Crea tu contraseña para acceder a la empresa
            </p>
          </div>

          {success ? (
            <div className="text-center py-6">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                Cuenta creada correctamente
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Tu cuenta ha sido activada. Ahora puedes acceder al panel de la empresa.
              </p>
              <ACCESO__Button
                variant="primary"
                fullWidth
                onClick={() => navigate(redirectTo)}
              >
                <Building2 className="w-4 h-4 mr-2" />
                Entrar al panel
              </ACCESO__Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {(!token || !email) ? (
                <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                  <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">
                    El enlace de invitación es inválido o ha expirado.
                    Contacta con tu administrador para recibir una nueva invitación.
                  </p>
                </div>
              ) : (
                <>
                  {email && (
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-xl px-4 py-3">
                      <p className="text-sm text-blue-700 dark:text-blue-300">
                        Creando cuenta para <strong className="text-blue-900 dark:text-blue-100">{email}</strong>
                      </p>
                    </div>
                  )}

                  <ACCESO__Input
                    label="Nueva contraseña"
                    type="password"
                    placeholder="Mínimo 8 caracteres"
                    icon={<Lock className="w-5 h-5" />}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                  />

                  <ACCESO__Input
                    label="Confirmar contraseña"
                    type="password"
                    placeholder="Repite la contraseña"
                    icon={<Lock className="w-5 h-5" />}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />

                  {error && (
                    <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                      <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                      <p className="text-sm text-red-700">{error}</p>
                    </div>
                  )}

                  <p className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 rounded-lg px-4 py-3">
                    No necesitas añadir tarjeta de pago. Accederás directamente a la empresa que te ha invitado.
                  </p>

                  <ACCESO__Button
                    type="submit"
                    variant="primary"
                    fullWidth
                    size="lg"
                    disabled={loading}
                  >
                    {loading ? (
                      <span className="flex items-center gap-2 justify-center">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Creando cuenta...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2 justify-center">
                        <UserPlus className="w-4 h-4" />
                        Crear cuenta y acceder
                      </span>
                    )}
                  </ACCESO__Button>
                </>
              )}
            </form>
          )}
        </div>

        {!success && (
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              ¿Ya tienes una cuenta?{' '}
              <button
                type="button"
                className="text-gray-900 dark:text-gray-100 font-medium underline"
                onClick={() => navigate('/auth/login')}
              >
                Iniciar sesión
              </button>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
