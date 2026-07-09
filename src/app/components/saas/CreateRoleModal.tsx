import { useEffect, useMemo, useState } from 'react';
import { useModalClose } from '../../hooks/useModalClose';
import { AlertTriangle, Check, Shield, Trash2, X } from 'lucide-react';
import { getRolePermissionOptions, type CreateRoleInput } from '../../lib/roleCatalog';

interface CreateRoleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: CreateRoleInput) => void;
  existingRoleIds: string[];
  businessType?: string | null;
  mode?: 'create' | 'edit';
  initialRole?: CreateRoleInput | null;
  onDelete?: (roleId: string) => void;
  canDelete?: boolean;
}

export function CreateRoleModal({
  isOpen,
  onClose,
  onCreate,
  existingRoleIds,
  businessType,
  mode = 'create',
  initialRole = null,
  onDelete,
  canDelete = false,
}: CreateRoleModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [permissions, setPermissions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirmationStep, setDeleteConfirmationStep] = useState(0);
  const isEditing = mode === 'edit' && Boolean(initialRole);

  const normalizedExisting = useMemo(
    () => existingRoleIds.map((roleId) => roleId.trim().toLowerCase()),
    [existingRoleIds],
  );
  const rolePermissionOptions = useMemo(
    () => getRolePermissionOptions(businessType),
    [businessType],
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (isEditing && initialRole) {
      setName(initialRole.id);
      setDescription(initialRole.description);
      setPermissions(initialRole.permissions);
    } else {
      setName('');
      setDescription('');
      setPermissions([]);
    }
    setDeleteConfirmationStep(0);
    setError(null);
  }, [initialRole, isEditing, isOpen]);

  useModalClose(isOpen, onClose);

  if (!isOpen) {
    return null;
  }

  const togglePermission = (permission: string) => {
    setPermissions((prev) =>
      prev.includes(permission) ? prev.filter((item) => item !== permission) : [...prev, permission],
    );
  };

  const handleSubmit = () => {
    const normalizedName = (isEditing ? initialRole?.id || '' : name).trim();
    const normalizedDescription = description.trim();

    if (!normalizedName) {
      setError('El nombre del rol es obligatorio.');
      return;
    }

    if (!isEditing && normalizedExisting.includes(normalizedName.toLowerCase())) {
      setError('Ya existe un rol con ese nombre.');
      return;
    }

    if (!normalizedDescription) {
      setError('Añade una descripcion corta para identificar el rol.');
      return;
    }

    onCreate({
      id: normalizedName,
      description: normalizedDescription,
      permissions,
    });

    if (!isEditing) {
      setName('');
      setDescription('');
      setPermissions([]);
    }
    setDeleteConfirmationStep(0);
    setError(null);
  };

  const handleDelete = () => {
    if (!isEditing || !initialRole || !onDelete || !canDelete) {
      return;
    }

    if (deleteConfirmationStep === 0) {
      setDeleteConfirmationStep(1);
      setError('Pulsa "Confirmar eliminar" para borrar este rol de forma definitiva.');
      return;
    }

    onDelete(initialRole.id);
    setDeleteConfirmationStep(0);
    setError(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-2xl overflow-hidden rounded-3xl bg-white dark:bg-gray-800 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100">
              <Shield className="w-5 h-5 text-slate-700" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{isEditing ? 'Editar rol' : 'Nuevo rol'}</h3>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {isEditing
                  ? 'Ajusta la descripcion y los modulos permitidos para este rol.'
                  : 'Crea un rol base y define los modulos a los que tendra acceso.'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-xl p-2 text-gray-400 dark:text-gray-500 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-5 px-6 py-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600 dark:text-gray-400">Nombre del rol</label>
              <input
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setError(null);
                  setDeleteConfirmationStep(0);
                }}
                placeholder="Ej. Logistica"
                disabled={isEditing}
                className="w-full rounded-xl border-2 border-gray-200 dark:border-gray-700 px-4 py-3 text-sm text-gray-900 dark:text-gray-100 outline-none transition-colors focus:border-blue-500"
              />
              {isEditing && (
                <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
                  El nombre no se puede cambiar para mantener las asignaciones actuales.
                </p>
              )}
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600 dark:text-gray-400">Descripcion</label>
              <input
                value={description}
                onChange={(event) => {
                  setDescription(event.target.value);
                  setError(null);
                  setDeleteConfirmationStep(0);
                }}
                placeholder="Gestion de traslados y movimientos"
                className="w-full rounded-xl border-2 border-gray-200 dark:border-gray-700 px-4 py-3 text-sm text-gray-900 dark:text-gray-100 outline-none transition-colors focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between">
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400">Permisos base</label>
              <span className="text-xs text-gray-400 dark:text-gray-500">{permissions.length} modulo{permissions.length !== 1 ? 's' : ''} seleccionado{permissions.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {rolePermissionOptions.map((option) => {
                const active = permissions.includes(option.key);
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => {
                      togglePermission(option.key);
                      setDeleteConfirmationStep(0);
                    }}
                    className={`flex items-start gap-3 rounded-2xl border-2 p-4 text-left transition-colors ${
                      active ? 'border-slate-900 bg-slate-50' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    <div className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-md border ${active ? 'border-slate-900 bg-slate-900' : 'border-gray-300 bg-white dark:bg-gray-800'}`}>
                      {active && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{option.label}</p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{option.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-gray-100 dark:border-gray-800 px-6 py-4">
          <button
            type="button"
            onClick={() => {
              setDeleteConfirmationStep(0);
              setError(null);
              onClose();
            }}
            className="rounded-xl border-2 border-gray-200 dark:border-gray-700 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors hover:border-gray-300 dark:hover:border-gray-600"
          >
            Cancelar
          </button>
          {isEditing && canDelete && onDelete && (
            <button
              type="button"
              onClick={handleDelete}
              className={`inline-flex items-center gap-2 rounded-xl border-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
                deleteConfirmationStep === 0
                  ? 'border-red-200 text-red-700 hover:border-red-300'
                  : 'border-red-600 bg-red-600 text-white hover:bg-red-700 hover:border-red-700'
              }`}
            >
              {deleteConfirmationStep === 0 ? <Trash2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
              {deleteConfirmationStep === 0 ? 'Eliminar' : 'Confirmar eliminar'}
            </button>
          )}
          <button
            type="button"
            onClick={handleSubmit}
            className="ml-auto inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-black"
          >
            <Shield className="w-4 h-4" />
            {isEditing ? 'Guardar cambios' : 'Crear rol'}
          </button>
        </div>
      </div>
    </div>
  );
}
