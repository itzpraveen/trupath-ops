import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/* Shared column helpers                                               */
/* ------------------------------------------------------------------ */

export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

const id = () => uuid().defaultRandom().primaryKey();
const createdAt = () => timestamp({ withTimezone: true }).defaultNow().notNull();
const updatedAt = () =>
  timestamp({ withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date());
/** Money is stored as integer paise (₹1 = 100 paise). */
const money = () => bigint({ mode: "number" }).notNull().default(0);
/** Raw-material quantities (metres, kg, sheets) keep 3 decimals. */
const qty = () => numeric({ precision: 14, scale: 3, mode: "number" }).notNull().default(0);

export const ROLES = ["owner", "accounts", "factory", "inventory"] as const;
export type Role = (typeof ROLES)[number];

/* ------------------------------------------------------------------ */
/* Users & sessions                                                    */
/* ------------------------------------------------------------------ */

export const users = pgTable("users", {
  id: id(),
  name: text().notNull(),
  email: text().notNull().unique(),
  passwordHash: text().notNull(),
  role: text().$type<Role>().notNull().default("factory"),
  active: boolean().notNull().default(true),
  createdAt: createdAt(),
  lastLoginAt: timestamp({ withTimezone: true }),
});

export const sessions = pgTable(
  "sessions",
  {
    id: text().primaryKey(), // sha256 of the cookie token
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    userAgent: text(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/* ------------------------------------------------------------------ */
/* Organisation: books (entities), brands, contacts, categories        */
/* ------------------------------------------------------------------ */

/** A set of books. "brand" = Trupaths Ventures e-commerce, "factory" = separate factory books. */
export const entities = pgTable("entities", {
  id: text().primaryKey(),
  name: text().notNull(),
  legalName: text(),
  gstin: text(),
  address: text(),
  stateCode: text(),
  phone: text(),
  email: text(),
  sortOrder: integer().notNull().default(0),
});

export const brands = pgTable("brands", {
  id: text().primaryKey(),
  name: text().notNull(),
  active: boolean().notNull().default(true),
  sortOrder: integer().notNull().default(0),
});

export type ContactType = "customer" | "vendor" | "job_worker";
export const contacts = pgTable(
  "contacts",
  {
    id: id(),
    type: text().$type<ContactType>().notNull().default("customer"),
    name: text().notNull(),
    phone: text(),
    email: text(),
    gstin: text(),
    stateCode: text(),
    address: text(),
    notes: text(),
    shopifyCustomerId: text(),
    active: boolean().notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index("contacts_type_idx").on(t.type), index("contacts_name_idx").on(t.name)],
);

export type CategoryKind = "expense" | "channel" | "process" | "designation";
export const categories = pgTable(
  "categories",
  {
    id: id(),
    kind: text().$type<CategoryKind>().notNull(),
    name: text().notNull(),
    active: boolean().notNull().default(true),
    sortOrder: integer().notNull().default(0),
  },
  (t) => [uniqueIndex("categories_kind_name_idx").on(t.kind, t.name)],
);

export const settings = pgTable("settings", {
  key: text().primaryKey(),
  value: jsonb().$type<unknown>().notNull(),
  updatedAt: updatedAt(),
});

/* ------------------------------------------------------------------ */
/* Finished goods catalogue & stock                                    */
/* ------------------------------------------------------------------ */

export const products = pgTable(
  "products",
  {
    id: id(),
    brandId: text()
      .notNull()
      .references(() => brands.id),
    name: text().notNull(),
    variant: text().notNull().default(""),
    sku: text(),
    category: text(),
    shopifyProductId: text(),
    shopifyVariantId: text(),
    imageUrl: text(),
    priceP: money(),
    costP: money(),
    unit: text().notNull().default("pcs"),
    stockQty: integer().notNull().default(0),
    minStock: integer().notNull().default(0),
    shopifyQty: integer(),
    source: text().$type<"manual" | "shopify">().notNull().default("manual"),
    active: boolean().notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("products_shopify_variant_idx").on(t.shopifyVariantId),
    index("products_sku_idx").on(t.sku),
    index("products_brand_idx").on(t.brandId),
  ],
);

export type StockMovementKind =
  | "production_in"
  | "purchase_in"
  | "jobwork_in"
  | "return_in"
  | "sale_out"
  | "dispatch_out"
  | "adjustment"
  | "count";

export const stockMovements = pgTable(
  "stock_movements",
  {
    id: id(),
    productId: uuid()
      .notNull()
      .references(() => products.id),
    kind: text().$type<StockMovementKind>().notNull(),
    qty: integer().notNull(), // signed
    beforeQty: integer().notNull(),
    afterQty: integer().notNull(),
    refType: text(),
    refId: text(),
    note: text(),
    userId: uuid().references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("stock_movements_product_idx").on(t.productId, t.createdAt)],
);

/* ------------------------------------------------------------------ */
/* Factory: raw materials, BOMs, production                            */
/* ------------------------------------------------------------------ */

export const materials = pgTable("materials", {
  id: id(),
  code: text().notNull().unique(),
  name: text().notNull(),
  unit: text().notNull().default("metres"),
  qty: qty(),
  minQty: qty(),
  costP: money(), // cost per unit
  active: boolean().notNull().default(true),
  lastCountAt: timestamp({ withTimezone: true }),
  createdAt: createdAt(),
});

export type MaterialMovementKind =
  | "purchase"
  | "issue"
  | "return"
  | "jobwork_out"
  | "jobwork_in"
  | "adjustment"
  | "count";

export const materialMovements = pgTable(
  "material_movements",
  {
    id: id(),
    materialId: uuid()
      .notNull()
      .references(() => materials.id),
    kind: text().$type<MaterialMovementKind>().notNull(),
    qty: numeric({ precision: 14, scale: 3, mode: "number" }).notNull(), // signed
    beforeQty: numeric({ precision: 14, scale: 3, mode: "number" }).notNull(),
    afterQty: numeric({ precision: 14, scale: 3, mode: "number" }).notNull(),
    unitCostP: bigint({ mode: "number" }),
    refType: text(),
    refId: text(),
    note: text(),
    userId: uuid().references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("material_movements_material_idx").on(t.materialId, t.createdAt)],
);

export const boms = pgTable(
  "boms",
  {
    id: id(),
    productId: uuid()
      .notNull()
      .references(() => products.id),
    version: text().notNull().default("V1"),
    active: boolean().notNull().default(true),
    labourCostP: money(),
    note: text(),
    createdAt: createdAt(),
  },
  (t) => [index("boms_product_idx").on(t.productId)],
);

export const bomLines = pgTable("bom_lines", {
  id: id(),
  bomId: uuid()
    .notNull()
    .references(() => boms.id, { onDelete: "cascade" }),
  materialId: uuid()
    .notNull()
    .references(() => materials.id),
  qtyPerUnit: numeric({ precision: 14, scale: 3, mode: "number" }).notNull(),
  wastagePct: numeric({ precision: 6, scale: 2, mode: "number" }).notNull().default(0),
});

export const employees = pgTable("employees", {
  id: id(),
  code: text().notNull().unique(),
  name: text().notNull(),
  designation: text().notNull().default(""),
  phone: text(),
  joinedAt: date(),
  dailyWageP: money(),
  active: boolean().notNull().default(true),
  createdAt: createdAt(),
});

export const productionEntries = pgTable(
  "production_entries",
  {
    id: id(),
    number: text().notNull().unique(),
    workDate: date().notNull(),
    productId: uuid()
      .notNull()
      .references(() => products.id),
    brandId: text()
      .notNull()
      .references(() => brands.id),
    qty: integer().notNull(),
    bomId: uuid().references(() => boms.id),
    employeeId: uuid().references(() => employees.id),
    workerName: text(),
    materialCostP: money(),
    labourCostP: money(),
    note: text(),
    userId: uuid().references(() => users.id),
    createdAt: createdAt(),
    voidedAt: timestamp({ withTimezone: true }),
    voidReason: text(),
  },
  (t) => [index("production_date_idx").on(t.workDate)],
);

export type AttendanceStatus = "present" | "absent" | "half_day" | "leave" | "holiday";
export const attendance = pgTable(
  "attendance",
  {
    id: id(),
    employeeId: uuid()
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    workDate: date().notNull(),
    status: text().$type<AttendanceStatus>().notNull(),
    checkIn: text(),
    checkOut: text(),
    overtimeMin: integer().notNull().default(0),
    note: text(),
    userId: uuid().references(() => users.id),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("attendance_emp_date_idx").on(t.employeeId, t.workDate), index("attendance_date_idx").on(t.workDate)],
);

/* ------------------------------------------------------------------ */
/* Job work (outsourced processes)                                     */
/* ------------------------------------------------------------------ */

export type JobWorkStatus = "draft" | "sent" | "partial" | "received" | "closed" | "cancelled";
export const jobWorkOrders = pgTable(
  "job_work_orders",
  {
    id: id(),
    number: text().notNull().unique(),
    entityId: text()
      .notNull()
      .references(() => entities.id)
      .default("factory"),
    vendorId: uuid()
      .notNull()
      .references(() => contacts.id),
    workDate: date().notNull(),
    dueDate: date(),
    process: text().notNull().default("Stitching"),
    productId: uuid().references(() => products.id),
    description: text().notNull().default(""),
    orderedQty: integer().notNull().default(0),
    receivedQty: integer().notNull().default(0),
    rejectedQty: integer().notNull().default(0),
    ratePerUnitP: money(),
    taxBps: integer().notNull().default(0),
    status: text().$type<JobWorkStatus>().notNull().default("draft"),
    note: text(),
    billedAt: timestamp({ withTimezone: true }),
    billRecordId: uuid(),
    userId: uuid().references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("jobwork_vendor_idx").on(t.vendorId), index("jobwork_status_idx").on(t.status)],
);

export const jobWorkMaterials = pgTable("job_work_materials", {
  id: id(),
  orderId: uuid()
    .notNull()
    .references(() => jobWorkOrders.id, { onDelete: "cascade" }),
  materialId: uuid()
    .notNull()
    .references(() => materials.id),
  qtySent: numeric({ precision: 14, scale: 3, mode: "number" }).notNull().default(0),
  qtyReturned: numeric({ precision: 14, scale: 3, mode: "number" }).notNull().default(0),
});

export const jobWorkReceipts = pgTable("job_work_receipts", {
  id: id(),
  orderId: uuid()
    .notNull()
    .references(() => jobWorkOrders.id, { onDelete: "cascade" }),
  receiptDate: date().notNull(),
  acceptedQty: integer().notNull().default(0),
  rejectedQty: integer().notNull().default(0),
  note: text(),
  userId: uuid().references(() => users.id),
  createdAt: createdAt(),
});

/* ------------------------------------------------------------------ */
/* Money: business records (day book), bank accounts, payments         */
/* ------------------------------------------------------------------ */

export type RecordKind = "sale" | "expense" | "return" | "purchase";
export type PaymentMethod = "cash" | "bank" | "upi" | "card" | "cod" | "gateway" | "credit" | "other";

export const businessRecords = pgTable(
  "business_records",
  {
    id: id(),
    number: text(),
    entityId: text()
      .notNull()
      .references(() => entities.id),
    kind: text().$type<RecordKind>().notNull(),
    workDate: date().notNull(),
    amountP: money(),
    taxableP: bigint({ mode: "number" }),
    gstP: bigint({ mode: "number" }),
    channel: text().notNull().default("offline"),
    category: text().notNull().default(""),
    reference: text().notNull().default(""),
    contactId: uuid().references(() => contacts.id),
    paymentMethod: text().$type<PaymentMethod>().notNull().default("cash"),
    bankAccountId: uuid(),
    paymentTerms: text().$type<"paid" | "credit">().notNull().default("paid"),
    source: text().$type<"manual" | "shopify" | "jobwork" | "dispatch">().notNull().default("manual"),
    sourceRef: text().unique(), // idempotency key for synced records
    shopifyOrderId: text(),
    note: text(),
    userId: uuid().references(() => users.id),
    createdAt: createdAt(),
    voidedAt: timestamp({ withTimezone: true }),
    voidedBy: uuid(),
    voidReason: text(),
  },
  (t) => [
    index("records_entity_date_idx").on(t.entityId, t.workDate),
    index("records_kind_idx").on(t.kind),
    index("records_shopify_idx").on(t.shopifyOrderId),
  ],
);

export const bankAccounts = pgTable("bank_accounts", {
  id: id(),
  entityId: text()
    .notNull()
    .references(() => entities.id),
  name: text().notNull(),
  type: text().$type<"cash" | "bank" | "upi" | "wallet">().notNull().default("bank"),
  openingP: money(),
  active: boolean().notNull().default(true),
  createdAt: createdAt(),
});

export const payments = pgTable(
  "payments",
  {
    id: id(),
    number: text().notNull().unique(),
    entityId: text()
      .notNull()
      .references(() => entities.id),
    direction: text().$type<"in" | "out">().notNull(),
    workDate: date().notNull(),
    amountP: money(),
    contactId: uuid().references(() => contacts.id),
    bankAccountId: uuid().references(() => bankAccounts.id),
    method: text().$type<PaymentMethod>().notNull().default("bank"),
    reference: text().notNull().default(""),
    recordId: uuid().references(() => businessRecords.id),
    jobWorkOrderId: uuid().references(() => jobWorkOrders.id),
    note: text(),
    userId: uuid().references(() => users.id),
    createdAt: createdAt(),
    voidedAt: timestamp({ withTimezone: true }),
    voidReason: text(),
  },
  (t) => [index("payments_entity_date_idx").on(t.entityId, t.workDate), index("payments_contact_idx").on(t.contactId)],
);

/* ------------------------------------------------------------------ */
/* Shopify                                                             */
/* ------------------------------------------------------------------ */

export type ShopifyLine = {
  id: string;
  title: string;
  variantTitle: string | null;
  sku: string | null;
  variantId: string | null;
  productId: string | null;
  quantity: number;
  priceP: number;
  discountP: number;
};

export const shopifyOrders = pgTable(
  "shopify_orders",
  {
    id: text().primaryKey(), // numeric Shopify id as string
    name: text().notNull(), // "#1234"
    orderNumber: integer(),
    createdAtShop: timestamp({ withTimezone: true }).notNull(),
    updatedAtShop: timestamp({ withTimezone: true }).notNull(),
    financialStatus: text().notNull().default(""),
    fulfillmentStatus: text().notNull().default(""),
    customerName: text().notNull().default(""),
    email: text(),
    phone: text(),
    shippingAddress: jsonb().$type<Record<string, string | null>>(),
    city: text(),
    province: text(),
    totalP: money(),
    subtotalP: money(),
    discountP: money(),
    shippingP: money(),
    taxP: money(),
    refundedP: money(),
    currency: text().notNull().default("INR"),
    gateway: text(),
    tags: text().notNull().default(""),
    cancelledAt: timestamp({ withTimezone: true }),
    cancelReason: text(),
    closedAt: timestamp({ withTimezone: true }),
    lineItems: jsonb().$type<ShopifyLine[]>().notNull().default(sql`'[]'::jsonb`),
    shop: text(),
    brandId: text(),
    entityId: text(),
    stockDeducted: boolean().notNull().default(false),
    stockRestored: boolean().notNull().default(false),
    note: text(),
    syncedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("shopify_orders_created_idx").on(t.createdAtShop), index("shopify_orders_status_idx").on(t.financialStatus, t.fulfillmentStatus), index("shopify_orders_shop_idx").on(t.shop)],
);

/** One row per connected Shopify store. Secrets are encrypted with the app key. */
export const shopifyStores = pgTable("shopify_stores", {
  id: id(),
  shop: text().notNull().unique(), // e.g. jedtmv-0e.myshopify.com
  label: text().notNull(),
  brandId: text()
    .notNull()
    .references(() => brands.id),
  entityId: text()
    .notNull()
    .references(() => entities.id),
  channel: text().notNull().default("Own website"),
  clientId: text(),
  clientSecretEnc: text(),
  tokenEnc: text(),
  scope: text(),
  installedAt: timestamp({ withTimezone: true }),
  baselineAt: timestamp({ withTimezone: true }),
  webhooks: jsonb().$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  active: boolean().notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
export type ShopifyStore = typeof shopifyStores.$inferSelect;

export const syncRuns = pgTable("sync_runs", {
  id: id(),
  kind: text().notNull().default("shopify"),
  shop: text(),
  trigger: text().notNull().default("manual"),
  status: text().$type<"running" | "ok" | "error">().notNull().default("running"),
  startedAt: createdAt(),
  finishedAt: timestamp({ withTimezone: true }),
  ordersUpserted: integer().notNull().default(0),
  productsUpserted: integer().notNull().default(0),
  message: text(),
});

/* ------------------------------------------------------------------ */
/* Dispatch (offline / wholesale / Firstbon shipments)                  */
/* ------------------------------------------------------------------ */

export type DispatchStatus = "pending" | "packed" | "shipped" | "delivered" | "returned" | "cancelled";
export const dispatches = pgTable(
  "dispatches",
  {
    id: id(),
    number: text().notNull().unique(),
    brandId: text()
      .notNull()
      .references(() => brands.id),
    entityId: text()
      .notNull()
      .references(() => entities.id)
      .default("brand"),
    orderRef: text().notNull().default(""),
    shopifyOrderId: text(),
    contactId: uuid().references(() => contacts.id),
    customerName: text().notNull(),
    phone: text(),
    address: text(),
    dispatchDate: date().notNull(),
    status: text().$type<DispatchStatus>().notNull().default("pending"),
    courier: text(),
    trackingNo: text(),
    trackingUrl: text(),
    amountP: money(),
    note: text(),
    stockDeducted: boolean().notNull().default(false),
    shippedAt: timestamp({ withTimezone: true }),
    deliveredAt: timestamp({ withTimezone: true }),
    userId: uuid().references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("dispatches_status_idx").on(t.status), index("dispatches_date_idx").on(t.dispatchDate)],
);

export const dispatchItems = pgTable("dispatch_items", {
  id: id(),
  dispatchId: uuid()
    .notNull()
    .references(() => dispatches.id, { onDelete: "cascade" }),
  productId: uuid()
    .notNull()
    .references(() => products.id),
  qty: integer().notNull(),
});

export const uploads = pgTable(
  "uploads",
  {
    id: id(),
    kind: text().$type<"dispatch_photo" | "jobwork_file" | "expense_bill">().notNull(),
    refId: uuid().notNull(),
    fileName: text().notNull(),
    mime: text().notNull(),
    size: integer().notNull(),
    data: bytea().notNull(),
    userId: uuid().references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("uploads_ref_idx").on(t.kind, t.refId)],
);

/* ------------------------------------------------------------------ */
/* Numbering & audit                                                   */
/* ------------------------------------------------------------------ */

export const numberCounters = pgTable(
  "number_counters",
  {
    seriesKey: text().notNull(),
    periodKey: text().notNull(),
    next: integer().notNull().default(1),
  },
  (t) => [primaryKey({ columns: [t.seriesKey, t.periodKey] })],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    userId: uuid().references(() => users.id),
    action: text().notNull(),
    entityType: text().notNull(),
    entityId: text(),
    summary: text().notNull(),
    meta: jsonb().$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index("audit_created_idx").on(t.createdAt)],
);

/* ------------------------------------------------------------------ */
/* Relations                                                           */
/* ------------------------------------------------------------------ */

export const productsRelations = relations(products, ({ one, many }) => ({
  brand: one(brands, { fields: [products.brandId], references: [brands.id] }),
  movements: many(stockMovements),
  boms: many(boms),
}));
export const stockMovementsRelations = relations(stockMovements, ({ one }) => ({
  product: one(products, { fields: [stockMovements.productId], references: [products.id] }),
  user: one(users, { fields: [stockMovements.userId], references: [users.id] }),
}));
export const materialsRelations = relations(materials, ({ many }) => ({ movements: many(materialMovements) }));
export const materialMovementsRelations = relations(materialMovements, ({ one }) => ({
  material: one(materials, { fields: [materialMovements.materialId], references: [materials.id] }),
  user: one(users, { fields: [materialMovements.userId], references: [users.id] }),
}));
export const bomsRelations = relations(boms, ({ one, many }) => ({
  product: one(products, { fields: [boms.productId], references: [products.id] }),
  lines: many(bomLines),
}));
export const bomLinesRelations = relations(bomLines, ({ one }) => ({
  bom: one(boms, { fields: [bomLines.bomId], references: [boms.id] }),
  material: one(materials, { fields: [bomLines.materialId], references: [materials.id] }),
}));
export const productionRelations = relations(productionEntries, ({ one }) => ({
  product: one(products, { fields: [productionEntries.productId], references: [products.id] }),
  brand: one(brands, { fields: [productionEntries.brandId], references: [brands.id] }),
  employee: one(employees, { fields: [productionEntries.employeeId], references: [employees.id] }),
  user: one(users, { fields: [productionEntries.userId], references: [users.id] }),
}));
export const employeesRelations = relations(employees, ({ many }) => ({ attendance: many(attendance) }));
export const attendanceRelations = relations(attendance, ({ one }) => ({
  employee: one(employees, { fields: [attendance.employeeId], references: [employees.id] }),
}));
export const jobWorkRelations = relations(jobWorkOrders, ({ one, many }) => ({
  vendor: one(contacts, { fields: [jobWorkOrders.vendorId], references: [contacts.id] }),
  product: one(products, { fields: [jobWorkOrders.productId], references: [products.id] }),
  materials: many(jobWorkMaterials),
  receipts: many(jobWorkReceipts),
}));
export const jobWorkMaterialsRelations = relations(jobWorkMaterials, ({ one }) => ({
  order: one(jobWorkOrders, { fields: [jobWorkMaterials.orderId], references: [jobWorkOrders.id] }),
  material: one(materials, { fields: [jobWorkMaterials.materialId], references: [materials.id] }),
}));
export const jobWorkReceiptsRelations = relations(jobWorkReceipts, ({ one }) => ({
  order: one(jobWorkOrders, { fields: [jobWorkReceipts.orderId], references: [jobWorkOrders.id] }),
}));
export const businessRecordsRelations = relations(businessRecords, ({ one }) => ({
  entity: one(entities, { fields: [businessRecords.entityId], references: [entities.id] }),
  contact: one(contacts, { fields: [businessRecords.contactId], references: [contacts.id] }),
  user: one(users, { fields: [businessRecords.userId], references: [users.id] }),
}));
export const paymentsRelations = relations(payments, ({ one }) => ({
  entity: one(entities, { fields: [payments.entityId], references: [entities.id] }),
  contact: one(contacts, { fields: [payments.contactId], references: [contacts.id] }),
  bankAccount: one(bankAccounts, { fields: [payments.bankAccountId], references: [bankAccounts.id] }),
  record: one(businessRecords, { fields: [payments.recordId], references: [businessRecords.id] }),
}));
export const dispatchesRelations = relations(dispatches, ({ one, many }) => ({
  brand: one(brands, { fields: [dispatches.brandId], references: [brands.id] }),
  contact: one(contacts, { fields: [dispatches.contactId], references: [contacts.id] }),
  items: many(dispatchItems),
}));
export const dispatchItemsRelations = relations(dispatchItems, ({ one }) => ({
  dispatch: one(dispatches, { fields: [dispatchItems.dispatchId], references: [dispatches.id] }),
  product: one(products, { fields: [dispatchItems.productId], references: [products.id] }),
}));

/* ------------------------------------------------------------------ */
/* Row types                                                           */
/* ------------------------------------------------------------------ */
export type User = typeof users.$inferSelect;
export type SafeUser = Omit<User, "passwordHash">;
export type Product = typeof products.$inferSelect;
export type Material = typeof materials.$inferSelect;
export type Employee = typeof employees.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type BusinessRecord = typeof businessRecords.$inferSelect;
export type ShopifyOrder = typeof shopifyOrders.$inferSelect;
export type Dispatch = typeof dispatches.$inferSelect;
export type JobWorkOrder = typeof jobWorkOrders.$inferSelect;
export type ProductionEntry = typeof productionEntries.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type BankAccount = typeof bankAccounts.$inferSelect;
