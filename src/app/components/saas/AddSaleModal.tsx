import { useState } from 'react';
import { X } from 'lucide-react';
import { useModalClose } from '../../hooks/useModalClose';
import { useApp } from '../../context/AppContext';
import { useTranslation } from 'react-i18next';

interface AddSaleModalProps {
  onClose: () => void;
}

export function AddSaleModal({ onClose }: AddSaleModalProps) {
  useModalClose(true, onClose);

  const { addSale, vehicles, leads } = useApp();
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    vehicleId: '',
    clientId: '',
    salePrice: '',
    downPayment: '',
    financingAmount: '',
    notes: ''
  });

  const availableVehicles = vehicles.filter(v => v.status === 'listo' || v.status === 'reservado');
  const potentialClients = leads.filter(l => l.status !== 'lost');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.vehicleId || !formData.clientId || !formData.salePrice) {
      alert(t('sales.modal.requiredFields'));
      return;
    }

    const salePrice = parseFloat(formData.salePrice);
    const downPayment = formData.downPayment ? parseFloat(formData.downPayment) : 0;
    const financingAmount = formData.financingAmount ? parseFloat(formData.financingAmount) : 0;

    if (salePrice <= 0) {
      alert(t('sales.modal.invalidPrice'));
      return;
    }

    addSale({
      vehicleId: formData.vehicleId,
      clientId: formData.clientId,
      salePrice,
      downPayment: downPayment > 0 ? downPayment : undefined,
      financingAmount: financingAmount > 0 ? financingAmount : undefined,
      notes: formData.notes || undefined
    });

    onClose();
  };

  const selectedVehicle = vehicles.find(v => v.id === formData.vehicleId);
  const calculatedFinancing = formData.salePrice && formData.downPayment
    ? parseFloat(formData.salePrice) - parseFloat(formData.downPayment || '0')
    : 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{t('sales.modal.title')}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Vehicle Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('sales.modal.vehicle')} <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.vehicleId}
              onChange={(e) => setFormData({ ...formData, vehicleId: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">{t('sales.modal.selectVehicle')}</option>
              {availableVehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.brand} {vehicle.model} ({vehicle.year}) - {vehicle.registrationPlate}
                  {vehicle.salePrice ? ` - €${vehicle.salePrice.toLocaleString()}` : ''}
                </option>
              ))}
            </select>
            {availableVehicles.length === 0 && (
              <p className="text-sm text-amber-600 mt-1">{t('sales.modal.noVehicles')}</p>
            )}
          </div>

          {/* Client Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('sales.modal.client')} <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.clientId}
              onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">{t('sales.modal.selectClient')}</option>
              {potentialClients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name} - {client.phone}
                </option>
              ))}
            </select>
            {potentialClients.length === 0 && (
              <p className="text-sm text-amber-600 mt-1">{t('sales.modal.noClients')}</p>
            )}
          </div>

          {/* Sale Price */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('sales.modal.salePrice')} <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400">€</span>
              <input
                type="number"
                value={formData.salePrice}
                onChange={(e) => setFormData({ ...formData, salePrice: e.target.value })}
                placeholder={selectedVehicle?.salePrice ? selectedVehicle.salePrice.toString() : '0'}
                step="0.01"
                className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            {selectedVehicle?.salePrice && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {t('sales.modal.suggestedPrice', { price: selectedVehicle.salePrice.toLocaleString() })}
              </p>
            )}
          </div>

          {/* Down Payment & Financing */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('sales.modal.downPayment')}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400">€</span>
                <input
                  type="number"
                  value={formData.downPayment}
                  onChange={(e) => setFormData({ ...formData, downPayment: e.target.value })}
                  placeholder="0"
                  step="0.01"
                  className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('sales.modal.financing')}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400">€</span>
                <input
                  type="number"
                  value={formData.financingAmount}
                  onChange={(e) => setFormData({ ...formData, financingAmount: e.target.value })}
                  placeholder={calculatedFinancing > 0 ? calculatedFinancing.toString() : '0'}
                  step="0.01"
                  className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {calculatedFinancing > 0 && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {t('sales.modal.calculated', { amount: calculatedFinancing.toLocaleString() })}
                </p>
              )}
            </div>
          </div>

          {/* Summary */}
          {formData.salePrice && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">{t('sales.modal.financialSummary')}</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">{t('sales.modal.salePriceLabel')}</span>
                  <span className="font-semibold">€{parseFloat(formData.salePrice).toLocaleString()}</span>
                </div>
                {formData.downPayment && parseFloat(formData.downPayment) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">{t('sales.modal.downPaymentLabel')}</span>
                    <span className="font-semibold">€{parseFloat(formData.downPayment).toLocaleString()}</span>
                  </div>
                )}
                {calculatedFinancing > 0 && (
                  <div className="flex justify-between pt-2 border-t border-blue-300">
                    <span className="text-gray-600 dark:text-gray-400">{t('sales.modal.toFinance')}</span>
                    <span className="font-semibold text-blue-700">€{calculatedFinancing.toLocaleString()}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('sales.modal.notes')}
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder={t('sales.modal.notesPlaceholder')}
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
              {t('sales.modal.submit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
