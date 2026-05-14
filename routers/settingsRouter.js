import { Router } from 'express';
import { requireAuthAndEmailVerified } from '../middleware/auth.js';
import {
  getBranding,
  saveBranding,
  getPipelineConfig,
  savePipelineConfig,
  getEmailTemplates,
  saveEmailTemplates,
  getBusinessHours,
  saveBusinessHours,
  exportTenantData,
  importTenantData,
  impersonateUser,
  getPlatformChangelog,
  getAlertsConfig,
  saveAlertsConfig,
  getPaymentGateway,
  savePaymentGateway,
  getDriverCashConfig,
  saveDriverCashConfig,
  getConfigStatus,
  saveConfigStatus,
  getModulesConfig,
  saveModulesConfig,
  getInvoiceEmail,
  saveInvoiceEmail,
  getImportConfig,
  saveImportConfig,
  getInitialImportStatus,
  saveInitialImportStatus,
} from '../controllers/settingsController.js';

const settingsRouter = Router();

// ADM-08: Changelog público (sin auth requerida, accesible a usuarios autenticados)
settingsRouter.get('/platform/changelog', getPlatformChangelog);

// Todas las rutas siguientes requieren autenticación
settingsRouter.use(requireAuthAndEmailVerified);

// ADM-01: Impersonation (solo Admin)
settingsRouter.post('/impersonate/:userId', impersonateUser);

// ADM-02: Branding por negocio
settingsRouter.get('/branding/:businessId', getBranding);
settingsRouter.put('/branding/:businessId', saveBranding);

// ADM-03: Pipeline stages por usuario
settingsRouter.get('/pipeline/:userId', getPipelineConfig);
settingsRouter.put('/pipeline/:userId', savePipelineConfig);

// ADM-05: Email templates por usuario
settingsRouter.get('/email-templates/:userId', getEmailTemplates);
settingsRouter.put('/email-templates/:userId', saveEmailTemplates);

// ADM-07: Business hours por usuario
settingsRouter.get('/business-hours/:userId', getBusinessHours);
settingsRouter.put('/business-hours/:userId', saveBusinessHours);

// ADM-09: Alerts config por negocio
settingsRouter.get('/alerts/:businessId', getAlertsConfig);
settingsRouter.put('/alerts/:businessId', saveAlertsConfig);

// ADM-06: Export/Import de datos del tenant
settingsRouter.get('/export/:userId', exportTenantData);
settingsRouter.post('/import/:userId', importTenantData);

// ADM-10: Payment gateway (pasarela de pago)
settingsRouter.get('/payment-gateway', getPaymentGateway);
settingsRouter.put('/payment-gateway', savePaymentGateway);

// Driver Cash config por usuario
settingsRouter.get('/driver-cash/:userId', getDriverCashConfig);
settingsRouter.put('/driver-cash/:userId', saveDriverCashConfig);

// CFG-01: Config status global
settingsRouter.get('/config-status/:businessId', getConfigStatus);
settingsRouter.put('/config-status/:businessId', saveConfigStatus);

// CFG-02: Módulos activos
settingsRouter.get('/modules/:businessId', getModulesConfig);
settingsRouter.put('/modules/:businessId', saveModulesConfig);

// CFG-03: Correo recepción facturas
settingsRouter.get('/invoice-email/:businessId', getInvoiceEmail);
settingsRouter.put('/invoice-email/:businessId', saveInvoiceEmail);

// CFG-04: Configuración de importación
settingsRouter.get('/import-config/:businessId', getImportConfig);
settingsRouter.put('/import-config/:businessId', saveImportConfig);

// CFG-05: Estado importación inicial
settingsRouter.get('/initial-import/:businessId', getInitialImportStatus);
settingsRouter.put('/initial-import/:businessId', saveInitialImportStatus);

export { settingsRouter };
