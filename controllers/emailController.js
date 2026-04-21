/**
 * Email Controller — B-08
 *
 * Soporta dos proveedores configurables via variables de entorno:
 *   EMAIL_PROVIDER=resend  → usa la API HTTP de Resend (RESEND_API_KEY requerida)
 *   EMAIL_PROVIDER=smtp    → usa nodemailer con SMTP (SMTP_* vars requeridas)
 *
 * Si no hay proveedor configurado responde 503.
 */

function getEmailConfig() {
  return {
    provider: (process.env.EMAIL_PROVIDER || '').toLowerCase().trim(),
    fromAddress: process.env.EMAIL_FROM || process.env.RESEND_FROM || 'noreply@example.com',
    fromName: process.env.EMAIL_FROM_NAME || 'Notificaciones',
    resendApiKey: process.env.RESEND_API_KEY || '',
    smtpHost: process.env.SMTP_HOST || '',
    smtpPort: Number(process.env.SMTP_PORT || 587),
    smtpUser: process.env.SMTP_USER || '',
    smtpPass: process.env.SMTP_PASS || '',
    smtpSecure: process.env.SMTP_SECURE === 'true',
  };
}

async function sendViaResend({ to, subject, html, text, replyTo, cc, bcc, fromAddress, fromName, apiKey }) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${fromName} <${fromAddress}>`,
      to: Array.isArray(to) ? to : [to],
      subject,
      html: html || undefined,
      text: text || undefined,
      reply_to: replyTo || undefined,
      cc: cc && cc.length ? cc : undefined,
      bcc: bcc && bcc.length ? bcc : undefined,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      payload?.message || payload?.error || `Resend error ${response.status}`,
    );
  }

  return { messageId: payload.id, provider: 'resend' };
}

async function sendViaSmtp({ to, subject, html, text, replyTo, cc, bcc, fromAddress, fromName, cfg }) {
  let nodemailer;
  try {
    nodemailer = (await import('nodemailer')).default;
  } catch {
    throw new Error('nodemailer no esta instalado. Ejecuta: npm install nodemailer');
  }

  const transporter = nodemailer.createTransport({
    host: cfg.smtpHost,
    port: cfg.smtpPort,
    secure: cfg.smtpSecure,
    auth: cfg.smtpUser ? { user: cfg.smtpUser, pass: cfg.smtpPass } : undefined,
  });

  const info = await transporter.sendMail({
    from: `"${fromName}" <${fromAddress}>`,
    to: Array.isArray(to) ? to.join(', ') : to,
    cc: Array.isArray(cc) && cc.length ? cc.join(', ') : undefined,
    bcc: Array.isArray(bcc) && bcc.length ? bcc.join(', ') : undefined,
    replyTo: replyTo || undefined,
    subject,
    text: text || undefined,
    html: html || undefined,
  });

  return { messageId: info.messageId, provider: 'smtp' };
}

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

export async function sendEmail(req, res) {
  try {
    const cfg = getEmailConfig();

    if (!cfg.provider) {
      return res.status(503).json({
        ok: false,
        error: 'Proveedor de email no configurado. Define EMAIL_PROVIDER=resend o EMAIL_PROVIDER=smtp en .env',
      });
    }

    const { to, subject, html, text, replyTo, cc, bcc, templateType, templateData } = req.body || {};

    if (!to) return badRequest(res, 'Falta el destinatario (to)');
    if (!subject) return badRequest(res, 'Falta el asunto (subject)');
    if (!html && !text) return badRequest(res, 'Falta el cuerpo del email (html o text)');

    const recipients = Array.isArray(to) ? to : [to];
    if (recipients.some((r) => !String(r || '').includes('@'))) {
      return badRequest(res, 'Uno o mas destinatarios tienen formato de email invalido');
    }

    const sendPayload = {
      to: recipients,
      subject: String(subject),
      html: html ? String(html) : undefined,
      text: text ? String(text) : undefined,
      replyTo: replyTo ? String(replyTo) : undefined,
      cc: Array.isArray(cc) ? cc : [],
      bcc: Array.isArray(bcc) ? bcc : [],
      fromAddress: cfg.fromAddress,
      fromName: cfg.fromName,
    };

    let result;
    if (cfg.provider === 'resend') {
      if (!cfg.resendApiKey) {
        return res.status(503).json({ ok: false, error: 'Falta RESEND_API_KEY en las variables de entorno' });
      }
      result = await sendViaResend({ ...sendPayload, apiKey: cfg.resendApiKey });
    } else if (cfg.provider === 'smtp') {
      if (!cfg.smtpHost) {
        return res.status(503).json({ ok: false, error: 'Falta SMTP_HOST en las variables de entorno' });
      }
      result = await sendViaSmtp({ ...sendPayload, cfg });
    } else {
      return res.status(503).json({
        ok: false,
        error: `Proveedor "${cfg.provider}" no soportado. Usa resend o smtp.`,
      });
    }

    return res.json({
      ok: true,
      messageId: result.messageId,
      provider: result.provider,
      to: recipients,
      subject,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al enviar email' });
  }
}

export async function sendInviteEmail(req, res) {
  const { to, inviterName, inviteUrl, role } = req.body || {};
  if (!to || !inviteUrl) {
    return res.status(400).json({ ok: false, error: 'Faltan campos: to, inviteUrl' });
  }

  req.body = {
    to,
    subject: `${inviterName || 'Tu equipo'} te ha invitado`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto">
        <h2>Has sido invitado${role ? ` como ${role}` : ''}</h2>
        <p>${inviterName ? `<strong>${inviterName}</strong> te ha invitado` : 'Has sido invitado'} a unirte a la plataforma.</p>
        <p><a href="${inviteUrl}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block">Aceptar invitacion</a></p>
        <p style="color:#6b7280;font-size:13px">Si no esperabas esta invitacion puedes ignorar este mensaje.</p>
      </div>
    `,
  };

  return sendEmail(req, res);
}

