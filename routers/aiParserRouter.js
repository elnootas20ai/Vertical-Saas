import { Router } from 'express';
import OpenAI from 'openai';

const aiParserRouter = Router();

let _openai = null;
function getOpenAI() {
  if (!_openai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY no configurada');
    _openai = new OpenAI({
      apiKey,
      baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    });
  }
  return _openai;
}

const MODULE_PROMPTS = {
  vehicles: `Eres un asistente para un sistema de gestión de vehículos. Extrae la información de cada vehículo del texto.
Campos posibles: registrationPlate (matrícula), brand (marca), model (modelo), version (versión), year (año), color, fuelType (combustible: gasolina/diesel/hibrido/electrico), mileage (km), purchasePrice (precio compra), salePrice (precio venta), location (ubicación), status (available/reserved/sold/workshop), notes.`,

  suppliers: `Eres un asistente para un sistema de gestión de proveedores. Extrae la información de cada proveedor del texto.
Campos posibles: name (nombre), cif (CIF/NIF), email, phone (teléfono), address (dirección), contactPerson (persona de contacto), category (categoría), paymentTerms (condiciones de pago), notes (notas).`,

  orders: `Eres un asistente para un sistema de pedidos de compra. Extrae la información de cada pedido del texto.
Campos posibles: supplierName (proveedor), date (fecha pedido), dueDate (fecha vencimiento), taxRate (% IVA), lines (array de {itemName, quantity, unitPrice}), notes.`,

  catalog: `Eres un asistente para un catálogo de artículos/productos. Extrae la información de cada artículo del texto.
Campos posibles: name (nombre), description (descripción), category (categoría), unit (ud/kg/g/l/ml/caja/pack), unitPrice (precio venta), costPrice (precio coste), stockQuantity (stock actual), minStock (stock mínimo), allergens (alérgenos), notes.`,

  costing: `Eres un asistente para escandallos/recetas de cocina. Extrae la información de cada receta del texto.
Campos posibles: name (nombre receta), category (categoría), portions (nº de raciones), salePrice (precio venta), ingredients (array de {name, quantity, unit, costPerUnit}), notes.`,

  salesPoints: `Eres un asistente para puntos de venta. Extrae la información de cada punto de venta del texto.
Campos posibles: name (nombre), address (dirección), phone (teléfono), email, notes.`,

  sales: `Eres un asistente para ventas de vehículos. Extrae la información de cada venta del texto.
Campos posibles: vehiclePlate (matrícula), clientName (nombre cliente), clientPhone (teléfono cliente), clientEmail (email cliente), totalPrice (precio total), stage (interested/reserved/documentation/sold/delivered), deliveryDate (fecha entrega), notes.`,

  billing: `Eres un asistente para facturación. Extrae la información de cada factura del texto.
Campos posibles: invoiceNumber (nº factura), clientName (cliente), date (fecha), dueDate (vencimiento), lines (array de {description, quantity, unitPrice}), taxRate (% IVA), notes.`,

  events: `Eres un asistente para gestión de eventos. Extrae la información de cada evento del texto.
Campos posibles: nombre (nombre evento), tipo (boda/corporativo/cumpleaños/conferencia/feria/gala), fecha, lugar, cliente, invitados (número), presupuesto (número), estado (planificacion/confirmado/en_curso/finalizado/cancelado), notas.`,
};

aiParserRouter.post('/parse-entries', async (req, res) => {
  try {
    const { module, text, fields } = req.body;

    if (!text || typeof text !== 'string' || text.trim().length < 5) {
      return res.status(400).json({ error: 'El texto es demasiado corto para procesar' });
    }

    const openai = getOpenAI();

    const modulePrompt = MODULE_PROMPTS[module] || `Eres un asistente que extrae datos estructurados del texto para el módulo "${module}".`;

    const fieldsDescription = fields?.length
      ? `\nCampos esperados: ${fields.map(f => `${f.key} (${f.label}${f.type ? ', tipo: ' + f.type : ''})`).join(', ')}.`
      : '';

    const systemPrompt = `${modulePrompt}${fieldsDescription}

INSTRUCCIONES:
- Analiza el texto del usuario y extrae TODAS las entradas que encuentres.
- Si el texto describe una sola entrada, devuelve un array con un elemento.
- Si describe múltiples entradas, devuelve todas.
- Responde SOLO con un JSON válido con esta estructura:
{
  "entries": [ { ...campos... }, { ...campos... } ],
  "summary": "Breve resumen de lo extraído"
}
- Si algún campo no está en el texto, omítelo.
- Interpreta precios, fechas y cantidades al formato correcto (números sin moneda, fechas ISO).
- Mantén los textos en español.`;

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    });

    const raw = completion.choices[0]?.message?.content || '{}';
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return res.status(500).json({ error: 'La IA devolvió un formato inesperado' });
    }

    const entries = Array.isArray(parsed.entries) ? parsed.entries : [];

    res.json({
      ok: true,
      entries,
      summary: parsed.summary || `Se encontraron ${entries.length} entrada(s)`,
    });
  } catch (err) {
    console.error('[AI Parser]', err);
    const message = err.message?.includes('OPENAI_API_KEY')
      ? 'API key de OpenAI no configurada. Ve a Ajustes > IA para configurarla.'
      : 'Error al procesar con IA';
    res.status(500).json({ error: message });
  }
});

aiParserRouter.post('/chat', async (req, res) => {
  try {
    const { messages, context } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Se requieren mensajes para el chat' });
    }

    const openai = getOpenAI();

    const systemPrompt = `Eres un asistente experto en planificación y gestión de eventos. Trabajas integrado en un software de gestión de eventos.

Tu rol es ayudar al trabajador con:
- Generar checklists y timelines para eventos
- Sugerir soluciones a problemas logísticos
- Recomendar menús de catering según número de invitados y tipo de evento
- Redactar comunicaciones para invitados y proveedores
- Planificar distribución de mesas y espacios
- Calcular presupuestos aproximados
- Resolver incidencias y contingencias durante eventos
- Proponer ideas creativas para decoración y entretenimiento

${context ? `Contexto actual del evento:\n${context}` : ''}

INSTRUCCIONES:
- Responde SIEMPRE en español.
- Sé conciso, práctico y profesional.
- Si generas listas, usa formato claro con viñetas.
- Si te piden generar datos estructurados, responde con JSON dentro de un bloque \`\`\`json.
- Incluye estimaciones de tiempo y coste cuando sea relevante.`;

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({ role: m.role, content: m.content })),
      ],
      temperature: 0.5,
      max_tokens: 2000,
    });

    const reply = completion.choices[0]?.message?.content || 'No se pudo generar una respuesta.';

    res.json({ ok: true, reply });
  } catch (err) {
    console.error('[AI Chat]', err);
    const message = err.message?.includes('OPENAI_API_KEY')
      ? 'API key de OpenAI no configurada.'
      : 'Error al procesar con IA';
    res.status(500).json({ error: message });
  }
});

export default aiParserRouter;
