# Business requirements and outstanding decisions — 9–10 September 2026

This register incorporates the owner's requirements response, the product workbook and GST clarification supplied on 10 September, and a review of source at `f099240`. It distinguishes owner-supplied business inputs, user-reported historical information, requested workflows, proposed assignments and decisions still awaiting confirmation. The current product rates supplied on 10 September are recorded below; historical payroll and earlier tax suggestions are not approved current configuration.

The requirements register does not change production data, staff identities, access, wages, stock, tax settings or invoice counters. The subsequent local implementation of production/QC, dispatch gates and physical returns is documented in [operations workflow](operations-workflow.md); it has not been deployed by this continuation. The release evidence dated 8 September records 11 staff; no new live census was performed for this document. See [invoicing readiness](invoicing-readiness.md) for the existing invoice capabilities and limits.

## Requirements register

Numbers correspond to the 28 questions sent to the owner.

| No. | Requirement and information received | Outstanding decision or delivery |
| --- | --- | --- |
| 1 | On 10 September the owner supplied `Stknew.edited.xlsx` with product names, HSN codes and purchase/sale prices, and the category GST rates recorded below. Feeding pillow has a separate reported cover/inner billing treatment. The local Products → Supplied catalogue screen now supports reviewed matching and applying these inputs. | Review matches against the current catalogue, confirm the effective date and resolve unmatched items and feeding-pillow component selling amounts. The application changes and migration 0013 still need release before applying these inputs in production. |
| 2 | The owner supplied 5% for cradle on 10 September. The historical 8 September order check recovered Shopify lines labelled CGST 5% and IGST 5% for Baby Cradle Bed Dreamy Night; its HSN was blank at that check. | Reconcile the affected source order against the supplied 5% rate and workbook HSN before issue. Recording this clarification does not correct Shopify, recheck a live order or alter an existing invoice. |
| 3 | No confirmed policy for GST-inclusive/exclusive website, retail or wholesale prices. | Owner/accounts confirms each channel. Current manual sale entry expects inclusive prices; Shopify imports its order-level price treatment. Any other entry mode requires implementation and validation. |
| 4 | Shipping tax and mixed-rate allocation remain unconfirmed. | Accountant supplies the treatment and allocation rule. Current invoice flow handles supported goods-linked delivery and blocks unsupported mixed classifications. |
| 5 | Latest B2C, B2B and CN numbers have not been recovered. | Obtain complete prefixes, financial year and latest actual issued documents from the issuing system; verify next unused counters. |
| 6 | Automatic numbering requested; cutover date and controlling system undecided. | Owner agrees the date and which system controls each series. Automatic allocation already exists but needs the verified starting configuration. |
| 7 | Baby Gambling is associated with TRUPATHS VENTURES LLP; Firstbon's legal seller is unconfirmed. | Owner confirms Firstbon's seller and books. Do not copy a GST registration between unconfirmed sellers. |
| 8 | Historical payroll lists HYCON VENTURES and employee IDs HYCON001–HYCON006 separately. This does not establish legal or GST identity. | Owner/accountant confirms the factory's legal structure, relationship to the app's factory books, and any separate registered name, address and GSTIN. |
| 9 | Separate brand logos, invoice contacts, bank details and series have not been agreed. | Owner supplies the desired brand identities and approves their relationship to the legal seller. |
| 10 | Historical payroll contains 12 people; the last verified app roster contains 11. On 9 September the owner confirmed Thahsy = Thahseen and Musammil = Musamil, and deferred Rishan for now. | Continue with the existing 11-person setup; use the confirmed aliases to avoid duplicates. Obtain login emails only for staff who need access. Rishan's status is not a prerequisite for this setup. |
| 11 | Staff brand assignments remain unconfirmed. | Owner assigns Baby Gambling, Firstbon or both to each login. Implement enforcement in server reads, writes, exports and file access; the current brand selector is a reporting filter. |
| 12 | Job titles are supplied but do not establish approved view/edit permissions. | Owner supplies the module access matrix. Existing login roles are Owner, Accounts, Factory and Inventory & dispatch. Additional responsibilities need appropriate permissions. |
| 13 | Invoice, refund, pricing, tax and stock-adjustment authorities remain unassigned. | Owner names the responsible roles and any approval steps. Existing module permissions must not be represented as this unapproved authority matrix. |
| 14 | Four daily dashboard scopes are proposed. The owner confirmed both identity mappings on 9 September. | Confirm the proposed dashboards and permissions below before assigning access or treating the proposals as implemented modules. Identity confirmation alone does not approve access. |
| 15 | Accounting start date and opening trial balance are unavailable. | Owner sets the date; accountant provides and approves the complete opening trial balance and supporting balances. |
| 16 | Dated opening raw-material, WIP and finished-goods quantities and valuations are unavailable. | Factory/accounts supplies the quantities, units, locations and costs at the agreed opening date. |
| 17 | The earlier instruction to use 10 is not a verified physical count. | Obtain a dated current count by variant/location, reconcile differences and record approved adjustments with an audit trail. |
| 18 | Delhivery One is the reported courier. PayU and Breeze were referenced in an earlier WooCommerce setup; present usage is unconfirmed. | Confirm current banks, cash accounts, gateways and COD services, plus unsettled opening balances and settlement references. Do not enable historical integrations by assumption. |
| 19 | No shared expense allocation rule was found. | Owner/accountant sets the rule for brand/factory costs. Current shared entries remain in All brands; brand net is not fully allocated profit. |
| 20 | Historical monthly salary amounts were supplied for 12 people; the owner has deferred Rishan. Current rates, joining dates, pay frequency and proration rules remain unconfirmed for the 11-person setup. | Confirm effective-dated pay terms for the current scope. Implement monthly salary handling if required; current attendance uses daily wages and half-day counts. Do not put monthly amounts into the daily-wage field or assume a daily divisor. |
| 21 | Reported materials include muslin, cotton-blend fabric, poly-cotton filling, foam, zips, mosquito nets and accessories. Per-product quantities and wastage are missing. | Factory supplies BOMs by product/variant with units, quantities, wastage and costs. Existing BOM consumption can use these once configured. |
| 22 | Requested workflow: orders → manufacturing → QC → billing verification → packing → dispatch. Only QC-accepted goods should proceed; production should reduce pending quantities and consume materials. | Implement order-linked production progress, QC acceptance/rejection and the billing/packing gates. Confirm job-work rates, named approvers and how rework/scrap affect quantities and material consumption. |
| 23 | Requested RTO visibility includes COD refusal → return in transit → received at factory. Historical policy requests mention future COD restriction after refusal and resend charges for customer-caused prepaid returns. | Implement return tracking and physical receipt/inspection. Owner confirms inspection, saleable/damaged treatment, refund authority, COD restriction and resend-charge rules before automation. Accountant confirms credit-note treatment. Shopify return/credit-note reconciliation remains a gap. |
| 24 | E-invoice applicability is unconfirmed; no IRP/GSP provider selected. | Accountant confirms applicability; connect the selected provider if needed and verify real IRN/signed QR responses before applicable B2B issue. Existing issuance guards remain relevant. |
| 25 | E-way bill and GST filing responsibility is undecided. | Owner/accountant decides whether to retain the existing workflow or commission integrations. Neither integration exists in the current app. |
| 26 | Complete Tally/Zoho-style accounting was requested, but retaining/replacing Tally is undecided. | Agree the accounting scope and system of record. Full replacement requires a separate accounting gap review and acceptance criteria; the current operations ledger is not evidence of accounting completeness. |
| 27 | Delhivery tracking and shipping-label printing/layout are reported requirements. Direct label generation and COD settlement reconciliation scope is undecided. | Confirm the current Delhivery service/account and integration scope. Arrange authorized connection when implementing it. Current courier/tracking fields and Shopify fulfillment writeback do not provide Delhivery event ingestion or label generation. |
| 28 | Operations, factory, accounts and accountant reviewers have been suggested, but not appointed. | Owner names acceptance participants and the go-live decision maker. Verify the full sale, production/QC, dispatch, receipt/payment and return flow, plus stock and opening-balance reconciliation. |

