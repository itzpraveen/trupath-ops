import Image from "next/image";
import type { Invoice } from "@/db/schema";
import { formatDate } from "@/lib/dates";
import { stateName } from "@/lib/india";
import { amountInWords } from "@/lib/invoice";
const rs = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (paise: number) => rs.format(paise / 100);
const qtyFmt = (n: number) => (Number.isInteger(n) ? `${n}.00` : String(n));

type PrintableInvoice = Pick<Invoice, "cgstP" | "courier" | "customerAddress" | "customerEmail" | "customerGstin" | "customerName" | "customerPhone" | "customerStateCode" | "supplyStateCode" | "deliveryAddress" | "destination" | "dispatchNumber" | "igstP" | "issuedOn" | "lines" | "number" | "orderRef" | "paymentTerms" | "roundOffP" | "seller" | "sgstP" | "taxableP" | "totalP" | "trackingNo" | "voidReason" | "voidedAt">;
export function InvoiceDocument({ inv, draft = false, creditNote }: { inv: PrintableInvoice; draft?: boolean; creditNote?: { originalNumber: string; originalDate: string; reason: string } }) {
  const seller = inv.seller;
  const totalQty = inv.lines.reduce((s, l) => s + (l.unit ? l.qty : 0), 0);
  const unit = inv.lines.find((l) => l.unit)?.unit ?? "PCS";
  const cell = "border-r border-black px-1.5 py-1 last:border-r-0";
  const label = "text-[10px] text-gray-700";

  return (
    <div className="invoice-document relative text-[12px] leading-tight text-black">
      {inv.voidedAt ? <p className="pointer-events-none absolute inset-x-0 top-1/3 rotate-[-20deg] text-center text-6xl font-bold text-red-600/40">CANCELLED</p> : null}
      <p className="mb-1 text-center text-base font-bold">{creditNote ? (draft ? "DRAFT - NOT AN ISSUED CREDIT NOTE" : "Credit Note") : draft ? "DRAFT - NOT A TAX INVOICE" : "Tax Invoice"}</p>
      {creditNote ? <p className="mb-2 text-sm">Original invoice: {creditNote.originalNumber} dated {formatDate(creditNote.originalDate)}<br/>Reason: {creditNote.reason}</p> : null}
      <div className="border border-black">
        <div className="grid grid-cols-2">
          <div className="border-r border-black p-2">
            <div className="mb-1 flex items-start gap-2">{seller.gstin === "32AAWFT1571F1Z0" ? <Image src="/trupaths-logo.jpg" width={64} height={64} alt="Trupaths Ventures LLP" unoptimized /> : null}<p className="text-sm font-bold uppercase">{seller.legalName}</p></div>
            {seller.address ? <p className="whitespace-pre-line">{seller.address}</p> : null}
            <p>GSTIN/UIN: {seller.gstin}</p>
            <p>
              State Name : {stateName(seller.stateCode)}, Code : {seller.stateCode}
            </p>
            {seller.phone ? <p>Phone: {seller.phone}</p> : null}
            {seller.email ? <p>E-Mail: {seller.email}</p> : null}
          </div>
          <div className="grid grid-cols-2 text-[11px]">
            {(
              [
                [creditNote ? "Credit Note No." : "Invoice No.", inv.number, "Dated", formatDate(inv.issuedOn, "d-MMM-yy")],
                ["Delivery Note", inv.dispatchNumber ?? "", "Mode/Terms of Payment", inv.paymentTerms ?? ""],
                ["Reference No. & Date.", "", "Other References", ""],
                ["Buyer's Order No.", inv.orderRef ?? "", "Dated", ""],
                ["Dispatch Doc No.", inv.trackingNo ?? "", "Delivery Note Date", inv.dispatchNumber ? formatDate(inv.issuedOn, "d-MMM-yy") : ""],
                ["Dispatched through", inv.courier ?? "", "Destination", inv.destination ?? ""],
              ] as const
            ).map(([l1, v1, l2, v2]) => (
              <div key={l1} className="contents">
                <div className="border-b border-r border-black px-1.5 py-1">
                  <p className={label}>{l1}</p>
                  <p className="min-h-3.5 font-semibold">{v1}</p>
                </div>
                <div className="border-b border-black px-1.5 py-1">
                  <p className={label}>{l2}</p>
                  <p className="min-h-3.5 font-semibold">{v2}</p>
                </div>
              </div>
            ))}
            <div className="col-span-2 px-1.5 py-1">
              <p className={label}>Terms of Delivery</p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 border-t border-black">
          <div className="border-r border-black p-2">
            <p className={label}>Buyer (Bill to)</p>
            <p className="font-bold">{inv.customerName}</p>
            {inv.customerAddress ? <p className="whitespace-pre-line">{inv.customerAddress}</p> : null}
            {inv.customerPhone ? <p>Phone: {inv.customerPhone}</p> : null}
            {inv.customerEmail ? <p>Email address: {inv.customerEmail}</p> : null}
            {inv.customerGstin ? <p>GSTIN/UIN: {inv.customerGstin}</p> : null}
            <p>
              State Name : {stateName(inv.customerStateCode)}, Code : {inv.customerStateCode}
            </p>
          </div>
          <div className="p-2">
            <p className={label}>Place of supply</p>
            <p>{stateName(inv.supplyStateCode)}, Code: {inv.supplyStateCode}</p>
            {inv.deliveryAddress ? <><p className={`${label} mt-2`}>Deliver to</p><p className="whitespace-pre-line">{inv.deliveryAddress}</p></> : null}
          </div>
        </div>
        <table className="w-full border-collapse border-t border-black">
          <thead className="table-header-group">
            <tr className="border-b border-black text-[11px]">
              <th className={`${cell} w-8 text-left font-medium`}>Sl No.</th>
              <th className={`${cell} text-left font-medium`}>Description of Goods</th>
              <th className={`${cell} w-16 text-left font-medium`}>HSN/SAC</th>
              <th className={`${cell} w-12 text-right font-medium`}>GST Rate</th>
              <th className={`${cell} w-20 text-right font-medium`}>Quantity</th>
              <th className={`${cell} w-20 text-right font-medium`}>
                Rate
                <span className="block font-normal">(Incl. of Tax)</span>
              </th>
              <th className={`${cell} w-20 text-right font-medium`}>Rate</th>
              <th className={`${cell} w-10 text-left font-medium`}>per</th>
              <th className={`${cell} w-24 text-right font-medium`}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {inv.lines.map((l, i) => (
              <tr key={i} className="break-inside-avoid align-top">
                <td className={cell}>{i + 1}</td>
                <td className={`${cell} font-semibold uppercase`}>{l.description}</td>
                <td className={cell}>{l.hsn}</td>
                <td className={`${cell} text-right`}>{l.ratePct ? `${l.ratePct} %` : ""}</td>
                <td className={`${cell} text-right font-semibold`}>{l.unit ? `${qtyFmt(l.qty)} ${l.unit}` : ""}</td>
                <td className={`${cell} text-right`}>{l.unit ? money(l.unitInclP) : money(l.inclP)}</td>
                <td className={`${cell} text-right`}>{l.unit ? money(l.unitExclP) : money(l.taxableP)}</td>
                <td className={cell}>{l.unit}</td>
                <td className={`${cell} text-right font-semibold`}>{money(l.taxableP)}</td>
              </tr>
            ))}
            {[
              ["CGST", inv.cgstP],
              ["SGST", inv.sgstP],
              ["IGST", inv.igstP],
              ["Round Off", inv.roundOffP],
            ]
              .filter(([, v]) => Number(v) !== 0)
              .map(([name, v]) => (
                <tr key={String(name)}>
                  <td className={cell} />
                  <td className={`${cell} text-right italic font-semibold`}>{name}</td>
                  <td className={cell} />
                  <td className={cell} />
                  <td className={cell} />
                  <td className={cell} />
                  <td className={cell} />
                  <td className={cell} />
                  <td className={`${cell} text-right font-semibold`}>{money(Number(v))}</td>
                </tr>
              ))}
            <tr className="h-32">
              {Array.from({ length: 9 }).map((_, i) => (
                <td key={i} className={cell} />
              ))}
            </tr>
            <tr className="border-t border-black font-semibold">
              <td className={cell} />
              <td className={`${cell} text-right`}>Total</td>
              <td className={cell} />
              <td className={cell} />
              <td className={`${cell} text-right`}>{totalQty ? `${qtyFmt(totalQty)} ${unit}` : ""}</td>
              <td className={cell} />
              <td className={cell} />
              <td className={cell} />
              <td className={`${cell} text-right text-sm`}>₹ {money(inv.totalP)}</td>
            </tr>
          </tbody>
        </table>
        <div className="border-t border-black p-2">
          <div className="flex justify-between">
            <p className={label}>Amount Chargeable (in words)</p>
            <p className="text-[10px] italic">E. &amp; O.E</p>
          </div>
          <p className="font-bold">{amountInWords(inv.totalP)}</p>
          <p className="mt-1 text-[10px] text-gray-700">
            Taxable value {money(inv.taxableP)} · {inv.igstP ? `IGST ${money(inv.igstP)}` : `CGST ${money(inv.cgstP)} · SGST ${money(inv.sgstP)}`} · Tax amount {money(inv.cgstP + inv.sgstP + inv.igstP)}
          </p>
        </div>
        <div className="grid break-inside-avoid grid-cols-2 border-t border-black">
          <div className="p-2">
            <p className="text-[10px] underline">Declaration</p>
            <p className="text-[10px]">Reverse charge: No</p>
            <p className="text-[11px]">{creditNote ? "This credit note adjusts the goods and tax on the original invoice referenced above." : "We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct."}</p>
          </div>
          <div className="flex flex-col justify-between border-l border-black p-2 text-right">
            <p className="font-semibold uppercase">for {seller.legalName}</p>
            <p className="mt-8 text-[11px]">Authorised Signatory</p>
          </div>
        </div>
      </div>
      <p className="mt-1 text-center text-[10px]">{creditNote ? "This is a Computer Generated Credit Note" : "This is a Computer Generated Invoice"}</p>
      {inv.voidedAt ? <p className="no-print mt-2 text-center text-sm text-red-600">Cancelled: {inv.voidReason}</p> : null}
    </div>
  );
}
