import "server-only";
import { cache } from "react";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { bankAccounts, brands, categories, contacts, employees, entities, materials, products, type CategoryKind, type ContactType } from "@/db/schema";

export const getBrands = cache(() => db.select().from(brands).where(eq(brands.active, true)).orderBy(asc(brands.sortOrder), asc(brands.name)));
export const getEntities = cache(() => db.select().from(entities).orderBy(asc(entities.sortOrder)));
export async function entityExists(id: string) {
  return (await getEntities()).some((e) => e.id === id);
}
export async function entityName(id: string) {
  return (await getEntities()).find((e) => e.id === id)?.name ?? id;
}
export const getCategories = cache((kind: CategoryKind) =>
  db
    .select()
    .from(categories)
    .where(and(eq(categories.kind, kind), eq(categories.active, true)))
    .orderBy(asc(categories.sortOrder), asc(categories.name)),
);
export const getBankAccounts = cache(() => db.select().from(bankAccounts).where(eq(bankAccounts.active, true)).orderBy(asc(bankAccounts.entityId), asc(bankAccounts.name)));
export const getContacts = cache((type?: ContactType) =>
  db
    .select()
    .from(contacts)
    .where(type ? and(eq(contacts.active, true), eq(contacts.type, type)) : eq(contacts.active, true))
    .orderBy(asc(contacts.name)),
);
export const getMaterials = cache(() => db.select().from(materials).where(eq(materials.active, true)).orderBy(asc(materials.code)));
export const getEmployees = cache((activeOnly = true) =>
  activeOnly ? db.select().from(employees).where(eq(employees.active, true)).orderBy(asc(employees.code)) : db.select().from(employees).orderBy(asc(employees.active), asc(employees.code)),
);

import type { ProductOption } from "@/lib/constants";
export { ENTITY_LABEL, PAYMENT_METHODS, PAYMENT_METHOD_LABEL, type ProductOption } from "@/lib/constants";

export const getProductOptions = cache(
  (): Promise<ProductOption[]> =>
    db
      .select({ id: products.id, name: products.name, variant: products.variant, sku: products.sku, brandId: products.brandId, stockQty: products.stockQty, unit: products.unit, priceP: products.priceP })
      .from(products)
      .where(eq(products.active, true))
      .orderBy(asc(products.brandId), asc(products.name), asc(products.variant)),
);
