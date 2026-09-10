import { and, asc, desc, eq, gte, isNull, lte } from "drizzle-orm";
import { db } from "@/db";
import { attendance, employees, materials, productionEntries, products, shopifyOrders } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { csvResponse, toCsv } from "@/lib/csv";
import { monthKey, monthRange } from "@/lib/dates";
import { toRupees } from "@/lib/money";
import { canView, type ModuleKey } from "@/lib/permissions";
import { listRecords } from "@/lib/queries/records";
import { pick, str } from "@/lib/url";

const MODULE_FOR: Record<string, ModuleKey> = { records: "sales", stock: "stock", materials: "materials", orders: "orders", production: "factory", attendance: "attendance" };

export async function GET(request: Request, ctx: RouteContext<"/api/export/[report]">) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in required", { status: 401 });
  const { report } = await ctx.params;
  const mod = MODULE_FOR[report];
  if (!mod) return new Response("Unknown report", { status: 404 });
  if (!canView(user.role, mod)) return new Response("Not allowed", { status: 403 });
  const sp = new URL(request.url).searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.get("month") ?? "") ? sp.get("month")! : monthKey();
  const [monthFrom, monthTo] = monthRange(month);
  const from = sp.get("from") ?? monthFrom, to = sp.get("to") ?? monthTo;
  const validDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
  if (!validDate(from) || !validDate(to) || from > to) return new Response("Choose a valid date range", { status: 400 });
  const periodLabel = sp.has("from") ? `${from}-to-${to}` : month;

  if (report === "records") {
    const { rows, total } = await listRecords({
      entity: str(sp.get("entity")) || "all",
      brand: str(sp.get("brand")) || "all",
      kind: pick(sp.get("kind"), ["all", "sale", "expense", "return", "purchase"], "all"),
      from,
      to,
      q: str(sp.get("q")),
      includeVoided: sp.get("voided") === "1",
      pageSize: 5000,
    });
    if (total > rows.length) return new Response("This export has more than 5000 entries. Choose a smaller date range to download every row.", { status: 400 });
    return csvResponse(
      `records-${periodLabel}.csv`,
      toCsv(
        rows.map(({ record: r, contactName, userName }) => ({
          date: r.workDate,
          number: r.number,
          type: r.kind,
          books: r.entityId,
          brand: r.brandId ?? "Shared / unassigned",
          amount: toRupees(r.amountP),
          channel: r.channel,
          category: r.category,
          reference: r.reference,
          contact: contactName ?? "",
          paid_via: r.paymentMethod,
          terms: r.paymentTerms,
          gst: r.gstP ? toRupees(r.gstP) : "",
          source: r.source,
          note: r.note ?? "",
          recorded_by: userName ?? "",
          voided: r.voidedAt ? "yes" : "",
          void_reason: r.voidReason ?? "",
        })),
      ),
    );
  }
  if (report === "stock") {
    const rows = await db.select().from(products).where(eq(products.active, true)).orderBy(asc(products.brandId), asc(products.name), asc(products.variant));
    return csvResponse(
      `stock.csv`,
      toCsv(rows.map((p) => ({ brand: p.brandId, product: p.name, variant: p.variant, sku: p.sku ?? "", in_stock: p.stockQty, minimum: p.minStock, shopify_qty: p.shopifyQty ?? "", price: toRupees(p.priceP), cost: toRupees(p.costP), value: toRupees(p.stockQty * p.costP) }))),
    );
  }
  if (report === "materials") {
    const rows = await db.select().from(materials).where(eq(materials.active, true)).orderBy(asc(materials.code));
    return csvResponse(`materials.csv`, toCsv(rows.map((m) => ({ code: m.code, material: m.name, unit: m.unit, in_stock: m.qty, minimum: m.minQty, unit_cost: toRupees(m.costP), value: toRupees(Math.round(m.qty * m.costP)) }))));
  }
  if (report === "orders") {
    const rows = await db.select().from(shopifyOrders).where(and(sp.get("brand") && sp.get("brand")!=="all" ? eq(shopifyOrders.brandId,sp.get("brand")!) : undefined, sp.get("store") && sp.get("store")!=="all" ? eq(shopifyOrders.shop,sp.get("store")!) : undefined)).orderBy(desc(shopifyOrders.createdAtShop)).limit(5000);
    return csvResponse(
      `website-orders.csv`,
      toCsv(
        rows.map((o) => ({ order: o.name, date: o.createdAtShop, customer: o.customerName, phone: o.phone ?? "", city: o.city ?? "", state: o.province ?? "", payment: o.financialStatus, fulfillment: o.fulfillmentStatus, total: toRupees(o.totalP), refunded: toRupees(o.refundedP), gateway: o.gateway ?? "", items: o.lineItems.map((l) => `${l.quantity} x ${l.title}${l.variantTitle ? ` (${l.variantTitle})` : ""}`).join("; "), cancelled: o.cancelledAt ? "yes" : "" })),
      ),
    );
  }
  if (report === "production") {
    const rows = await db
      .select({ e: productionEntries, name: products.name, variant: products.variant })
      .from(productionEntries)
      .innerJoin(products, eq(products.id, productionEntries.productId))
      .where(and(gte(productionEntries.workDate, from), lte(productionEntries.workDate, to), isNull(productionEntries.voidedAt)))
      .orderBy(asc(productionEntries.workDate));
    return csvResponse(`production-${periodLabel}.csv`, toCsv(rows.map(({ e, name, variant }) => ({ date: e.workDate, number: e.number, product: name, variant, brand: e.brandId, qty: e.qty, qc_accepted: e.acceptedQty, qc_rejected: e.rejectedQty, awaiting_qc: e.qty - e.acceptedQty - e.rejectedQty, order: e.shopifyOrderId ?? "", worker: e.workerName ?? "", material_cost: toRupees(e.materialCostP), note: e.note ?? "" }))));
  }
  if (report === "attendance") {
    const rows = await db
      .select({ a: attendance, code: employees.code, name: employees.name })
      .from(attendance)
      .innerJoin(employees, eq(employees.id, attendance.employeeId))
      .where(and(gte(attendance.workDate, from), lte(attendance.workDate, to)))
      .orderBy(asc(attendance.workDate), asc(employees.code));
    return csvResponse(`attendance-${periodLabel}.csv`, toCsv(rows.map(({ a, code, name }) => ({ date: a.workDate, code, name, status: a.status, check_in: a.checkIn ?? "", check_out: a.checkOut ?? "", overtime_min: a.overtimeMin, note: a.note ?? "" }))));
  }
  return new Response("Unknown report", { status: 404 });
}
