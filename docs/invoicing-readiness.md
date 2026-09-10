# Invoicing and dashboard readiness — 8 September 2026

The application can create and print GST invoices for manual sales and supported Shopify orders, and credit notes for invoiced manual dispatch returns. The dashboard separates brands from accounting books and uses the existing login roles to control its contents. This checklist records the validated capabilities and remaining business setup; the live release identity is recorded in Render deployment history. It is not yet a replacement for all statutory accounting work.

The [9–10 September business requirements register](business-requirements.md) records the owner's subsequent response, payroll/identity reconciliation, additional QC, RTO and access gaps, and the product workbook/GST rates supplied on 10 September. Its pending decisions are not approved configuration, and recording the supplied rates does not import them into production.

The [local operations continuation](operations-workflow.md) adds production QC, packing/billing checks and return inspection. These source changes are separate from the live release evidence recorded here.

## Confirmed live setup

- Saved and reloaded the Trupaths Ventures company record: TRUPATHS VENTURES LLP, GSTIN 32AAWFT1571F1Z0, state 32, and the supplied registered address at 3/312, Gold Tower Building Road, Kottakkal PO, Kottakkal, Malappuram, Kerala – 676503.
- Preserved the other accounting books' seller details; the Trupaths registration was not reused for an unconfirmed seller.
- Saved and verified all 11 supplied staff records and job roles. Existing Hanan and Khadeeja records were updated without duplicates. Unknown wages and joining dates were left blank on new records.
- Staff directory records are not logins. No new live login access was granted; individual emails and access assignments are still needed.
- No live invoices, invoice counters, stock movements, opening balances or partner-capital postings were created by this work.

## Dashboard brands and roles

The old buttons selected accounting books: Trupaths Ventures, Trupaths Factory and Firstbon. Baby Gambling website sales belonged to the Trupaths Ventures books, which explains the inconsistent labels. The update adds a separate Brand selector containing All brands, Baby Gambling and Firstbon, while keeping Accounting books as a second filter for financial users.

Brand filtering covers dashboard sales, expenses, returns, channels, website orders, dispatch, finished stock, production and recent entries. Ledger, order, dispatch and stock links retain the brand, and new ledger entries inherit the selected brand. Source-linked sales, Shopify refunds and manual credit notes carry their source's brand. Migration 0011 backfills known source links; it deliberately does not infer a brand from the accounting book's name.

Shared/unassigned entries remain in All brands. Therefore the selected brand's net excludes unallocated overhead and must not be treated as a fully allocated brand profit. Attendance and raw materials remain shared factory information.

Owner and Accounts see financial summaries. Factory sees production, attendance and stock; Inventory & dispatch sees stock and dispatch without dashboard revenue totals. Both brands remain selectable within those existing module permissions. Per-user brand restrictions and additional login roles for COO, CRM or marketing are not implemented; the supplied job titles are directory designations only.

## Available invoicing workflow

- Manual sales: Sales & expenses → New sale / tax invoice → save agreed item prices → review draft → issue → print.
- Shopify: refresh the order → Review invoice → issue → print. Billing and delivery addresses are stored separately; delivery state determines the place of supply in this supported goods workflow.
- Issuing allocates a configured number only after validation. A changed preview must be reviewed again. Repeated or concurrent issue calls return the existing invoice.
- The invoice register retains issued and cancelled documents. Issued buyer, seller and tax details are immutable snapshots.
- Unshipped invoices can be cancelled by accounts with a reason; the number remains used. Shipped invoices cannot simply be cancelled.
- Manual dispatched returns: open original invoice → Record return / credit note → enter quantities received and saleable quantities → confirm GST adjustment eligibility → review → issue → print. Configure the CN series first.
- Credit notes retain the original invoice, allocate its original tax amounts without losing paise across partial returns, reduce the customer's balance and restore only the explicitly selected saleable stock. A separate register links both documents. Refund payments can be recorded for customers.

The supplied Tally example's arithmetic is supported: an item at ₹1,999 including 5% GST yields taxable value ₹1,903.81 plus ₹95.19 IGST. That sample rate/HSN is a test example, not accountant approval for the product master.

## Corrections made from the review

| Area | Result |
| --- | --- |
| Partial Shopify dispatch | Sends only the dispatch quantity, accounting for units already fulfilled; incomplete fulfillment data is rejected. |
| Dispatch and sale editing | Draft changes update the linked sale atomically. Issued invoices and allocated receipts prevent incompatible edits. Product/dispatch brands must agree. |
| Missing Shopify product | Stock effects roll back and remain retryable instead of being marked applied without a movement. |
| Numbering | Shared by GSTIN, series and financial year; configured starting numbers, forward-only counters, invoice/credit-note collision checks and one live invoice per source. |
| Discounts and GST | Allocated Shopify discounts reduce line value; large discrepancies cannot become round-off. Refunded orders require accounts review. |
| Delivery charges | Defaults to the goods' classification/rate and requires source-tax reconciliation. Mixed goods classifications require review. A separate service classification requires explicit configuration. |
| B2B e-invoices | Issuance is blocked while applicability is unconfirmed or required. A documented non-applicability review is required to enable the supported B2B flow. |
| Manual invoice accounting | Issuance creates or updates the linked sale and its taxable value and GST in the same transaction. |
| Returns | Manual credit-note issue, ledger credit, selected stock restoration and audit are atomic and protected against duplicate/concurrent submission. Original invoices remain unchanged. |
| Payments | Bank and bill references must belong to the selected books. Credit notes reduce amounts still collectible; customer credits/refunds are reflected in outstanding balances. COD remains unpaid. |
| Financial access | Factory contact lists omit financial balances. Factory and Inventory dashboards omit financial summaries. |
| Seller identity | Stored with the invoice so later company edits do not rewrite its printout. |
| Negative stock | Warns even when no reorder minimum is configured. Actual stock still needs reconciliation. |
| Financial-year exports | Uses the chosen date range. A ledger export exceeding 5,000 rows gives an explicit error instead of silently omitting rows. Brand filters also apply to ledger and order exports. |

