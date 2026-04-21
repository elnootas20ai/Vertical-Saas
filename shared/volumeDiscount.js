/**
 * @typedef {Object} VolumeDiscountRule
 * @property {string}  id
 * @property {number}  minQuantity
 * @property {number|null} maxQuantity  - null means unlimited
 * @property {'percentage'|'fixed'} discountType
 * @property {number}  discountValue
 * @property {string}  label
 * @property {boolean} active
 */

/**
 * Finds the best matching volume discount rule for a given total quantity.
 * Rules are sorted by minQuantity descending so the highest applicable tier wins.
 *
 * @param {VolumeDiscountRule[]} rules
 * @param {number} totalQuantity
 * @returns {VolumeDiscountRule|null}
 */
export function findApplicableRule(rules, totalQuantity) {
  if (!Array.isArray(rules) || totalQuantity <= 0) return null;

  const activeRules = rules
    .filter((r) => r && r.active)
    .sort((a, b) => b.minQuantity - a.minQuantity);

  for (const rule of activeRules) {
    const min = Number(rule.minQuantity) || 0;
    const max = rule.maxQuantity != null ? Number(rule.maxQuantity) : Infinity;
    if (totalQuantity >= min && totalQuantity <= max) {
      return rule;
    }
  }
  return null;
}

/**
 * Calculates the discount amount for a given subtotal and matched rule.
 *
 * @param {VolumeDiscountRule|null} rule
 * @param {number} subtotal
 * @returns {number}
 */
export function calculateDiscountAmount(rule, subtotal) {
  if (!rule || subtotal <= 0) return 0;
  if (rule.discountType === 'percentage') {
    const pct = Math.min(Math.max(Number(rule.discountValue) || 0, 0), 100);
    return Math.round(subtotal * (pct / 100) * 100) / 100;
  }
  if (rule.discountType === 'fixed') {
    const fixed = Math.max(Number(rule.discountValue) || 0, 0);
    return Math.min(fixed, subtotal);
  }
  return 0;
}

/**
 * Convenience: given rules, items (with quantity & total), returns
 * { rule, discountAmount, totalQuantity }.
 *
 * @param {VolumeDiscountRule[]} rules
 * @param {{ quantity: number, total: number }[]} items
 * @returns {{ rule: VolumeDiscountRule|null, discountAmount: number, totalQuantity: number }}
 */
export function computeVolumeDiscount(rules, items) {
  const totalQuantity = (items || []).reduce((s, i) => s + (Number(i.quantity) || 0), 0);
  const subtotal = (items || []).reduce((s, i) => s + (Number(i.total) || 0), 0);
  const rule = findApplicableRule(rules, totalQuantity);
  const discountAmount = calculateDiscountAmount(rule, subtotal);
  return { rule, discountAmount, totalQuantity };
}