export async function sendPasswordResetEmail(req, res) {
  const { to, resetUrl, userName } = req.body || {};
  if (!to || !resetUrl) {
    return res.status(400).json({ ok: false, error: 'Faltan campos: to, resetUrl' });
  }

  req.body = {
    to,
    subject: 'Restablece tu contrasena',
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto">
        <h2>Restablecer contrasena</h2>
        <p>Hola${userName ? ` ${userName}` : ''},</p>
        <p>Hemos recibido una solicitud para restablecer tu contrasena. Haz clic en el boton para continuar:</p>
        <p><a href="${resetUrl}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block">Restablecer contrasena</a></p>
        <p style="color:#6b7280;font-size:13px">Este enlace expira en 24 horas. Si no solicitaste este cambio ignora este mensaje.</p>
      </div>
    `,
  };

  return sendEmail(req, res);
}

export async function sendDocumentSignatureEmail(req, res) {
  const { to, documentName, signUrl, clientName } = req.body || {};
  if (!to || !signUrl || !documentName) {
    return res.status(400).json({ ok: false, error: 'Faltan campos: to, signUrl, documentName' });
  }

  req.body = {
    to,
    subject: `Documento pendiente de firma: ${documentName}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto">
        <h2>Documento para firmar</h2>
        <p>Hola${clientName ? ` ${clientName}` : ''},</p>
        <p>Tienes un documento pendiente de firma: <strong>${documentName}</strong></p>
        <p><a href="${signUrl}" style="background:#059669;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block">Firmar documento</a></p>
        <p style="color:#6b7280;font-size:13px">Si tienes dudas contacta con nosotros antes de firmar.</p>
      </div>
    `,
  };

  return sendEmail(req, res);
}

export async function sendAppointmentReminderEmail(req, res) {
  const { to, name, appointmentDate, vehicleInterest, dealerName, dealerPhone, notes } = req.body || {};
  if (!to || !name || !appointmentDate) {
    return res.status(400).json({ ok: false, error: 'Faltan campos: to, name, appointmentDate' });
  }

  const formattedDate = new Date(appointmentDate).toLocaleString('es-ES', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  req.body = {
    to,
    subject: `Recordatorio de cita — ${dealerName || 'Concesionario'}`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
        <div style="background:linear-gradient(135deg,#6d28d9,#7c3aed);padding:24px 32px;color:#fff">
          <h1 style="margin:0;font-size:22px;font-weight:700">Recordatorio de cita</h1>
          <p style="margin:6px 0 0;opacity:.85;font-size:14px">${dealerName || 'Tu concesionario de confianza'}</p>
        </div>
        <div style="padding:32px">
          <p style="color:#374151;font-size:16px">Hola <strong>${name}</strong>,</p>
          <p style="color:#6b7280;font-size:14px;line-height:1.6">
            Te recordamos que tienes una cita programada con nosotros:
          </p>
          <div style="background:#f5f3ff;border:1px solid #c4b5fd;border-radius:8px;padding:20px;margin:20px 0">
            <p style="margin:0 0 8px;font-size:13px;color:#7c3aed;font-weight:600;text-transform:uppercase;letter-spacing:.05em">📅 Fecha y hora</p>
            <p style="margin:0;font-size:18px;font-weight:700;color:#1f2937;text-transform:capitalize">${formattedDate}</p>
            ${vehicleInterest ? `
              <p style="margin:12px 0 4px;font-size:13px;color:#7c3aed;font-weight:600;text-transform:uppercase;letter-spacing:.05em">🚗 Vehículo de interés</p>
              <p style="margin:0;font-size:15px;font-weight:600;color:#1f2937">${vehicleInterest}</p>
            ` : ''}
            ${notes ? `
              <p style="margin:12px 0 4px;font-size:13px;color:#7c3aed;font-weight:600;text-transform:uppercase;letter-spacing:.05em">📝 Notas</p>
              <p style="margin:0;font-size:14px;color:#4b5563">${notes}</p>
            ` : ''}
          </div>
          ${dealerPhone ? `<p style="color:#6b7280;font-size:13px">Si necesitas cancelar o cambiar la cita, llámanos al <strong>${dealerPhone}</strong>.</p>` : ''}
          <p style="color:#9ca3af;font-size:12px;margin-top:24px;padding-top:16px;border-top:1px solid #f3f4f6">
            Este mensaje ha sido enviado automáticamente. Por favor no respondas a este email.
          </p>
        </div>
      </div>
    `,
  };

  return sendEmail(req, res);
}

