import { describe,expect,it } from "vitest";
import { computeInvoice } from "@/lib/invoice";
import { computeCreditNote, type CreditTotals } from "@/lib/credit-note";
const original=computeInvoice({sellerStateCode:"32",buyerStateCode:"32",lines:[{description:"Bedding",hsn:"9404",ratePct:18,qty:3,unit:"PCS",inclP:10001}],totalP:10000});
describe("credit note original tax allocations",()=>{
  it("returns every original paise across three separate returns",()=>{
    const notes: CreditTotals[]=[];
    for(let i=0;i<3;i++) notes.push(computeCreditNote(original,notes,[{originalLine:0,qty:1,restockQty:i===1 ? 0 : 1}]));
    for(const key of ["taxableP","cgstP","sgstP","igstP","roundOffP","totalP"] as const) expect(notes.reduce((n,p)=>n+p[key],0)).toBe(original[key]);
  });
  it("rejects over-returns, duplicate lines, and impossible saleable quantities",()=>{
    expect(()=>computeCreditNote(original,[],[{originalLine:0,qty:4,restockQty:0}])).toThrow(/quantities/);
    expect(()=>computeCreditNote(original,[],[{originalLine:0,qty:1,restockQty:2}])).toThrow(/quantities/);
    expect(()=>computeCreditNote(original,[],[{originalLine:0,qty:1,restockQty:1},{originalLine:0,qty:1,restockQty:0}])).toThrow(/only once/);
  });
});
