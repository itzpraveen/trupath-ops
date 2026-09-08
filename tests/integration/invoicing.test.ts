import { beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
const actor = vi.hoisted(() => ({ id: "", role: "owner" }));
vi.mock("@/lib/auth", () => ({ requireEditor: async () => actor, getCurrentUser: async () => actor, AuthError: Error }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/stock-push", () => ({ queueStockPush: vi.fn() }));
import { db } from "@/db";
import { users, contacts, products, entities, businessRecords, dispatches, dispatchItems, invoices, shopifyStores, bankAccounts, creditNotes } from "@/db/schema";
import { createDispatch, updateDispatch, setDispatchStatus } from "@/actions/dispatch";
import { issueCreditNote } from "@/lib/credit-note-issue";
import { voidInvoice } from "@/actions/invoices";
import { voidRecord } from "@/actions/records";
import { createPayment } from "@/actions/payments";
import { issueInvoice, previewInvoice, invoiceFingerprint } from "@/lib/invoice-issue";
import { nextInvoiceNumber, peekInvoiceNumber, setNextInvoiceNumber } from "@/lib/numbering";
import { upsertOrderFromShopify } from "@/lib/shopify";
import { accountBalances, outstandingByContact } from "@/lib/queries/money";
import { gstSummary } from "@/lib/queries/reports";
import { totalsByKind } from "@/lib/queries/records";
import { channelSplit, dailySeries, dispatchCounts, recentRecords, ordersSummary } from "@/lib/queries/dashboard";
import { lowStockCount } from "@/lib/queries/dashboard";
import { todayIST } from "@/lib/dates";
import { encryptSecret, type StoreAuth } from "@/lib/shopify-oauth";
import { GET as exportReport } from "@/app/api/export/[report]/route";

const date = todayIST();
const run = randomUUID().slice(0, 8);
const book = `test-${run}`, sibling = `same-${run}`, other = `other-${run}`;
const form = (data: Record<string, string | number | string[] | number[] | undefined>) => { const f = new FormData(); for (const [k,v] of Object.entries(data)) if (v !== undefined) { if (Array.isArray(v)) v.forEach(x => f.append(k+"[]", String(x))); else f.set(k,String(v)); } return f; };
const auth: StoreAuth = {storeId: randomUUID(), shop: `test-${run}.myshopify.com`, label:"Test", token:"dummy", version:"2026-07", brandId:"babygambling", entityId:book, channel:"Test", baselineAt:new Date("2020-01-01"), scope:"write_merchant_managed_fulfillment_orders", pushInventory:false, locationId:null};
const money = (amount: string) => ({shopMoney:{amount, currencyCode:"INR"}});
let serial = Date.now();
const node = (): Parameters<typeof upsertOrderFromShopify>[0] => { const id = String(++serial); return {id:`gid://shopify/Order/${id}`, name:`#Test${id.slice(-7)}`, createdAt:date+"T01:00:00Z", updatedAt:date+"T02:00:00Z", processedAt:null, cancelledAt:null, cancelReason:null, closedAt:null, displayFinancialStatus:"PAID", displayFulfillmentStatus:"FULFILLED", tags:[], note:null, email:null, phone:null, paymentGatewayNames:["gateway"], taxesIncluded:true, shippingAddress:{name:"Test Buyer", address1:"Test address", address2:null, phone:null, zip:"600001", city:"Chennai", province:"Tamil Nadu", provinceCode:"TN", country:"India"}, billingAddress:null, totalPriceSet:money("1050"), subtotalPriceSet:money("1050"), totalDiscountsSet:money("0"), totalTaxSet:money("50"), totalShippingPriceSet:money("0"), totalRefundedSet:money("0"), refunds:[], lineItems:{nodes:[{id:`gid://shopify/LineItem/${id}8`,title:"Test Product",variantTitle:null,sku:null,quantity:1,currentQuantity:1,unfulfilledQuantity:0,taxLines:[{title:"IGST",ratePercentage:5,priceSet:money("50")}],variant:{id:`gid://shopify/ProductVariant/${id}9`}, product:null,originalUnitPriceSet:money("1050"),totalDiscountSet:money("0"),discountAllocations:[]}]}}; };
let customerId: string, productId: string;
beforeAll(async () => {
  // Stable fixtures consumed by the optional browser invoice journey in CI.
  await db.insert(entities).values({ id: "invoice-e2e", name: "Invoice browser test books", legalName: "Invoice Test Seller LLP", gstin: "32CCCCC1234C1Z1", stateCode: "32", address: "Test seller address, Kerala" }).onConflictDoNothing();
  await db.insert(contacts).values({ id: "7693d0c5-1948-4868-b46d-a3d9c6fe1a7c", name: "Invoice browser test customer", type: "customer", stateCode: "33", address: "Test delivery address, Tamil Nadu" }).onConflictDoNothing();
  await db.insert(products).values({ id: "787f27b7-98d8-4430-a73b-56fe5070c63b", brandId: "babygambling", name: "Invoice browser test product", priceP: 199900, gstRate: 5, hsnCode: "5811", stockQty: 10 }).onConflictDoNothing();
  if (await peekInvoiceNumber(db, "invoice-e2e", "B2C", date) === null) await db.transaction(tx => setNextInvoiceNumber(tx, "invoice-e2e", "B2C", date, 1));
  actor.id = (await db.select({id:users.id}).from(users).where(eq(users.role,"owner")).limit(1))[0].id;
  if (await peekInvoiceNumber(db, "invoice-e2e", "CN", date) === null) await db.transaction(tx => setNextInvoiceNumber(tx, "invoice-e2e", "CN", date, 1));
  const [returnFixture]=await db.insert(dispatches).values({number:`CREDIT-E2E-${run}`,brandId:"babygambling",entityId:"invoice-e2e",contactId:"7693d0c5-1948-4868-b46d-a3d9c6fe1a7c",customerName:`Credit note browser ${run}`,address:"Test address in Tamil Nadu",dispatchDate:date,amountP:399800,status:"shipped",stockDeducted:true,shippedAt:new Date()}).returning();
  await db.insert(dispatchItems).values({dispatchId:returnFixture.id,productId:"787f27b7-98d8-4430-a73b-56fe5070c63b",qty:2,unitPriceP:199900});
  await issueInvoice({source:"dispatch",id:returnFixture.id,userId:actor.id});
  const gstin = "32AAAAA1234A1Z1";
  await db.insert(entities).values([book,sibling].map((id) => ({id,name:"Test books",legalName:"Test Seller LLP",address:"Test registered address, Kerala",gstin,stateCode:"32"})));
  await db.insert(entities).values({id:other,name:"Other books",legalName:"Other Seller LLP",address:"Other registered address",gstin:"32BBBBB1234B1Z1",stateCode:"32"});
  await db.transaction(async tx => { await setNextInvoiceNumber(tx, book, "B2C", date, Math.max(611, (await peekInvoiceNumber(tx, book, "B2C", date)) ?? 1)); });
  customerId = (await db.insert(contacts).values({name:`Invoice test buyer ${run}`,type:"customer",stateCode:"33",address:"Test customer address, Tamil Nadu"}).returning())[0].id;
  productId = (await db.insert(products).values({brandId:"babygambling",name:`Invoice test cradle ${run}`,priceP:199900,gstRate:5,hsnCode:"5811",stockQty:100}).returning())[0].id;
});
const makeDispatch = async (entityId = book, amount="1999") => {
  const f = {brandId:"babygambling", entityId, customerName:"Test buyer",contactId:customerId,address:"Test buyer address",dispatchDate:date,amountP:amount,recordSale:"on",paymentMethod:"credit",productId:[productId],qty:[1],unitPrice:[amount]};
  const result = await createDispatch(null,form(f)); expect(result?.ok, JSON.stringify(result)).toBe(true); return {id:result!.id!, f};
};
const readInvoice = async (id: string) => (await db.select().from(invoices).where(eq(invoices.id,id)))[0];
const makeWeb = async () => { const n=node(); await db.insert(products).values({brandId:"babygambling",name:"Test web item",shopifyVariantId:n.lineItems.nodes[0].variant!.id.split("/").pop(),stockQty:10,hsnCode:"5811",gstRate:5}); await upsertOrderFromShopify(n,auth); return n; };

describe("invoice and accounting regression checks", () => {
  it("previews the sample arithmetic without consuming a number, then posts GST once", async () => {
    const d=await makeDispatch(); const next=await peekInvoiceNumber(db,book,"B2C",date); const before=await gstSummary(book,date,date);
    const draft=await previewInvoice({source:"dispatch",id:d.id});
    expect([draft.taxableP,draft.igstP,draft.totalP]).toEqual([190381,9519,199900]);
    expect(await peekInvoiceNumber(db,book,"B2C",date)).toBe(next);
    const issued=await issueInvoice({source:"dispatch",id:d.id,userId:actor.id});
    expect((await issueInvoice({source:"dispatch",id:d.id,userId:actor.id})).id).toBe(issued.id);
    expect((await gstSummary(book,date,date)).salesGst-before.salesGst).toBe(9519);
  });
  it("snapshots the seller even when the company address changes", async () => {
    const d=await makeDispatch(); const inv=await issueInvoice({source:"dispatch",id:d.id,userId:actor.id});
    await db.update(entities).set({address:"Changed company address"}).where(eq(entities.id,book));
    expect((await readInvoice(inv.id)).seller.address).toBe("Test registered address, Kerala");
  });
  it("shares one atomic number sequence across books using the same GSTIN", async () => {
    const a=await makeDispatch(), b=await makeDispatch(sibling);
    const result=await Promise.all([a,b].map(d=>issueInvoice({source:"dispatch",id:d.id,userId:actor.id})));
    const nums=result.map(i=>Number(i.number.split("/")[1])).sort((a,b)=>a-b);
    expect(nums[1]-nums[0]).toBe(1);
    await expect(db.transaction(tx=>setNextInvoiceNumber(tx,book,"B2C",date,1))).rejects.toThrow(/backwards/);
  });
  it("requires a confirmed starting number for a separate registration", async () => {
    await expect(db.transaction(tx=>nextInvoiceNumber(tx,other,"B2C",date))).rejects.toThrow(/Confirm the next/);
  });
  it("keeps cash on delivery unpaid until a receipt is recorded", async () => {
    const f = {brandId:"babygambling",entityId:book,customerName:"COD buyer",contactId:customerId,address:"Test address",dispatchDate:date,amountP:"1999",recordSale:"on",paymentMethod:"cod",productId:[productId],qty:[1],unitPrice:["1999"]};
    const d=await createDispatch(null,form(f)); expect(d?.ok).toBe(true);
    const draft=await previewInvoice({source:"dispatch",id:d!.id!}); expect(draft.paymentTerms).toBe("Credit");
    const [sale]=await db.select().from(businessRecords).where(eq(businessRecords.sourceRef,`dispatch:${d!.id}`)); expect(sale.paymentTerms).toBe("credit");
  });
  it("updates the linked sale when a draft dispatch changes amount and books", async () => {
    const d=await makeDispatch(); expect((await updateDispatch(null,form({...d.f,id:d.id,entityId:sibling,amountP:"2100",unitPrice:["2100"]})))?.ok).toBe(true);
    const [rec]=await db.select().from(businessRecords).where(eq(businessRecords.sourceRef,`dispatch:${d.id}`));
    expect([rec.amountP,rec.entityId]).toEqual([210000,sibling]);
  });
  it("blocks ordinary edits and ledger voiding once invoiced", async () => {
    const d=await makeDispatch(); const issued=await issueInvoice({source:"dispatch",id:d.id,userId:actor.id});
    expect((await updateDispatch(null,form({...d.f,id:d.id,amountP:"2100",unitPrice:["2100"]})))?.error).toMatch(/issued invoice/);
    expect((await voidRecord(null,form({id:(await readInvoice(issued.id)).recordId!,reason:"test"})))?.error).toMatch(/order or dispatch/);
  });
  it("requires invoice cancellation before cancelling the dispatch, and never reuses its number", async () => {
    const d=await makeDispatch(); const inv=await issueInvoice({source:"dispatch",id:d.id,userId:actor.id});
    expect((await setDispatchStatus(null,form({id:d.id,status:"cancelled"})))?.error).toMatch(/still issued/);
    expect((await voidInvoice(null,form({id:inv.id,reason:"Wrong buyer before shipping"})))?.ok).toBe(true);
    const replacement=await issueInvoice({source:"dispatch",id:d.id,userId:actor.id}); expect(replacement.number).not.toBe(inv.number);
    expect((await readInvoice(inv.id)).voidedAt).not.toBeNull();
  });
  it("does not allow shipped invoices to be cancelled without a credit note", async () => {
    const d=await makeDispatch(); const inv=await issueInvoice({source:"dispatch",id:d.id,userId:actor.id});
    expect((await setDispatchStatus(null,form({id:d.id,status:"shipped"})))?.ok).toBe(true);
    expect((await voidInvoice(null,form({id:inv.id,reason:"Return"})))?.error).toMatch(/credit note/);
  });
  it("retries a missing product without permanently losing stock movements", async () => {
    const n=node(); await expect(upsertOrderFromShopify(n,auth)).rejects.toThrow(/not mapped/);
    const [p]=await db.insert(products).values({brandId:"babygambling",name:"Late product",shopifyVariantId:n.lineItems.nodes[0].variant!.id.split("/").pop(),stockQty:10}).returning();
    await upsertOrderFromShopify(n,auth); await upsertOrderFromShopify(n,auth);
    expect((await db.select().from(products).where(eq(products.id,p.id)))[0].stockQty).toBe(9);
  });
  it("allocates order discounts before computing taxable value", async () => {
    const n=await makeWeb(); n.totalPriceSet=money("945"); n.totalDiscountsSet=money("105"); n.totalTaxSet=money("45"); n.lineItems.nodes[0].taxLines[0].priceSet=money("45"); n.lineItems.nodes[0].discountAllocations=[{allocatedAmountSet:money("105")}];
    await upsertOrderFromShopify(n,auth); const inv=await issueInvoice({source:"order",id:n.id.split("/").pop()!,userId:actor.id}); const i=await readInvoice(inv.id);
    expect([i.taxableP,i.igstP,i.roundOffP,i.totalP]).toEqual([90000,4500,0,94500]);
  });
  it("uses the delivery state for GST when billing and delivery states differ", async () => {
    const n=await makeWeb(); n.billingAddress={...n.shippingAddress!,province:"Kerala",provinceCode:"KL"}; await upsertOrderFromShopify(n,auth);
    const draft=await previewInvoice({source:"order",id:n.id.split("/").pop()!});
    expect([draft.customerStateCode,draft.supplyStateCode,draft.igstP,draft.cgstP]).toEqual(["32","33",5000,0]);
  });
  it("requires a fresh review when a sale changes after preview", async () => {
    const d=await makeDispatch(); const draft=await previewInvoice({source:"dispatch",id:d.id});
    await updateDispatch(null,form({...d.f,id:d.id,amountP:"2100",unitPrice:["2100"]}));
    await expect(issueInvoice({source:"dispatch",id:d.id,userId:actor.id,fingerprint:invoiceFingerprint(draft)})).rejects.toThrow(/changed after this preview/);
  });
  it("shipping supplied with goods uses the goods HSN and GST rate", async () => {
    const n=await makeWeb(); n.totalShippingPriceSet=money("105"); n.totalPriceSet=money("1155"); n.totalTaxSet=money("55"); await upsertOrderFromShopify(n,auth);
    const source = {source:"order" as const,id:n.id.split("/").pop()!};
    const draft=await previewInvoice(source); expect([draft.totalP,draft.igstP,draft.lines[1].hsn]).toEqual([115500,5500,"5811"]);
  });
  it("shipping one unit sends only one unit to Shopify and deducts stock once", async () => {
    const n=node(); n.displayFulfillmentStatus="UNFULFILLED"; n.totalPriceSet=money("2100"); n.totalTaxSet=money("100");
    const line=n.lineItems.nodes[0]; line.quantity=2; line.currentQuantity=2; line.unfulfilledQuantity=2; line.taxLines[0].priceSet=money("100");
    const variantId=line.variant!.id.split("/").pop()!;
    const [product]=await db.insert(products).values({brandId:"babygambling",name:"Partial parcel",shopifyVariantId:variantId,stockQty:10}).returning();
    await db.insert(shopifyStores).values({id:auth.storeId,shop:auth.shop,label:"Test only",brandId:auth.brandId,entityId:book,scope:auth.scope,tokenEnc:encryptSecret("dummy"),baselineAt:auth.baselineAt});
    await upsertOrderFromShopify(n,auth); const orderId=n.id.split("/").pop()!;
    const [d]=await db.insert(dispatches).values({number:`PARTIAL-${run}`,brandId:"babygambling",entityId:book,customerName:"Test",dispatchDate:date,shopifyOrderId:orderId}).returning();
    await db.insert(dispatchItems).values({dispatchId:d.id,productId:product.id,qty:1});
    let sent=0;
    vi.stubGlobal("fetch", async (_input: unknown, init?: RequestInit) => {
      const body=JSON.parse(String(init?.body)) as {query:string;variables:{fulfillment:{lineItemsByFulfillmentOrder:Array<{fulfillmentOrderLineItems:Array<{quantity:number}>}>}}};
      let data: unknown;
      if (body.query.includes("query FulfillmentOrders")) data={order:{fulfillmentOrders:{nodes:[{id:"fo",status:"OPEN",lineItems:{nodes:[{id:"li",remainingQuantity:2,totalQuantity:2,lineItem:{variant:line.variant}}]}}]}}};
      else if (body.query.includes("mutation Fulfil")) {sent=body.variables.fulfillment.lineItemsByFulfillmentOrder[0].fulfillmentOrderLineItems[0].quantity;data={fulfillmentCreate:{fulfillment:{id:"test",status:"SUCCESS"},userErrors:[]}};}
      else if (body.query.includes("query Order")) data={order:{...n,displayFulfillmentStatus:"PARTIALLY_FULFILLED",lineItems:{nodes:[{...line,unfulfilledQuantity:1}]}}};
      else throw new Error("Unexpected external request in test");
      return new Response(JSON.stringify({data}),{status:200,headers:{"content-type":"application/json"}});
    });
    try { const result=await setDispatchStatus(null,form({id:d.id,status:"shipped",fulfilShopify:"on"})); expect(result?.ok).toBe(true); expect(result?.message).not.toContain("was not updated"); } finally {vi.unstubAllGlobals();}
    expect(sent).toBe(1); expect((await db.select().from(products).where(eq(products.id,product.id)))[0].stockQty).toBe(9);
  });
  it("stops refunded orders from silently becoming altered original invoices", async () => {
    const n=await makeWeb(); n.totalRefundedSet=money("100"); await upsertOrderFromShopify(n,auth);
    await expect(issueInvoice({source:"order",id:n.id.split("/").pop()!,userId:actor.id})).rejects.toThrow(/accounts review/);
  });
  it("serializes invoice creation through both order and dispatch paths", async () => {
    const n=await makeWeb(); const orderId=n.id.split("/").pop()!;
    const [d]=await db.insert(dispatches).values({number:`TEST-${run}-${serial}`,brandId:"babygambling",entityId:book,customerName:"Test",dispatchDate:date,shopifyOrderId:orderId}).returning();
    const results=await Promise.all([issueInvoice({source:"order",id:orderId,userId:actor.id}),issueInvoice({source:"dispatch",id:d.id,userId:actor.id})]);
    expect(results[0].id).toBe(results[1].id);
  });
  it("never nets a payment in another book against this book's debt", async () => {
    const [c]=await db.insert(contacts).values({name:`Supplier ${run}`,type:"vendor"}).returning();
    await db.insert(businessRecords).values({entityId:book,kind:"expense",workDate:date,amountP:100000,paymentTerms:"credit",contactId:c.id});
    expect((await createPayment(null,form({entityId:other,direction:"out",workDate:date,amountP:"1000",contactId:c.id,method:"cash"})))?.ok).toBe(true);
    const balances=await outstandingByContact(); expect(balances.get(`${book}:${c.id}`)?.payable).toBe(100000); expect(balances.get(`${other}:${c.id}`)?.payable).toBe(-100000);
  });
  it("rejects a bank or bill belonging to different books", async () => {
    const [a]=await db.insert(bankAccounts).values({entityId:other,name:`Other bank ${run}`}).returning();
    expect((await createPayment(null,form({entityId:book,direction:"in",workDate:date,amountP:"1000",bankAccountId:a.id,method:"bank"})))?.error).toMatch(/belonging to these books/);
    const d=await makeDispatch(); const [r]=await db.select().from(businessRecords).where(eq(businessRecords.sourceRef,`dispatch:${d.id}`));
    expect((await createPayment(null,form({entityId:other,direction:"in",workDate:date,amountP:"1000",contactId:customerId,recordId:r.id,method:"cash"})))?.error).toMatch(/these books/);
    expect((await createPayment(null,form({entityId:book,direction:"in",workDate:date,amountP:"2000",contactId:customerId,recordId:r.id,method:"cash"})))?.error).toMatch(/exceeds/);
  });
  it("counts negative stock even when its minimum is zero", async () => {
    const before=await lowStockCount(); await db.insert(products).values({brandId:"babygambling",name:"Negative stock",stockQty:-1,minStock:0}); expect(await lowStockCount()).toBe(before+1);
  });
  it("exports the selected date range including rows outside the current month", async () => {
    const unique=`FY-EXPORT-${run}`; await db.insert(businessRecords).values([{entityId:book,kind:"sale",workDate:"2026-04-01",amountP:100,reference:unique+"-APR"},{entityId:book,kind:"sale",workDate:"2026-09-01",amountP:100,reference:unique+"-SEP"}]);
    const r=await exportReport(new Request(`http://localhost/api/export/records?entity=${book}&from=2026-04-01&to=2026-09-30`),{params:Promise.resolve({report:"records"})}); const csv=await r.text(); expect(csv).toContain(unique+"-APR"); expect(csv).toContain(unique+"-SEP");
  });
  it("rejects untaxed delivery where the taxable goods require GST", async () => {
    const n=await makeWeb(); n.totalShippingPriceSet=money("100"); n.totalPriceSet=money("1150"); await upsertOrderFromShopify(n,auth);
    await expect(previewInvoice({source:"order",id:n.id.split("/").pop()!})).rejects.toThrow(/tax and selling value/);
  });
  it("blocks B2B issue while e-invoice applicability is unresolved or IRP is required", async () => {
    const d=await makeDispatch();
    const [c]=await db.insert(contacts).values({name:"Registered buyer",type:"customer",stateCode:"33",gstin:"33AAAAA1234A1Z1",address:"Test registered address"}).returning();
    await db.update(dispatches).set({contactId:c.id}).where(eq(dispatches.id,d.id));
    await expect(issueInvoice({source:"dispatch",id:d.id,userId:actor.id})).rejects.toThrow(/Confirm e-invoice/);
    await db.update(entities).set({eInvoiceStatus:"required"}).where(eq(entities.id,book));
    await expect(issueInvoice({source:"dispatch",id:d.id,userId:actor.id})).rejects.toThrow(/IRN/);
    await db.update(entities).set({eInvoiceStatus:"unconfirmed"}).where(eq(entities.id,book));
  });
  it("posts partial credit once, restores only saleable units and retains the original invoice", async () => {
    await db.transaction(async tx=>setNextInvoiceNumber(tx,book,"CN",date,(await peekInvoiceNumber(tx,book,"CN",date)) ?? 1));
    const d=await makeDispatch(); await updateDispatch(null,form({...d.f,id:d.id,qty:[2],amountP:"3998"}));
    const inv=await issueInvoice({source:"dispatch",id:d.id,userId:actor.id});
    expect((await setDispatchStatus(null,form({id:d.id,status:"shipped"})))?.ok).toBe(true);
    const beforeStock=(await db.select().from(products).where(eq(products.id,productId)))[0].stockQty;
    const before=(await outstandingByContact(book)).get(`${book}:${customerId}`)!;
    const input={invoiceId:inv.id,requestId:randomUUID(),reason:"One returned item, inspected",selections:[{originalLine:0,qty:1,restockQty:1}],userId:actor.id,taxAdjustmentConfirmed:true,expectedCount:0};
    const first=await issueCreditNote(input); expect((await issueCreditNote(input)).id).toBe(first.id);
    expect((await outstandingByContact(book)).get(`${book}:${customerId}`)!.receivable).toBe(before.receivable-199900);
    expect((await db.select().from(products).where(eq(products.id,productId)))[0].stockQty).toBe(beforeStock+1);
    await expect(issueCreditNote({...input,requestId:randomUUID()})).rejects.toThrow(/Another credit note/);
    await issueCreditNote({...input,requestId:randomUUID(),expectedCount:1,selections:[{originalLine:0,qty:1,restockQty:0}],reason:"Second item damaged"});
    expect((await db.select().from(products).where(eq(products.id,productId)))[0].stockQty).toBe(beforeStock+1);
    expect((await db.select().from(dispatches).where(eq(dispatches.id,d.id)))[0].status).toBe("returned");
    expect((await readInvoice(inv.id)).voidedAt).toBeNull();
    expect((await voidInvoice(null,form({id:inv.id,reason:"Cannot cancel"})))?.error).toMatch(/credit note/);
    expect((await db.select().from(creditNotes).where(eq(creditNotes.invoiceId,inv.id))).reduce((n,c)=>n+c.totalP,0)).toBe(399800);
  });
  it("serializes competing returns and prevents receipts above the remaining invoice balance", async () => {
    const d=await makeDispatch(); const inv=await issueInvoice({source:"dispatch",id:d.id,userId:actor.id}); await setDispatchStatus(null,form({id:d.id,status:"shipped"}));
    const data={invoiceId:inv.id,reason:"Return",selections:[{originalLine:0,qty:1,restockQty:1}],userId:actor.id,taxAdjustmentConfirmed:true,expectedCount:0};
    const results=await Promise.allSettled([issueCreditNote({...data,requestId:randomUUID()}),issueCreditNote({...data,requestId:randomUUID()})]);
    expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
    expect((await createPayment(null,form({entityId:book,direction:"in",workDate:date,amountP:"1",contactId:customerId,method:"cash",recordId:(await readInvoice(inv.id)).recordId!})))?.error).toMatch(/exceeds/);
  });
  it("shows a refund due for a paid sale and clears it when the refund is recorded", async () => {
    const [c]=await db.insert(contacts).values({name:"Paid return buyer",type:"customer",stateCode:"33",address:"Test buyer address"}).returning();
    const r=await createDispatch(null,form({brandId:"babygambling",entityId:book,contactId:c.id,customerName:"Paid return buyer",address:"Test buyer address",dispatchDate:date,amountP:"1999",recordSale:"on",paymentMethod:"cash",productId:[productId],qty:[1],unitPrice:["1999"]}));
    expect(r?.ok,JSON.stringify(r)).toBe(true); const d={id:r!.id!};
    const inv=await issueInvoice({source:"dispatch",id:d.id,userId:actor.id}); await setDispatchStatus(null,form({id:d.id,status:"shipped"}));
    const note=await issueCreditNote({invoiceId:inv.id,requestId:randomUUID(),reason:"Paid return",selections:[{originalLine:0,qty:1,restockQty:1}],userId:actor.id,taxAdjustmentConfirmed:true,expectedCount:0});
    expect((await outstandingByContact(book)).get(`${book}:${c.id}`)!.payable).toBe(199900);
    const [cn]=await db.select().from(creditNotes).where(eq(creditNotes.id,note.id));
    expect((await createPayment(null,form({entityId:book,direction:"out",workDate:date,amountP:"1999",contactId:c.id,method:"cash",recordId:cn.recordId})))?.ok).toBe(true);
    expect((await outstandingByContact(book)).get(`${book}:${c.id}`)!.payable).toBe(0);
    await expect(accountBalances(book)).resolves.toBeInstanceOf(Array);
  });
  it("blocks website credit notes before a second refund or restock can be posted", async () => {
    const n=await makeWeb(), inv=await issueInvoice({source:"order",id:n.id.split("/").pop()!,userId:actor.id});
    await expect(issueCreditNote({invoiceId:inv.id,requestId:randomUUID(),reason:"Website refund",selections:[{originalLine:0,qty:1,restockQty:1}],userId:actor.id,taxAdjustmentConfirmed:true,expectedCount:0})).rejects.toThrow(/not connected yet/);
  });

  it("separates two brands within the same books and leaves shared costs unassigned", async () => {
    const scope=`scope-${run}`; await db.insert(entities).values({id:scope,name:"Brand scope test"});
    await db.insert(businessRecords).values([{entityId:scope,brandId:"babygambling",kind:"sale",workDate:date,amountP:100000,channel:"Direct"},{entityId:scope,brandId:"firstbon",kind:"sale",workDate:date,amountP:200000,channel:"Direct"},{entityId:scope,kind:"expense",workDate:date,amountP:50000}]);
    expect((await totalsByKind({entity:scope,brand:"babygambling",from:date,to:date})).sale.total).toBe(100000);
    expect((await totalsByKind({entity:scope,brand:"firstbon",from:date,to:date})).sale.total).toBe(200000);
    expect((await totalsByKind({entity:scope,brand:"babygambling",from:date,to:date})).expense.total).toBe(0);
    expect((await totalsByKind({entity:scope,brand:"unassigned",from:date,to:date})).expense.total).toBe(50000);
    expect(await recentRecords(8,scope,"babygambling")).toHaveLength(1);
    expect((await channelSplit(scope,date,date,"firstbon"))[0].total).toBe(200000);
    expect((await dailySeries(scope,date,date,"babygambling"))[0].sales).toBe(100000);
    await db.insert(dispatches).values(["babygambling","firstbon"].map(brandId=>({number:`SCOPE-${brandId}-${run}`,entityId:scope,brandId,customerName:"Test",dispatchDate:date,status:"pending" as const})));
    expect((await dispatchCounts(scope,"babygambling")).pending).toBe(1);
    const n=node(); await db.insert(products).values({brandId:"firstbon",name:"Firstbon scope item",shopifyVariantId:n.lineItems.nodes[0].variant!.id.split("/").pop(),stockQty:10});
    await upsertOrderFromShopify(n,{...auth,entityId:scope,brandId:"firstbon"});
    const [sourceSale]=await db.select().from(businessRecords).where(eq(businessRecords.sourceRef,`shopify:order:${n.id.split("/").pop()!}:sale`)); expect(sourceSale.brandId).toBe("firstbon");
    const start=new Date(date+"T00:00:00+05:30");
    expect((await ordersSummary(start,date,date,scope,"babygambling")).monthCount).toBe(0);
    expect((await ordersSummary(start,date,date,scope,"firstbon")).monthTotal).toBe(105000);
    const operational=await ordersSummary(start,date,date,scope,"firstbon",false); expect(operational.monthTotal).toBe(0); expect(operational.recent[0].totalP).toBe(0); expect(operational.monthCount).toBe(1);
  });

});