export async function sendInvoiceEmail(req, res) {
  const { userId, invoiceId } = req.body || {};
  if (!userId || !invoiceId) {
    return res.status(400).json({ ok: false, error: 'Faltan campos: userId, invoiceId' });
  }

  const couchdb = await import('../services/couchdb.js');
  const invoiceDb = couchdb.getInvoicesDbName();
  await couchdb.ensureDatabase(req, invoiceDb);
  const invoice = await couchdb.getDocument(req, invoiceDb, invoiceId);
  if (!invoice || invoice.type !== 'client_invoice') {
    return res.status(404).json({ ok: false, error: 'Factura no encontrada' });
  }

  if (!invoice.clientEmail) {
    return res.status(400).json({ ok: false, error: 'El cliente no tiene email configurado' });
  }

  const account = await couchdb.findAccountByUserId(req, userId);
  const issuerName = invoice.issuerName || account?.companyName || account?.fullName || 'Tu empresa';
  const issuerEmail = invoice.issuerEmail || account?.email || '';

  const fmtCur = (v) => Number(v || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 }) + ' \u20ac';
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';

  const periodText = invoice.periodStart && invoice.periodEnd
    ? ` correspondiente al periodo ${fmtDate(invoice.periodStart)} \u2014 ${fmtDate(invoice.periodEnd)}`
    : '';

  const linesHtml = (invoice.lines || []).map((l) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:14px;color:#374151">${l.description || ''}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:14px;color:#374151;text-align:center">${l.quantity || 1}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:14px;color:#374151;text-align:right">${fmtCur(l.unitPrice)}</td>
    </tr>
  `).join('');

  req.body = {
    to: invoice.clientEmail,
    subject: `Factura ${invoice.number} \u2014 ${issuerName}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
        <div style="background:linear-gradient(135deg,#059669,#10b981);padding:24px 32px;color:#fff">
          <h1 style="margin:0;font-size:22px;font-weight:700">Factura ${invoice.number}</h1>
          <p style="margin:6px 0 0;opacity:.85;font-size:14px">${issuerName}</p>
        </div>
        <div style="padding:32px">
          <p style="color:#374151;font-size:16px">Estimado/a <strong>${invoice.clientName}</strong>,</p>
          <p style="color:#6b7280;font-size:14px;line-height:1.6">
            Le adjuntamos la factura <strong>${invoice.number}</strong>${periodText}.
          </p>
          ${linesHtml ? `
            <table style="width:100%;border-collapse:collapse;margin:20px 0">
              <thead>
                <tr style="background:#f9fafb">
                  <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;text-transform:uppercase">Concepto</th>
                  <th style="padding:8px 12px;text-align:center;font-size:12px;color:#6b7280;text-transform:uppercase">Cant.</th>
                  <th style="padding:8px 12px;text-align:right;font-size:12px;color:#6b7280;text-transform:uppercase">Precio</th>
                </tr>
              </thead>
              <tbody>${linesHtml}</tbody>
            </table>
          ` : ''}
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:20px 0">
            <table style="width:100%">
              ${invoice.subtotal ? `<tr><td style="font-size:14px;color:#6b7280;padding:2px 0">Subtotal</td><td style="text-align:right;font-size:14px;color:#374151">${fmtCur(invoice.subtotal)}</td></tr>` : ''}
              ${invoice.taxAmount ? `<tr><td style="font-size:14px;color:#6b7280;padding:2px 0">IVA</td><td style="text-align:right;font-size:14px;color:#374151">${fmtCur(invoice.taxAmount)}</td></tr>` : ''}
              <tr><td style="font-size:18px;font-weight:700;color:#059669;padding:8px 0 0">Total</td><td style="text-align:right;font-size:18px;font-weight:700;color:#059669;padding:8px 0 0">${fmtCur(invoice.total)}</td></tr>
            </table>
          </div>
          <p style="color:#6b7280;font-size:14px;line-height:1.6">
            <strong>Fecha de vencimiento:</strong> ${fmtDate(invoice.dueDate)}<br/>
            ${invoice.paymentMethod ? `<strong>Forma de pago:</strong> ${invoice.paymentMethod}` : ''}
          </p>
          ${issuerEmail ? `<p style="color:#6b7280;font-size:13px">Para cualquier consulta, contacte con nosotros en <a href="mailto:${issuerEmail}" style="color:#059669">${issuerEmail}</a>.</p>` : ''}
          <p style="color:#9ca3af;font-size:12px;margin-top:24px;padding-top:16px;border-top:1px solid #f3f4f6">
            Este mensaje ha sido enviado autom\u00e1ticamente.
          </p>
        </div>
      </div>
    `,
  };

  try {
    const now = new Date().toISOString();
    const updated = couchdb.buildInvoiceDocument(userId, { ...invoice, sentAt: now, sentTo: invoice.clientEmail }, invoice);
    await couchdb.putDocument(req, invoiceDb, updated._id, updated);
  } catch (_) { /* non-critical */ }

  return sendEmail(req, res);
}