## Product and GST information supplied — 10 September 2026

Sources: the owner's `Stknew.edited.xlsx` workbook and subsequent GST/feeding-pillow clarification. These are owner-supplied inputs; this section records them without claiming an independent statutory classification review or a production import.

| Product or category as supplied | GST rate supplied |
| --- | --- |
| Baby bed | 5% |
| Holder | 5% |
| Blanket | 5% |
| Cradle | 5% |
| Carry nest | 5% |
| Clothings | 5% |
| Feeding pillow cover | 5% |
| Pillow plain white / feeding pillow inner | 18% |

The workbook supplies HSN codes 5811, 6304 and 6111 and purchase/sale prices, with some prices blank. It has no GST-rate column or indication whether prices include GST. Match its actual entries to existing product/variant IDs before applying these inputs. Do not infer a single rate from HSN 5811: the owner supplied a different rate for the plain white pillow. Unmatched categories/items remain unresolved rather than receiving a default 5% rate.

### Feeding pillow

- The owner corrected the product name to **feeding pillow**.
- The owner reports that the website sells it as one product at **18% GST**, while Tally bills two components: **feeding pillow cover at 5%** and **feeding pillow inner (plain white pillow) at 18%**.
- The component selling amounts, whether those amounts include GST, and their allocation for discounts have not been supplied. Standalone workbook prices are not an allocation of a bundled sale. Obtain one actual Tally example and the applicable allocation rule before configuring component billing.
- Current source imports each Shopify order item's tax lines and creates one invoice line for that item. The local update holds complete feeding pillows from invoicing until component amounts and billing support are supplied. It does not invent a split or replace the source order's recorded 18% tax. Standalone covers and plain white inners remain ordinary product lines.
- Reproducing the reported Tally treatment requires explicit component descriptions/HSNs, selling amounts and rates linked to the original Shopify line. Reconcile the component values and tax with the customer-paid total and the source order's tax; equal grand totals alone do not establish matching tax. Do not silently rewrite source tax or issued invoices.
- Billing components must remain linked to the sold product so that invoicing does not cause duplicate stock deductions or fulfillment. Returns and mixed-classification shipping also need to respect this mapping if the feature is implemented.

