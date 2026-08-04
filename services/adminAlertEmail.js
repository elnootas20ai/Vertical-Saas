export function escapeAdminHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

const SEVERITY_STYLES = {
  critical: { header: '#dc2626', label: 'Crítico' },
  warning: { header: '#ea580c', label: 'Aviso' },
  success: { header: '#16a34a', label: 'Recuperado' },
  info: { header: '#18181b', label: 'Vertial' },
};

/**
 * Plantilla HTML unificada para alertas admin (infra y negocio corto).
 * Si el HTML ya es documento completo (<!DOCTYPE), no envolver.
 */
export function buildAdminAlertEmailHtml({
  title,
  subtitle = 'Alerta del sistema',
  bodyHtml,
  severity = 'info',
}) {
  const style = SEVERITY_STYLES[severity] || SEVERITY_STYLES.info;
  const safeTitle = escapeAdminHtml(title);
  const safeSubtitle = escapeAdminHtml(subtitle);

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;background:#f4f4f5;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:28px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e4e4e7;box-shadow:0 4px 24px rgba(0,0,0,.06);">
        <tr>
          <td style="background:${style.header};padding:22px 26px;">
            <p style="margin:0;color:#fafafa;font-size:15px;font-weight:600;letter-spacing:-0.02em;">${safeTitle}</p>
            <p style="margin:6px 0 0;color:rgba(255,255,255,0.88);font-size:13px;line-height:1.4;">${safeSubtitle}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:26px 26px 22px;font-size:14px;color:#18181b;line-height:1.55;">
            ${bodyHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:0 26px 22px;">
            <p style="margin:0;padding:12px 14px;background:#fafafa;border-radius:10px;font-size:12px;color:#71717a;line-height:1.5;">
              Mensaje automático · ${escapeAdminHtml(style.label)} · ${new Date().toISOString()}
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function wrapAdminAlertHtml(subject, html, severity = 'info') {
  if (/<!DOCTYPE/i.test(String(html || ''))) return html;
  const title = String(subject || 'Vertial')
    .replace(/^[\p{Extended_Pictographic}\s]+/u, '')
    .trim() || 'Vertial';
  return buildAdminAlertEmailHtml({
    title,
    subtitle: 'Alerta operativa · vertialapp.com',
    bodyHtml: html,
    severity,
  });
}

export function adminAlertSeverityForKey(key = '') {
  const k = String(key);
  if (k.includes('recovered') || k.includes('recuperado') || k.startsWith('daily_ops_digest')) {
    return 'success';
  }
  if (
    k.startsWith('backup_stale')
    || k.startsWith('ram_')
    || k.startsWith('disk_')
    || k.startsWith('trial_')
    || k.startsWith('invite_email_fail')
  ) {
    return 'warning';
  }
  if (
    k.includes('down')
    || k.includes('fail')
    || k.includes('spike')
    || k.startsWith('backup_failed')
    || k.startsWith('payment_failed')
    || k.startsWith('subscription_suspended')
  ) {
    return 'critical';
  }
  return 'info';
}
