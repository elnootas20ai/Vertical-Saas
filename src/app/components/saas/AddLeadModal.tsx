import React, { useEffect, useMemo, useState } from 'react';
import { useModalClose } from '../../hooks/useModalClose';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import type { Lead } from '../../context/AppContext';

interface AddLeadModalProps {
  onClose: () => void;
  leadToEdit?: Lead;
}

export function AddLeadModal({ onClose, leadToEdit }: AddLeadModalProps) {
  useModalClose(true, onClose);

  const { t } = useTranslation();
  const { addLead, updateLead, vehicles, user } = useApp();
  const { user: authUser, listUsers } = useAuth();
  const isEditMode = Boolean(leadToEdit);

  const [formData, setFormData] = useState({
    name: leadToEdit?.name ?? '',
    phone: leadToEdit?.phone ?? '',
    email: leadToEdit?.email ?? '',
    source: (leadToEdit?.source ?? 'web') as 'web' | 'phone' | 'inPerson' | 'whatsapp' | 'referral',
    status: (leadToEdit?.status ?? 'new') as Lead['status'],
    responsible: leadToEdit?.responsible ?? '',
    interestedVehicle: leadToEdit?.interestedVehicle ?? '',
    notes: leadToEdit?.notes ?? ''
  });
  const [responsibleOptions, setResponsibleOptions] = useState<string[]>([]);
  const [isLoadingResponsible, setIsLoadingResponsible] = useState(false);

  const fallbackResponsible = useMemo(() => {
    return (
      user?.name?.trim() ||
      authUser?.fullName?.trim() ||
      ''
    );
  }, [authUser?.fullName, user?.name]);

  useEffect(() => {
    let cancelled = false;

    const syncResponsible = (options: string[]) => {
      if (cancelled) {
        return;
      }

      setResponsibleOptions(options);
      setFormData((prev) => {
        if (prev.responsible && options.includes(prev.responsible)) {
          return prev;
        }

        return {
          ...prev,
          responsible: options[0] || '',
        };
      });
    };

    if (!authUser) {
      syncResponsible(fallbackResponsible ? [fallbackResponsible] : []);
      return () => {
        cancelled = true;
      };
    }

    const normalize = (value?: string) => String(value || '').trim().toLowerCase();

    const loadTeamMembers = async () => {
      setIsLoadingResponsible(true);

      try {
        const users = await listUsers();
        const ownerId = authUser.invitedBy || authUser.user_id;
        const currentCompany = normalize(authUser.companyName);

        const options = Array.from(
          new Set(
            users
              .filter((candidate) => {
                const candidateCompany = normalize(candidate.companyName);
                const sameCompany = Boolean(currentCompany) && candidateCompany === currentCompany;
                const sameOwner =
                  candidate.user_id === ownerId ||
                  candidate.invitedBy === ownerId ||
                  candidate.user_id === authUser.user_id;

                return sameCompany || sameOwner;
              })
              .filter((candidate) => candidate.status !== 'inactive')
              .map((candidate) =>
                candidate.fullName?.trim() ||
                `${candidate.firstName || ''} ${candidate.lastName || ''}`.trim() ||
                candidate.email,
              )
              .filter(Boolean),
          ),
        );

        syncResponsible(
          options.length > 0
            ? options
            : (fallbackResponsible ? [fallbackResponsible] : []),
        );
      } catch (error) {
        console.error('Error loading team members for responsible field:', error);
        syncResponsible(fallbackResponsible ? [fallbackResponsible] : []);
      } finally {
        if (!cancelled) {
          setIsLoadingResponsible(false);
        }
      }
    };

    void loadTeamMembers();

    return () => {
      cancelled = true;
    };
  }, [authUser, fallbackResponsible, listUsers]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.phone) {
      alert('Por favor completa los campos obligatorios (nombre y teléfono)');
      return;
    }

    if (isEditMode && leadToEdit) {
      void updateLead(leadToEdit.id, {
        name: formData.name,
        phone: formData.phone,
        email: formData.email || undefined,
        source: formData.source,
        status: formData.status,
        responsible: formData.responsible || fallbackResponsible || 'Sin asignar',
        interestedVehicle: formData.interestedVehicle || undefined,
        notes: formData.notes || undefined,
      });
    } else {
      void addLead({
        name: formData.name,
        phone: formData.phone,
        email: formData.email || undefined,
        source: formData.source,
        responsible: formData.responsible || fallbackResponsible || 'Sin asignar',
        interestedVehicle: formData.interestedVehicle || undefined,
        notes: formData.notes || undefined,
      });
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {isEditMode ? t('crm.modal.editLead') : t('crm.modal.newLead')}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('crm.modal.fullName')} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="María López García"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          {/* Phone & Email */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('crm.modal.phone')} <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="+34 600 111 222"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('crm.modal.email')}
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="maria@email.com"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Source */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('crm.modal.source')}
            </label>
            <select
              value={formData.source}
              onChange={(e) => setFormData({ ...formData, source: e.target.value as any })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="web">{t('crm.modal.sourceWeb')}</option>
              <option value="phone">{t('crm.modal.sourcePhone')}</option>
              <option value="inPerson">{t('crm.modal.sourceInPerson')}</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="referral">{t('crm.modal.sourceReferral')}</option>
            </select>
          </div>

          {/* Status (edit mode only) */}
          {isEditMode && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('crm.modal.status')}
              </label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as Lead['status'] })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="new">{t('crm.leadStatus.new')}</option>
                <option value="contacted">{t('crm.leadStatus.contacted')}</option>
                <option value="appointment">{t('crm.leadStatus.appointment')}</option>
                <option value="reserved">{t('crm.leadStatus.reserved')}</option>
                <option value="negotiation">{t('crm.leadStatus.negotiation')}</option>
                <option value="won">{t('crm.leadStatus.won')}</option>
                <option value="lost">{t('crm.leadStatus.lost')}</option>
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('crm.modal.responsible')}
            </label>
            <select
              value={formData.responsible}
              onChange={(e) => setFormData({ ...formData, responsible: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 dark:disabled:bg-gray-800 disabled:text-gray-500 dark:disabled:text-gray-400"
              disabled={isLoadingResponsible || responsibleOptions.length === 0}
            >
              {responsibleOptions.length === 0 ? (
                <option value="">
                  {isLoadingResponsible ? t('crm.modal.loadingTeam') : t('crm.modal.noResponsible')}
                </option>
              ) : (
                responsibleOptions.map((member) => (
                  <option key={member} value={member}>
                    {member}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Interested Vehicle */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('crm.modal.interestedVehicle')}
            </label>
            <select
              value={formData.interestedVehicle}
              onChange={(e) => setFormData({ ...formData, interestedVehicle: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">{t('crm.modal.noVehicle')}</option>
              {vehicles
                .filter(v => v.status === 'available')
                .map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicle.brand} {vehicle.model} ({vehicle.year}) - {vehicle.registrationPlate}
                  </option>
                ))}
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('crm.modal.notes')}
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Información adicional sobre el lead..."
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 border border-gray-300 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              {isEditMode ? t('common.saveChanges') : t('crm.modal.createLead')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
