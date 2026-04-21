/**
 * Shipping rate calculation based on postal code zones.
 *
 * Each business can define shipping zones with postal code patterns,
 * multiple carriers/options per zone, and fallback to a default rate.
 *
 * Zone matching supports:
 *   - Exact codes: "28001"
 *   - Prefix wildcards: "28*" (matches 28000–28999)
 *   - Ranges: "28001-28050"
 */

/**
 * @typedef {Object} ShippingOption
 * @property {string} id
 * @property {string} carrier - e.g. "Estándar", "Express", "MRW", "SEUR"
 * @property {number} rate
 * @property {string} estimatedTime - e.g. "24-48h"
 */

/**
 * @typedef {Object} ShippingZone
 * @property {string} id
 * @property {string} name - e.g. "Madrid Centro", "Baleares"
 * @property {string[]} postalCodes - patterns: "28*", "07001-07999", "08001"
 * @property {ShippingOption[]} options
 * @property {boolean} active
 */

function normalizePostalCode(code) {
  return String(code || '').trim().replace(/\s+/g, '');
}

function matchesPattern(postalCode, pattern) {
  const pc = normalizePostalCode(postalCode);
  const pat = normalizePostalCode(pattern);
  if (!pc || !pat) return false;

  if (pat.includes('-')) {
    const [start, end] = pat.split('-').map((s) => s.trim());
    return pc >= start && pc <= end;
  }

  if (pat.endsWith('*')) {
    const prefix = pat.slice(0, -1);
    return pc.startsWith(prefix);
  }

  return pc === pat;
}

export function findMatchingZone(postalCode, zones) {
  if (!postalCode || !Array.isArray(zones)) return null;

  for (const zone of zones) {
    if (!zone.active) continue;
    const patterns = Array.isArray(zone.postalCodes) ? zone.postalCodes : [];
    for (const pattern of patterns) {
      if (matchesPattern(postalCode, pattern)) {
        return zone;
      }
    }
  }
  return null;
}

export function calculateShippingRates(postalCode, config) {
  if (!config) return { zone: null, options: [], fallback: true, error: null };

  const shippingMode = config.shippingMode || 'fixed';

  if (shippingMode === 'fixed') {
    return {
      zone: null,
      options: [
        {
          id: 'default',
          carrier: 'Envío estándar',
          rate: Number(config.deliveryFee || 0),
          estimatedTime: config.estimatedDeliveryTime || '',
        },
      ],
      fallback: false,
      error: null,
    };
  }

  const zones = Array.isArray(config.shippingZones) ? config.shippingZones : [];
  const pc = normalizePostalCode(postalCode);

  if (!pc) {
    return { zone: null, options: [], fallback: true, error: 'Introduce un código postal' };
  }

  const zone = findMatchingZone(pc, zones);

  if (zone) {
    const options = (zone.options || []).filter((o) => o.rate != null);
    return { zone: { id: zone.id, name: zone.name }, options, fallback: false, error: null };
  }

  if (config.deliveryFee != null && config.deliveryFee > 0) {
    return {
      zone: null,
      options: [
        {
          id: 'fallback',
          carrier: 'Envío estándar',
          rate: Number(config.deliveryFee),
          estimatedTime: config.estimatedDeliveryTime || '',
        },
      ],
      fallback: true,
      error: null,
    };
  }

  return {
    zone: null,
    options: [],
    fallback: true,
    error: 'No hay envío disponible para este código postal',
  };
}
