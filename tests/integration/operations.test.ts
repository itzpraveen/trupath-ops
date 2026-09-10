import { beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
const actor = vi.hoisted(() => ({id: "", role: "owner" as "owner" | "factory" | "inventory"}));
vi.mock("@/lib/auth", async () => {
  const {canEdit} = await import("@/lib/permissions");
  return {requireEditor: async (module: Parameters<typeof canEdit>[1]) => {if (!canEdit(actor.role, module)) throw new Error("Forbidden"); return actor;}, AuthError: Error};
});
vi.mock("next/cache", () => ({revalidatePath: vi.fn()}));
vi.mock("@/lib/stock-push", () => ({queueStockPush: vi.fn()}));
import { db } from "@/db";
import { boms, bomLines, materials, productionChecks, products, shopifyOrders, dispatches, shipmentReturns, shipmentReturnEvents, users } from "@/db/schema";
import { createProduction, inspectProduction, voidProduction } from "@/actions/factory";
import { createDispatch, setDispatchStatus, updateDispatch, verifyDispatch } from "@/actions/dispatch";
import { progressShipmentReturn, startShipmentReturn } from "@/actions/shipment-returns";
import { fulfilOrderInShopify } from "@/actions/shopify";
import { todayIST } from "@/lib/dates";
import { productionOrderOptions } from "@/lib/queries/production";
const date = todayIST();
const form = (data: Record<string, string | number | string[] | number[]>) => {const f = new FormData(); for (const [k,v] of Object.entries(data)) {if (Array.isArray(v)) v.forEach(x => f.append(`${k}[]`, String(x))); else f.set(k, String(v));} return f;};
const ok = (result: {ok?: boolean; error?: string} | null) => expect(result?.ok, result?.error).toBe(true);
const stock = async (id: string) => (await db.select().from(products).where(eq(products.id, id)))[0].stockQty;
const product = async (qty = 0) => (await db.insert(products).values({brandId: "babygambling", name: `Ops test ${randomUUID().slice(0,8)}`, stockQty: qty, shopifyVariantId: String(Date.now()) + randomUUID().slice(0,8)}).returning())[0];
const production = async (productId: string, qty: number, extra = {}) => {
  const result = await createProduction(null, form({productId, qty, workDate: date, note: "Materials recorded separately in the batch register", ...extra})); ok(result); return result!.id!;
};
const parcel = async (productId: string, qty: number) => {
  const fields = {brandId: "babygambling", entityId: "brand", customerName: "Ops test buyer", dispatchDate: date, productId: [productId], qty: [qty], amountP: "0"};
  const result = await createDispatch(null, form(fields)); ok(result); return {id: result!.id!, fields};
};
const pack = async (id: string) => {
  ok(await verifyDispatch(null, form({id, check: "quality", reference: "Inspected saleable pieces"})));
  ok(await verifyDispatch(null, form({id, check: "billing", reference: "External test invoice reviewed"})));
  ok(await setDispatchStatus(null, form({id, status: "packed"})));
};
const ship = async (id: string) => {await pack(id); ok(await setDispatchStatus(null, form({id, status: "shipped"})));};
beforeAll(async () => {actor.id = (await db.select().from(users).where(eq(users.role, "owner")))[0].id;});

describe("production, dispatch gates and physical returns", () => {
  it("consumes a recipe once, holds output until QC, and rejects stale or excessive inspections", async () => {
    const p = await product();
    const [m] = await db.insert(materials).values({code: randomUUID().slice(0,8), name: "QC test fabric", unit: "m", qty: 100, costP: 100}).returning();
    const [bom] = await db.insert(boms).values({productId: p.id}).returning();
    await db.insert(bomLines).values({bomId: bom.id, materialId: m.id, qtyPerUnit: 2});
    const id = await production(p.id, 5, {consumeMaterials: "on"});
    expect(await stock(p.id)).toBe(0);
    expect((await db.select().from(materials).where(eq(materials.id,m.id)))[0].qty).toBe(90);
    ok(await inspectProduction(null, form({id, revision: 0, acceptedQty: 2, rejectedQty: 1, note: "One seam rejected"})));
    expect(await stock(p.id)).toBe(2);
    expect((await inspectProduction(null, form({id, revision: 0, acceptedQty: 2, rejectedQty: 0, note: "Retry"})))?.error).toMatch(/already updated/);
    expect((await inspectProduction(null, form({id, revision: 1, acceptedQty: 3, rejectedQty: 0, note: "Too many"})))?.error).toMatch(/remaining/);
    const results = await Promise.all([1,2].map(() => inspectProduction(null, form({id, revision: 1, acceptedQty: 2, rejectedQty: 0, note: "Remaining pieces accepted"}))));
    expect(results.filter(r => r?.ok)).toHaveLength(1);
    expect(await stock(p.id)).toBe(4);
    expect(await db.select().from(productionChecks).where(eq(productionChecks.productionId,id))).toHaveLength(2);
    ok(await voidProduction(null, form({id, reason: "Test reversal"})));
    expect(await stock(p.id)).toBe(0);
    expect((await db.select().from(materials).where(eq(materials.id,m.id)))[0].qty).toBe(100);
  });

  it("requires a recipe or an explicit material note and enforces factory permissions", async () => {
    const p = await product();
    expect((await createProduction(null, form({productId:p.id, qty:1, workDate:date, consumeMaterials:"on"})))?.error).toMatch(/recipe/);
    expect((await createProduction(null, form({productId:p.id, qty:1, workDate:date})))?.error).toMatch(/note/);
    actor.role = "inventory";
    try {expect((await createProduction(null, form({productId:p.id, qty:1, workDate:date, note:"Test"})))?.error).toMatch(/Forbidden/);} finally {actor.role="owner";}
  });

  it("links order quantities, reopens rejected units, and serializes production against over-making", async () => {
    const p = await product(); const orderId = String(Date.now()); const lineId = `${orderId}1`;
    await db.insert(shopifyOrders).values({id: orderId, name:"Ops production order", orderNumber:1, brandId:"babygambling", entityId:"brand", createdAtShop:new Date(), updatedAtShop:new Date(), lineItems:[{id:lineId,title:p.name,variantId:p.shopifyVariantId,quantity:3,priceP:0,fulfilledQty:0,variantTitle:null,sku:null,productId:null,discountP:0}]});
    const result = await Promise.all([1,2].map(() => createProduction(null,form({productId:p.id, qty:3, workDate:date, shopifyOrderId:orderId, shopifyLineId:lineId, note:"Separate material register"}))));
    expect(result.filter(r => r?.ok)).toHaveLength(1); const id=result.find(r=>r?.ok)!.id!;
    expect((await productionOrderOptions(orderId))[0]).toMatchObject({remaining:0, awaitingQc:3});
    ok(await inspectProduction(null,form({id,revision:0,acceptedQty:2,rejectedQty:1,note:"One needs remaking"})));
    expect((await productionOrderOptions(orderId))[0]).toMatchObject({remaining:1,awaitingQc:0,accepted:2});
    await production(p.id,1,{shopifyOrderId:orderId,shopifyLineId:lineId});
    expect((await productionOrderOptions(orderId))[0]).toMatchObject({remaining:0,awaitingQc:1});
  });

  it("blocks packing and shipping before checks, clears checks on edits, and limits billing to accounts", async () => {
    const p = await product(5); const d = await parcel(p.id,2);
    expect((await setDispatchStatus(null,form({id:d.id,status:"shipped"})))?.error).toMatch(/Cannot move/);
    expect((await setDispatchStatus(null,form({id:d.id,status:"packed"})))?.error).toMatch(/QC and billing/);
    ok(await verifyDispatch(null,form({id:d.id,check:"quality",reference:"Checked"})));
    actor.role="inventory";
    try {expect((await verifyDispatch(null,form({id:d.id,check:"billing",reference:"Forged"})))?.error).toMatch(/Forbidden/);} finally {actor.role="owner";}
    ok(await verifyDispatch(null,form({id:d.id,check:"billing",reference:"Invoice checked"})));
    ok(await updateDispatch(null,form({...d.fields,id:d.id,qty:[3]})));
    const [updated] = await db.select().from(dispatches).where(eq(dispatches.id,d.id));
    expect(updated.qualityCheckedAt).toBeNull(); expect(updated.billingCheckedAt).toBeNull();
    await ship(d.id); expect(await stock(p.id)).toBe(2);
    expect((await setDispatchStatus(null,form({id:d.id,status:"cancelled"})))?.error).toMatch(/Cannot move/);
    expect((await setDispatchStatus(null,form({id:d.id,status:"returned"})))?.error).toMatch(/Cannot move/);
  });

  it("does not expose stock still awaiting QC or allow direct Shopify fulfillment to bypass the gates", async () => {
    const p = await product(); await production(p.id,2); const d=await parcel(p.id,1);
    expect((await verifyDispatch(null,form({id:d.id,check:"quality",reference:"Check"})))?.error).toMatch(/insufficient/);
    expect((await fulfilOrderInShopify(null,form({id:"12345"})))?.error).toMatch(/QC, billing, packing/);
  });

  it("tracks refusal, transit and receipt with no stock effect, then restores only inspected saleable goods once", async () => {
    const p=await product(10); const d=await parcel(p.id,4); await ship(d.id); expect(await stock(p.id)).toBe(6);
    ok(await startShipmentReturn(null,form({id:d.id,reason:"COD refused"})));
    ok(await startShipmentReturn(null,form({id:d.id,reason:"Repeated event"})));
    const [row] = await db.select().from(shipmentReturns).where(eq(shipmentReturns.dispatchId,d.id));
    expect(await db.select().from(shipmentReturnEvents).where(eq(shipmentReturnEvents.returnId,row.id))).toHaveLength(1);
    expect(await stock(p.id)).toBe(6);
    expect((await progressShipmentReturn(null,form({id:d.id,revision:0,stage:"inspected",note:"Too early"})))?.error).toMatch(/physical receipt/);
    ok(await progressShipmentReturn(null,form({id:d.id,revision:0,stage:"in_transit",note:"Courier bringing it back"})));
    expect((await progressShipmentReturn(null,form({id:d.id,revision:0,stage:"received",note:"Stale"})))?.error).toMatch(/already updated/);
    ok(await progressShipmentReturn(null,form({id:d.id,revision:1,stage:"received",note:"Three received; one missing",[`received:${p.id}`]:3})));
    expect(await stock(p.id)).toBe(6);
    expect((await progressShipmentReturn(null,form({id:d.id,revision:2,stage:"inspected",note:"Bad count",[`saleable:${p.id}`]:3,[`damaged:${p.id}`]:1})))?.error).toMatch(/total the received/);
    const results = await Promise.all([1,2].map(() => progressShipmentReturn(null,form({id:d.id,revision:2,stage:"inspected",note:"Two saleable, one damaged",[`saleable:${p.id}`]:2,[`damaged:${p.id}`]:1}))));
    expect(results.filter(r=>r?.ok)).toHaveLength(1); expect(await stock(p.id)).toBe(8);
    expect((await db.select().from(shipmentReturns).where(eq(shipmentReturns.id,row.id)))[0].lines[0]).toMatchObject({expectedQty:4,receivedQty:3,saleableQty:2,damagedQty:1});
    expect((await db.select().from(dispatches).where(eq(dispatches.id,d.id)))[0].status).toBe("returned");
  });
});