### Local application update

- Products → Supplied catalogue presents 74 workbook product rows with their HSN, supplied GST rate and reference prices. Row 54 (FLIP BED) is excluded as a possible section heading pending clarification. Basket GST remains unspecified.
- Operators choose a brand, review conservative name/variant suggestions or select the correct existing product, then apply selected matches. There is no automatic creation of missing products or fuzzy assignment of similar prints/components.
- Applying a reviewed match saves the source-row link, HSN and supplied GST rate with an audit trail. It preserves product identity, Shopify links and stock. Unknown GST remains unchanged rather than becoming zero. Competing links, repeated product selections and stale reviews are rejected atomically.
- Reference prices are shown to authenticated product readers. Purchase prices can be explicitly selected as product costs; manual selling prices can be selected when those amounts include GST. Both options start off. Missing prices are preserved, and Shopify selling prices are refreshed from Shopify.
- Locally saved or catalogue-applied HSN codes survive conflicting Shopify refreshes. Existing HSN codes are preserved by migration 0013 because their older provenance is unknown.
- The invoice path checks configured product GST against the aggregate Shopify line rate. Conflicts require source review without rewriting order taxes or using an invoice number. Existing issued invoices remain immutable and repeated issuance returns the existing document.

This implementation is local. No live product, stock, Shopify order, invoice or counter was changed, and no release was performed. The remaining component-price and billing decisions still apply.

Validation on 10 September: the production build, TypeScript, lint and diff checks passed; 66 unit tests and 49 PostgreSQL integration tests passed on a disposable database before release preparation. All 74 imported source names, HSN codes and reference-price values were checked against the workbook cells. Browser checks covered sign-in, brand selection, searching, a suggested match, keyboard selection of a manual match, HSN/GST application, optional cost application with the selling price preserved, and feeding-pillow notices. The stored Baby Gambling catalogue snapshot gave 35 unique suggestions and 39 unmatched entries; this is not a live Shopify census. Release preparation moved reference prices into private server configuration (`PRODUCT_CATALOGUE_PRICES_JSON`), leaving all price fields blank in the public source catalogue. They are served only to authenticated product readers. Integration tests use synthetic amounts.

## Proposed dashboards — pending owner confirmation

| Reported person | Proposed daily scope | Unresolved detail |
| --- | --- | --- |
| Thahsy / Thahseen | Orders, pending production, QC, dispatch deadlines and team updates | Same person confirmed by owner on 9 September. COO versus Operation Head designation and dashboard/access scope still need confirmation. |
| Shinas | Enquiries, follow-ups, order issues and content tasks | Confirm CRM/Content Creator responsibilities and permitted brands/actions. |
| Anusha | Advertising spend, campaign results, sales performance and marketing tasks | Confirm data sources, financial visibility and permitted brands/actions. |
| Musammil / Musamil | Design requests, deadlines, revisions and approvals | Same person confirmed by owner on 9 September. Design workflow/access still needs confirmation. |

