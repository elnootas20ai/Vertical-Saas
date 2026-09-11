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
  resetAlertsToManagerFocus,
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
import { requireBusinessAccess } from '../middleware/requireBusinessAccess.js';
import { requireUserScope } from '../middleware/requireUserScope.js';

const settingsRouter = Router();

// ADM-08: Changelog público (sin auth requerida, accesible a usuarios autenticados)
settingsRouter.get('/platform/changelog', getPlatformChangelog);

// Todas las rutas siguientes requieren autenticación
settingsRouter.use(requireAuthAndEmailVerified);

// ADM-01: Impersonation (solo Admin) — no atar :userId al JWT (es el target)
settingsRouter.post('/impersonate/:userId', impersonateUser);

// ADM-02: Branding por negocio
settingsRouter.get('/branding/:businessId', requireBusinessAccess, getBranding);
settingsRouter.put('/branding/:businessId', requireBusinessAccess, saveBranding);

// ADM-03: Pipeline stages por usuario
settingsRouter.get('/pipeline/:userId', requireUserScope, getPipelineConfig);
settingsRouter.put('/pipeline/:userId', requireUserScope, savePipelineConfig);

// ADM-05: Email templates por usuario
settingsRouter.get('/email-templates/:userId', requireUserScope, getEmailTemplates);
settingsRouter.put('/email-templates/:userId', requireUserScope, saveEmailTemplates);

// ADM-07: Business hours por usuario
settingsRouter.get('/business-hours/:userId', requireUserScope, getBusinessHours);
settingsRouter.put('/business-hours/:userId', requireUserScope, saveBusinessHours);

// ADM-09: Alerts config por negocio
settingsRouter.get('/alerts/:businessId', requireBusinessAccess, getAlertsConfig);
settingsRouter.put('/alerts/:businessId', requireBusinessAccess, saveAlertsConfig);
settingsRouter.post('/alerts/:businessId/manager-focus', requireBusinessAccess, resetAlertsToManagerFocus);

// ADM-06: Export/Import de datos del tenant
settingsRouter.get('/export/:userId', requireUserScope, exportTenantData);
settingsRouter.post('/import/:userId', requireUserScope, importTenantData);

// ADM-10: Payment gateway (pasarela de pago)
settingsRouter.get('/payment-gateway', getPaymentGateway);
settingsRouter.put('/payment-gateway', savePaymentGateway);

// Driver Cash config por usuario
settingsRouter.get('/driver-cash/:userId', requireUserScope, getDriverCashConfig);
settingsRouter.put('/driver-cash/:userId', requireUserScope, saveDriverCashConfig);

// CFG-01: Config status global
settingsRouter.get('/config-status/:businessId', requireBusinessAccess, getConfigStatus);
settingsRouter.put('/config-status/:businessId', requireBusinessAccess, saveConfigStatus);

// CFG-02: Módulos activos
settingsRouter.get('/modules/:businessId', requireBusinessAccess, getModulesConfig);
settingsRouter.put('/modules/:businessId', requireBusinessAccess, saveModulesConfig);

// CFG-03: Correo recepción facturas
settingsRouter.get('/invoice-email/:businessId', requireBusinessAccess, getInvoiceEmail);
settingsRouter.put('/invoice-email/:businessId', requireBusinessAccess, saveInvoiceEmail);

// CFG-04: Configuración de importación
settingsRouter.get('/import-config/:businessId', requireBusinessAccess, getImportConfig);
settingsRouter.put('/import-config/:businessId', requireBusinessAccess, saveImportConfig);

// CFG-05: Estado importación inicial
settingsRouter.get('/initial-import/:businessId', requireBusinessAccess, getInitialImportStatus);
settingsRouter.put('/initial-import/:businessId', requireBusinessAccess, saveInitialImportStatus);

export { settingsRouter };
