import {
  getAppointmentsDbName,
  buildAppointmentDocument,
  buildBookingConfigDocument,
  sanitizeAppointment,
  listAppointmentsByUser,
  ensureDatabase,
  getDocument,
  putDocument,
  softDeleteDocument,
  findAccountByUserId,
  logAccountActivity,
  listBusinessesByUser,
} from '../services/couchdb.js';

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

async function ensureAppointmentOwner(req, userId, appointmentId) {
  const db = getAppointmentsDbName();
  await ensureDatabase(req, db);
  const appt = await getDocument(req, db, appointmentId);
  if (!appt || appt.type !== 'appointment' || appt.user_id !== userId) {
    return null;
  }
  return appt;
}

// ─── LIST ─────────────────────────────────────────────────────────────────────

export async function listAppointments(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const appointments = await listAppointmentsByUser(req, userId);
    return res.json({ ok: true, appointments: appointments.map(sanitizeAppointment) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar citas' });
  }
}

// ─── CREATE ───────────────────────────────────────────────────────────────────

export async function createAppointment(req, res) {
  try {
    const { userId } = req.params;
    const { appointment } = req.body || {};

    if (!userId) return badRequest(res, 'Falta userId');
    if (!appointment || typeof appointment !== 'object') return badRequest(res, 'Falta el objeto appointment en el body');
    if (!appointment.clientName?.trim()) return badRequest(res, 'El nombre del cliente es obligatorio');
    if (!appointment.date?.trim()) return badRequest(res, 'La fecha es obligatoria');
    if (!appointment.time?.trim()) return badRequest(res, 'La hora es obligatoria');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getAppointmentsDbName();
    await ensureDatabase(req, db);
    const doc = buildAppointmentDocument(userId, { ...appointment, source: 'internal' });
    const saved = await putDocument(req, db, doc._id, doc);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'appointment',
      action: `Creó cita para ${doc.clientName} el ${doc.date} a las ${doc.time}`,
      entityId: doc._id,
      entityLabel: doc.clientName,
      metadata: { appointmentType: doc.appointmentType, date: doc.date },
    });

    return res.status(201).json({ ok: true, appointment: sanitizeAppointment({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear cita' });
  }
}

// ─── UPDATE ───────────────────────────────────────────────────────────────────

export async function updateAppointment(req, res) {
  try {
    const { userId, appointmentId } = req.params;
    const { appointment } = req.body || {};

    if (!appointment || typeof appointment !== 'object') return badRequest(res, 'Faltan datos de la cita');

    const existing = await ensureAppointmentOwner(req, userId, appointmentId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Cita no encontrada' });

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getAppointmentsDbName();
    const doc = buildAppointmentDocument(userId, { ...existing, ...appointment }, existing);
    const saved = await putDocument(req, db, doc._id, doc);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'appointment',
      action: `Actualizó cita de ${doc.clientName} — estado: ${doc.status}`,
      entityId: doc._id,
      entityLabel: doc.clientName,
      metadata: { status: doc.status },
    });

    return res.json({ ok: true, appointment: sanitizeAppointment({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar cita' });
  }
}

// ─── DELETE ───────────────────────────────────────────────────────────────────

export async function removeAppointment(req, res) {
  try {
    const { userId, appointmentId } = req.params;

    const existing = await ensureAppointmentOwner(req, userId, appointmentId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Cita no encontrada' });

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getAppointmentsDbName();
    await softDeleteDocument(req, db, appointmentId);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'appointment',
      action: `Eliminó cita de ${existing.clientName}`,
      entityId: existing._id,
      entityLabel: existing.clientName,
      metadata: {},
    });

    return res.json({ ok: true, id: appointmentId });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al eliminar cita' });
  }
}

// ─── BOOKING CONFIG ───────────────────────────────────────────────────────────

export async function getBookingConfig(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    const db = getAppointmentsDbName();
    await ensureDatabase(req, db);

    const configId = `booking-config-${userId}`;
    const existing = await getDocument(req, db, configId).catch(() => null);

    if (!existing || existing.type !== 'booking_config') {
      // Return default config
      const defaultConfig = buildBookingConfigDocument(userId, {});
      return res.json({ ok: true, config: defaultConfig });
    }

    return res.json({ ok: true, config: existing });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar configuración' });
  }
}

export async function saveBookingConfig(req, res) {
  try {
    const { userId } = req.params;
    const { config } = req.body || {};

    if (!userId) return badRequest(res, 'Falta userId');
    if (!config || typeof config !== 'object') return badRequest(res, 'Falta el objeto config en el body');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getAppointmentsDbName();
    await ensureDatabase(req, db);

    const configId = `booking-config-${userId}`;
    const existing = await getDocument(req, db, configId).catch(() => null);

    const doc = buildBookingConfigDocument(userId, config, existing?.type === 'booking_config' ? existing : null);
    await putDocument(req, db, doc._id, doc);

    return res.json({ ok: true, config: doc });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al guardar configuración' });
  }
}

// ─── PUBLIC: get available slots ──────────────────────────────────────────────

export async function getPublicBookingInfo(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Comercial no encontrado' });

    const businesses = await listBusinessesByUser(req, userId).catch(() => []);
    const business = businesses[0] || null;
    const businessType = business?.businessType || 'carDealership';

    const db = getAppointmentsDbName();
    await ensureDatabase(req, db);

    const configId = `booking-config-${userId}`;
    const rawConfig = await getDocument(req, db, configId).catch(() => null);
    const config = (rawConfig && rawConfig.type === 'booking_config')
      ? rawConfig
      : buildBookingConfigDocument(userId, {}, null, businessType);

    if (!config.enabled) {
      return res.status(403).json({ ok: false, error: 'La agenda de este comercial no está disponible públicamente' });
    }

    return res.json({
      ok: true,
      dealer: {
        userId,
        displayName: config.displayName || account.fullName || account.companyName || 'Comercial',
        companyName: business?.name || account.companyName || '',
        logo: account.logo || business?.logo || null,
        businessType,
      },
      config: {
        slotDuration: config.slotDuration,
        bufferMinutes: config.bufferMinutes,
        maxDaysAhead: config.maxDaysAhead,
        appointmentTypes: config.appointmentTypes,
        workingHours: config.workingHours,
      },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar información' });
  }
}

export async function getAvailableSlots(req, res) {
  try {
    const { userId } = req.params;
    const { date } = req.query;

    if (!userId) return badRequest(res, 'Falta userId');
    if (!date) return badRequest(res, 'Falta la fecha');

    const db = getAppointmentsDbName();
    await ensureDatabase(req, db);

    const configId = `booking-config-${userId}`;
    const rawConfig = await getDocument(req, db, configId).catch(() => null);
    const config = (rawConfig && rawConfig.type === 'booking_config')
      ? rawConfig
      : buildBookingConfigDocument(userId, {});

    if (!config.enabled) {
      return res.json({ ok: true, slots: [] });
    }

    // Get day of week
    const dayDate = new Date(date + 'T12:00:00');
    const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const dayKey = dayNames[dayDate.getDay()];
    const dayConfig = config.workingHours?.[dayKey];

    if (!dayConfig || !dayConfig.enabled) {
      return res.json({ ok: true, slots: [] });
    }

    // Generate all slots for this day
    const [startH, startM] = dayConfig.start.split(':').map(Number);
    const [endH, endM] = dayConfig.end.split(':').map(Number);
    const startMins = startH * 60 + startM;
    const endMins = endH * 60 + endM;
    const duration = config.slotDuration || 60;
    const buffer = config.bufferMinutes || 0;

    const allSlots = [];
    for (let m = startMins; m + duration <= endMins; m += duration + buffer) {
      const h = Math.floor(m / 60);
      const min = m % 60;
      allSlots.push(`${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`);
    }

    // Get booked appointments for this user on this date
    const allAppointments = await listAppointmentsByUser(req, userId);
    const bookedSlots = new Set(
      allAppointments
        .filter((a) => a.date === date && ['pending', 'confirmed'].includes(a.status))
        .map((a) => a.time),
    );

    const availableSlots = allSlots.filter((slot) => !bookedSlots.has(slot));

    return res.json({ ok: true, slots: availableSlots });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al calcular slots' });
  }
}

// ─── PUBLIC: create booking ───────────────────────────────────────────────────

export async function createPublicBooking(req, res) {
  try {
    const { userId } = req.params;
    const { appointment } = req.body || {};

    if (!userId) return badRequest(res, 'Falta userId');
    if (!appointment || typeof appointment !== 'object') return badRequest(res, 'Falta el objeto appointment');
    if (!appointment.clientName?.trim()) return badRequest(res, 'El nombre es obligatorio');
    if (!appointment.clientPhone?.trim()) return badRequest(res, 'El teléfono es obligatorio');
    if (!appointment.date?.trim()) return badRequest(res, 'La fecha es obligatoria');
    if (!appointment.time?.trim()) return badRequest(res, 'La hora es obligatoria');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Comercial no encontrado' });

    const db = getAppointmentsDbName();
    await ensureDatabase(req, db);

    const configId = `booking-config-${userId}`;
    const rawConfig = await getDocument(req, db, configId).catch(() => null);
    const config = (rawConfig && rawConfig.type === 'booking_config')
      ? rawConfig
      : buildBookingConfigDocument(userId, {});

    if (!config.enabled) {
      return res.status(403).json({ ok: false, error: 'La reserva no está disponible actualmente' });
    }

    // Verify slot is still available
    const allAppointments = await listAppointmentsByUser(req, userId);
    const slotTaken = allAppointments.some(
      (a) => a.date === appointment.date && a.time === appointment.time && ['pending', 'confirmed'].includes(a.status),
    );

    if (slotTaken) {
      return res.status(409).json({ ok: false, error: 'Este horario ya no está disponible. Por favor elige otro.' });
    }

    const doc = buildAppointmentDocument(userId, {
      ...appointment,
      source: 'booking',
      status: 'pending',
      assignedTo: userId,
      assignedName: config.displayName || account.fullName || '',
    });
    const saved = await putDocument(req, db, doc._id, doc);

    return res.status(201).json({ ok: true, appointment: sanitizeAppointment({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear la reserva' });
  }
}
