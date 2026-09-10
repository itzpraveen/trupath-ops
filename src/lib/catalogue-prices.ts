import "server-only";
import { z } from "zod";

const amount = z.number().int().min(0).max(2_147_483_647).nullable();
const pricesSchema = z.record(z.string(), z.object({ purchasePriceP: amount, salePriceP: amount }).strict());

export function parseCataloguePrices(raw: string | undefined, refs: string[]) {
  if (!raw) return {};
  try {
    const prices = pricesSchema.parse(JSON.parse(raw));
    if (Object.keys(prices).some((ref) => !refs.includes(ref))) throw new Error("Unknown row");
    return prices;
  } catch {
    // Never echo confidential prices or raw configuration in logs or browser errors.
    throw new Error("The private catalogue price configuration is invalid. Contact the administrator.");
  }
}
