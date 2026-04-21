import { X, User, Car, Phone, Mail, Calendar, MessageSquare, UserPlus, TrendingUp, MapPin } from 'lucide-react';
import { useState } from 'react';
import { SAAS__ScheduleAppointmentModal, AppointmentData } from './SAAS__ScheduleAppointmentModal';
import { useModalClose } from '../../hooks/useModalClose';

export type LeadStatus = 'new' | 'contacted' | 'appointment' | 'reserved' | 'lost';

interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string;
  status: LeadStatus;
  vehicleInterest: string;
  vehicleInterestId?: string;
  budget?: string;
  notes: string;
  source: string;
  responsible: string;
  createdAt: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  lead: Lead;
  onConvert: () => void;
}

const statusConfig: Record<LeadStatus, { label: string; color: string }> = {
  new: { label: 'Nuevo', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  contacted: { label: 'Contactado', color: 'bg-purple-100 text-purple-800 border-purple-200' },
  appointment: { label: 'Cita', color: 'bg-amber-100 text-amber-800 border-amber-200' },
  reserved: { label: 'Reserva', color: 'bg-green-100 text-green-800 border-green-200' },
  lost: { label: 'Perdido', color: 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-700' },
};

export function SAAS__LeadDrawer({ isOpen, onClose, lead, onConvert }: Props) {
  const [showAppointmentModal, setShowAppointmentModal] = useState(false);
  useModalClose(isOpen, onClose);

  if (!isOpen) return null;

  const statusInfo = statusConfig[lead.status];

  const handleCall = () => {
    window.location.href = `tel:${lead.phone}`;
  };

  const handleEmail = () => {
    const subject = encodeURIComponent(`Consulta sobre ${lead.vehicleInterest}`);
    const body = encodeURIComponent(`Hola ${lead.name},\n\nMe pongo en contacto contigo en relación a tu interés en ${lead.vehicleInterest}.\n\n`);
    window.location.href = `mailto:${lead.email}?subject=${subject}&body=${body}`;
  };

  const handleScheduleAppointment = (appointment: AppointmentData) => {
    // Save appointment to localStorage associated with the lead
    const appointments = JSON.parse(localStorage.getItem('appointments') || '[]');
    const newAppointment = {
      id: `apt_${Date.now()}`,
      leadId: lead.id,
      leadName: lead.name,
      leadPhone: lead.phone,
      vehicleInterest: lead.vehicleInterest,
      ...appointment,
      createdAt: new Date().toISOString(),
    };
    appointments.push(newAppointment);
    localStorage.setItem('appointments', JSON.stringify(appointments));
    
    // Show success message (could be a toast notification)
    alert(`✅ Cita programada con ${lead.name} para el ${new Date(appointment.date).toLocaleDateString('es-ES')} a las ${appointment.time}`);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full max-w-lg bg-white dark:bg-gray-800 shadow-2xl z-50 overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-white">Detalle del lead</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            {statusInfo && (
              <span className={`px-3 py-1 rounded-full text-xs font-semibold border bg-white/20 text-white border-white/30`}>
                {statusInfo.label}
              </span>
            )}
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-white/20 text-white border border-white/30">
              {lead.source}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Contact Info */}
          <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-5">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
              <User className="w-5 h-5 text-blue-600" />
              Información de contacto
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Nombre completo</label>
                <div className="text-gray-900 dark:text-gray-100 font-semibold text-lg">{lead.name}</div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Teléfono</label>
                <a
                  href={`tel:${lead.phone}`}
                  className="text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-2"
                >
                  <Phone className="w-4 h-4" />
                  {lead.phone}
                </a>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Email</label>
                <a
                  href={`mailto:${lead.email}`}
                  className="text-blue-600 hover:text-blue-700 flex items-center gap-2 break-all"
                >
                  <Mail className="w-4 h-4 flex-shrink-0" />
                  {lead.email}
                </a>
              </div>
            </div>
          </div>

          {/* Vehicle Interest */}
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl p-5">
            <h3 className="text-lg font-bold text-green-900 mb-4 flex items-center gap-2">
              <Car className="w-5 h-5 text-green-600" />
              Vehículo de interés
            </h3>
            
            <div className="space-y-3">
              <div>
                <div className="text-xl font-bold text-green-900">{lead.vehicleInterest}</div>
              </div>

              {lead.budget && (
                <div>
                  <label className="block text-sm font-medium text-green-700 mb-1">Presupuesto</label>
                  <div className="text-2xl font-bold text-green-900">{lead.budget}</div>
                </div>
              )}

              {lead.vehicleInterestId && (
                <button
                  onClick={() => {
                    // Navigate to vehicle
                    onClose();
                    window.location.href = `/saas/vehicles`;
                  }}
                  className="w-full mt-3 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <Car className="w-4 h-4" />
                  Ver ficha del vehículo
                </button>
              )}
            </div>
          </div>

          {/* Notes */}
          {lead.notes && (
            <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-5">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-amber-600" />
                Notas
              </h3>
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed">{lead.notes}</p>
            </div>
          )}

          {/* Metadata */}
          <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-5">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Responsable</span>
                <span className="text-gray-900 dark:text-gray-100 font-semibold flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                  {lead.responsible}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Fecha de creación</span>
                <span className="text-gray-900 dark:text-gray-100 font-semibold flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                  {new Date(lead.createdAt).toLocaleDateString('es-ES')}
                </span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <button
              onClick={onConvert}
              className="w-full px-6 py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 shadow-lg"
            >
              <UserPlus className="w-5 h-5" />
              Convertir a cliente
            </button>

            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={handleCall}
                className="px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
              >
                <Phone className="w-4 h-4" />
                Llamar
              </button>
              <button 
                onClick={handleEmail}
                className="px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
              >
                <Mail className="w-4 h-4" />
                Email
              </button>
            </div>

            <button 
              onClick={() => setShowAppointmentModal(true)}
              className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl font-medium transition-colors"
            >
              Programar cita
            </button>
          </div>
        </div>
      </div>

      {/* Schedule Appointment Modal */}
      <SAAS__ScheduleAppointmentModal
        isOpen={showAppointmentModal}
        onClose={() => setShowAppointmentModal(false)}
        leadName={lead.name}
        leadPhone={lead.phone}
        vehicleInterest={lead.vehicleInterest}
        onSchedule={handleScheduleAppointment}
      />
    </>
  );
}