/** Canje loyalty sala — alineado con services/restaurantLoyaltyRedeem.js */
export const LOYALTY_EURO_PER_POINT = 0.1;

export function loyaltyDiscountFromPoints(points: number): number {
  const pts = Math.max(0, Math.floor(Number(points) || 0));
  return Math.round(pts * LOYALTY_EURO_PER_POINT * 100) / 100;
}

export function loyaltyPointsForDiscount(euroAmount: number): number {
  const euros = Math.max(0, Number(euroAmount) || 0);
  if (!(euros > 0) || !(LOYALTY_EURO_PER_POINT > 0)) return 0;
  return Math.ceil(euros / LOYALTY_EURO_PER_POINT);
}

export function maxRedeemablePoints(availablePoints: number, subtotal: number): number {
  const byBalance = Math.max(0, Math.floor(Number(availablePoints) || 0));
  const bySubtotal = loyaltyPointsForDiscount(Math.max(0, Number(subtotal) || 0));
  return Math.min(byBalance, bySubtotal);
}
