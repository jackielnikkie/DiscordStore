export type PriceTier = {
  qty: number;
  price: number;
};

export const MAX_PRICE_TIERS = 10;

export function parsePriceTiers(raw?: string | null): PriceTier[] {
  if (!raw) {
    return [];
  }

  try {
    const data = JSON.parse(raw);

    if (!Array.isArray(data)) {
      return [];
    }

    return data
      .map((entry) => ({
        qty: Number((entry as PriceTier)?.qty),
        price: Number((entry as PriceTier)?.price),
      }))
      .filter(
        (tier) =>
          Number.isFinite(tier.qty) &&
          Number.isFinite(tier.price) &&
          tier.qty >= 2 &&
          tier.price > 0,
      )
      .sort((a, b) => a.qty - b.qty)
      .slice(0, MAX_PRICE_TIERS);
  } catch {
    return [];
  }
}

export function serializePriceTiers(tiers: PriceTier[]) {
  const clean = tiers
    .map((tier) => ({ qty: Number(tier.qty), price: Number(tier.price) }))
    .filter((tier) => Number.isFinite(tier.qty) && Number.isFinite(tier.price))
    .filter((tier) => tier.qty >= 2 && tier.price > 0)
    .sort((a, b) => a.qty - b.qty)
    .slice(0, MAX_PRICE_TIERS);

  return clean.length > 0 ? JSON.stringify(clean) : "";
}

export function normalizePriceTiersJson(raw?: string | null) {
  const serialized = serializePriceTiers(parsePriceTiers(raw));
  return serialized || null;
}

/** Tier terbesar yang qty-nya <= jumlah beli. Tier berlaku untuk pembelian >= qty. */
export function resolveUnitPrice(
  basePrice: number,
  tiers: PriceTier[],
  quantity: number,
) {
  const match = [...tiers]
    .sort((a, b) => a.qty - b.qty)
    .filter((tier) => tier.qty <= quantity)
    .at(-1);

  return match ? match.price : basePrice;
}

export function resolveOrderTotal(
  basePrice: number,
  tiers: PriceTier[],
  quantity: number,
) {
  const unitPrice = resolveUnitPrice(basePrice, tiers, quantity);
  return { unitPrice, subtotal: unitPrice * quantity };
}
