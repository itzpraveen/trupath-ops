/** Client-safe constants and types shared by forms and server code. */
export const ENTITY_LABEL: Record<string, string> = { brand: "Trupaths Ventures", factory: "Factory" };
export const BRAND_LABEL: Record<string, string> = { babygambling: "Baby Gambling", firstbon: "Firstbon" };
export const PAYMENT_METHODS = [
  ["cash", "Cash"],
  ["upi", "UPI"],
  ["bank", "Bank transfer"],
  ["card", "Card"],
  ["cod", "Cash on delivery"],
  ["gateway", "Online payment (Razorpay etc.)"],
  ["credit", "On credit (pay later)"],
  ["other", "Other"],
] as const;
export const PAYMENT_METHOD_LABEL = Object.fromEntries(PAYMENT_METHODS) as Record<string, string>;
export type ProductOption = { id: string; name: string; variant: string; sku: string | null; brandId: string; stockQty: number; unit: string; priceP: number };