## Required setup and remaining limits

The local 10 September update adds **Products → Supplied catalogue**, a reviewed HSN/GST import from the supplied workbook with optional reference-price application, source-row audit and Shopify HSN preservation. Migration `0013_product_catalogue_tax.sql` is required. Shopify/product GST conflicts and complete feeding pillows awaiting component amounts are held before new invoice issue. These changes have not been deployed; see the [local application update](business-requirements.md#local-application-update).

1. **Numbering:** supply current next unused B2C, B2B and CN numbers for FY 2026–27 and agree the cutoff in the existing accounting system. July's sample 611 is not a safe starting point. Keep one system responsible for each live series.
2. **Product tax master:** the owner supplied `Stknew.edited.xlsx` and category GST rates on 10 September: 5% for baby bed, holder, blanket, cradle, carry nest, clothings and feeding pillow cover; 18% for the plain white pillow/inner. The [product and GST clarification](business-requirements.md#product-and-gst-information-supplied--10-september-2026) records these inputs. Match them to product/variant IDs and resolve price tax-inclusion, effective date, unmatched items and delivery treatment before import. For feeding pillow, the reported website sale is one item at 18%, while Tally splits a 5% cover and 18% inner. Component selling amounts and source-tax reconciliation remain unresolved; current code does not expand a Shopify item into these components. The workbook and owner rates are not evidence of an independent statutory classification review. Earlier Chapter 63 ₹1,000 / 12% guidance remains superseded by Notification 9/2025-Integrated Tax (Rate), effective 22 September 2025, which uses a ₹2,500 threshold for the relevant made-up textile entries and revised schedules. [Official notification](https://courier.cbic.gov.in/ECCS/advisory/2025/NOTIFICATION%20NO.%209_2025-INTEGRATED%20TAX%20%28RATE%29%20-1759486719.pdf)
3. **E-invoice applicability and integration:** verify the supplied turnover statement and any applicable exemption with accounts. If the mandate applies, connect the chosen IRP provider for actual IRN and signed QR generation before B2B invoicing here. No IRNs or statutory QR codes are generated locally. [IRP mandate](https://einvoice6.gst.gov.in/content/einvoice-mandate/)
4. **Website returns:** Shopify refund and credit-note reconciliation remains in the existing accounting system. The local credit-note action blocks website orders to prevent duplicate refund/stock postings. Older invoices without saved product IDs cannot use local restocking. Commercial adjustments outside the supported GST adjustment window also remain an accounts task.
5. **E-way bills and filing:** e-way bill generation and GST return filing are not connected. Accounts must complete applicable documents through its current system.
6. **Opening balances:** provide verified opening quantities and values for raw materials, WIP and finished goods, plus the complete opening trial balance. The 300-unit minimum-stock sheet and ₹30 lakh partner contribution are not a complete opening stock valuation or balance sheet and were not posted.
7. **Staff access:** supply login emails and approved module/brand access for staff who need the app. Job designations do not grant permissions. Brand-only access restrictions require a separate implementation if requested.
8. **Release:** the 8 September release of `f099240` completed the production backup, migrations 0006–0011, deployment and live brand/dashboard checks; evidence is recorded in `output/releases/2026-09-08-release.json`. Invoice series and the other pending business inputs were not configured by that release. Further implementation requires its own validation and release evidence before use.

## Validation

- Production build, typecheck, lint and diff checks passed.
- 60 unit tests passed, including invoice arithmetic, fulfillment planning and proportional credit-note allocation.
- 28 PostgreSQL integration tests passed on a freshly migrated and seeded disposable database. Coverage includes counter concurrency, partial fulfillment, stock retry, delivery-state GST, delivery tax, B2B guards, COD, cancellation, atomic manual returns, refund balances and same-book brand separation.
- The complete browser suite passed 35 checks with no console errors. It exercised manual sale/invoice creation and cancellation, credit-note preview/issue/register, payments, factory and inventory permissions, mobile brand filtering and ledger entry defaults.
- Invoice and credit-note print output was exported, rendered and visually inspected as one A4 page each. Test documents use demonstration buyers/fixtures; no live statutory document was issued.
- Earlier upgrade testing from populated pre-snapshot invoice tables preserved available seller snapshots and merged legacy counters using the highest next number. Historical details never saved cannot be reconstructed.

Logs and screenshots: `/tmp/trupath-gst-followup/` (current acceptance), `/tmp/trupath-sales-fix/` (earlier invoice review). `output/pdf/trupath-invoice-preview.pdf` is the earlier draft with a placeholder address; it is not a current company-approved invoice template.