These proposals do not grant access. Enquiry, content, campaign and design task workflows must be scoped before being promised as dashboard features.

## Staff and payroll reconciliation

- Treat the historical salary list as reference material pending current payroll confirmation. Exact salary amounts remain in the supplied source rather than being duplicated in this repository document.
- Owner confirmed on 9 September that Thahsy ↔ Thahseen and Musammil ↔ Musamil refer to the same respective people. Use these mappings when reconciling historical records; no additional staff records are needed for the alternate names. A preferred display-name change was not requested.
- Owner instructed on 9 September to ignore Rishan for the time being. Defer his historical record, salary and any login setup; continue with the existing 11-person scope. This does not establish that he has left employment and does not authorize deleting a record.
- Confirm each employee's employing business; historical HYCON codes alone do not establish the mapping to app accounting books.
- Monthly payroll needs a pay basis, effective dates, attendance/leave treatment, partial-month rules and payment schedule. The existing calculation is `daily wage × (present days + half days / 2)`.

## Source-verified development gaps at the initial review

The production/QC, dispatch gates and physical receipt items below describe the starting point at `f099240`. Their local implementation now exists; see [operations workflow](operations-workflow.md) for delivered behavior and remaining limits. The other decisions and gaps remain pending.

| Area | Current source evidence | Required outcome |
| --- | --- | --- |
| Production and QC | `src/actions/factory.ts:createProduction` records production, optionally consumes an active BOM and immediately adds finished stock. It has no separate QC acceptance event or link to an order's manufacturing requirement. | Separate work completed from QC-accepted, dispatchable goods; maintain order pending quantities and audited material effects. |
| Dispatch gates | `src/actions/dispatch.ts` permits pending → packed/shipped. It has no QC or billing-verification stage. | Packing/shipping respects the approved QC and billing workflow, including handling existing stock. |
| RTO and physical receipt | Dispatch states are pending, packed, shipped, delivered, returned and cancelled. The return/cancellation path can restore previously deducted stock; it does not distinguish a parcel coming back from one received and inspected. | Separate courier events, physical receipt, condition assessment and saleable restocking. Repeated events must not restore stock or post a refund twice. |
| Courier integration | Existing dispatch fields record courier/tracking and `src/lib/shopify-writeback.ts` sends fulfillment/tracking to Shopify. No Delhivery event ingestion was found in the reviewed source. | Receive and reconcile authorized Delhivery events, display RTO progress and implement the agreed label/settlement scope. |
| Payroll | `src/db/schema.ts` stores `employees.dailyWageP`; the attendance page derives pay from present/half days. | Support the confirmed pay basis without treating historical monthly salary as a daily wage. |
| Staff access | `src/lib/permissions.ts` implements four module-based roles. Brand reporting filters do not restrict a user's access to one brand. | Enforce the approved module/brand assignments throughout the application. |
| Website returns/accounting | The invoicing readiness review records that local credit notes block Shopify orders and statutory integrations are absent. | Reconcile courier returns, Shopify refunds, stock, customer/COD balances and any applicable credit note without duplicate effects. |

## Completion sequence and evidence

1. **Resolve invoicing prerequisites:** approved tax master and shipping treatment, seller identities, current series/cutover, applicability decision. Verify drafts against source orders, including the Cradle Bed tax discrepancy, before the first real invoice.
2. **Complete operations:** order-linked production, QC and billing gates, RTO progress, physical return receipt and inspection. Configure actual BOMs and stock, then test partial completion, rejection/rework and repeated courier events.
3. **Complete access and payroll:** use the confirmed identity mappings and 11-person scope, approve module/brand scopes and pay rules, then implement and test the relevant restrictions and calculations. A staff directory entry alone is not a login.
4. **Complete the agreed accounting/integration scope:** reconcile opening balances and current settlements; implement required IRP, courier and other selected connections. Define separate acceptance evidence for any full accounting replacement.
5. **Accept and release each implemented change:** focused automated validation plus named user workflow review, migration/backup planning where needed, deployment verification and reconciliation of affected data. Passing the earlier release's tests does not demonstrate that these newly identified workflows exist.

Business decisions marked pending above remain pending until answered. Preparing software and test workflows can proceed independently, but this register does not authorize guessing tax classifications, granting unapproved access, posting historical salaries/balances, automatically charging resend fees or enabling COD restrictions.
