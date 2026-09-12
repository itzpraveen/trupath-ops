import { chromium } from "playwright-core";
import fs from "node:fs";

// End-to-end smoke test against a running server. Needs Google Chrome and a freshly seeded database.
// Usage: pnpm build && PORT=3100 pnpm start &  then  pnpm test:e2e
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3100";
const CHROME = process.env.CHROME_PATH ?? "/usr/bin/google-chrome";
const OWNER_EMAIL = process.env.E2E_OWNER_EMAIL ?? "owner@trupaths.in";
const OWNER_PASSWORD = process.env.E2E_OWNER_PASSWORD ?? "change-me-now";
const OUT = process.argv[2] ?? "./e2e-shots";
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const RUN = Date.now().toString(36);
const pickOption = async (sel, text) => { const v = await sel.locator("option", { hasText: text }).first().getAttribute("value"); await sel.selectOption(v); };
const step = async (name, fn) => {
  if (process.env.E2E_DASHBOARD_ONLY === "1" && !/^(login|wrong password|brand dashboard)/.test(name)) return;
  if (process.env.E2E_INVOICE_ONLY === "1" && !/^(login|wrong password|manual sale|reviewed invoice|unshipped invoice|cancelled invoice|new sale|credit note|brand dashboard)/.test(name)) return;
  try { await fn(); results.push(`PASS ${name}`); }
  catch (e) { console.error(`Failure details for ${name}:`, e.message ?? e); results.push(`FAIL ${name}: ${String(e.message ?? e).split("\n")[0].slice(0, 300)}`); }
};

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200)); });
page.on("pageerror", (e) => consoleErrors.push("pageerror: " + String(e).slice(0, 200)));
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
const waitToast = async (text) => { await page.getByText(text, { exact: false }).first().waitFor({ timeout: 15000 }); };

await step("login page renders", async () => {
  await page.goto(`${BASE}/login`);
  await page.getByLabel("Email").waitFor();
  await shot("00-login");
});
await step("wrong password shows error", async () => {
  await page.getByLabel("Email").fill(OWNER_EMAIL);
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByText("Email or password is incorrect.").waitFor({ timeout: 15000 });
});
await step("login with seeded owner", async () => {
  await page.getByLabel("Email").fill(OWNER_EMAIL);
  await page.getByLabel("Password").fill(OWNER_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(`${BASE}/`, { timeout: 20000 });
  await page.getByRole("heading", { level: 1 }).waitFor();
  await shot("01-dashboard");
});
await step("add a sale from the ledger", async () => {
  await page.goto(`${BASE}/sales`);
  await page.getByRole("button", { name: "Add sale" }).first().click();
  const dlg = page.getByRole("dialog");
  await dlg.waitFor();
  await dlg.getByLabel(/^Amount \(₹\)/).fill("1999");
  await dlg.getByLabel(/Invoice \/ order no\./).fill("E2E-SALE-1");
  await shot("02-add-sale-dialog");
  await dlg.getByRole("button", { name: "Add sale" }).click();
  await waitToast("Sale recorded");
  await page.getByText("E2E-SALE-1").first().waitFor({ timeout: 15000 });
  await shot("03-sales");
});
await step("add an expense (factory books)", async () => {
  await page.getByRole("button", { name: "Add expense" }).first().click();
  const dlg = page.getByRole("dialog");
  await dlg.waitFor();
  await dlg.getByLabel("Books").selectOption("factory");
  await dlg.getByLabel(/^Amount \(₹\)/).fill("450.50");
  await dlg.getByLabel("Category").selectOption("Tea & snacks");
  await dlg.getByLabel(/GST in this bill/).fill("40.50");
  await dlg.getByLabel("Note").fill("E2E tea");
  await dlg.getByRole("button", { name: "Add expense" }).click();
  await waitToast("Expense recorded");
});
await step("void the sale with a reason", async () => {
  await page.goto(`${BASE}/sales`);
  const row = page.getByRole("row").filter({ hasText: "E2E-SALE-1" }).first();
  await row.getByRole("button", { name: "Void" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("Reason").fill("e2e test");
  await dlg.getByRole("button", { name: "Void entry" }).click();
  await waitToast("Record voided");
});
await step("record production for a Baby Gambling product", async () => {
  await page.goto(`${BASE}/factory`);
  await shot("04-factory-register");
  await page.getByRole("button", { name: "Record production" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.waitFor();
  await dlg.getByPlaceholder(/Search product/).fill("Nest Bed Sleepy Bear");
  await dlg.getByRole("listbox").getByRole("option").first().click();
  await dlg.getByLabel("Quantity made").fill("3");
  await dlg.getByLabel("Made by").selectOption({ index: 1 });
  await dlg.locator('input[name="consumeMaterials"]').uncheck();
  await dlg.getByLabel("Note", {exact:true}).fill("E2E material use recorded separately");
  await shot("05-production-dialog");
  await dlg.getByRole("button", { name: "Record production" }).click();
  await waitToast("recorded");
  await page.getByRole("row").filter({ hasText: "PROD/" }).first().waitFor({ timeout: 15000 });
});
await step("QC acceptance releases production into finished stock", async () => {
  const row = page.getByRole("row").filter({hasText:/Nest Bed.*Sleepy Bear/}).last();
  await row.getByRole("button", {name:"Inspect QC"}).click();
  const dlg=page.getByRole("dialog");
  await dlg.getByLabel("Accepted quantity").fill("3");
  await dlg.getByLabel("Inspection note").fill("All three checked and accepted");
  await dlg.getByRole("button", {name:"Save inspection"}).click();
  await waitToast("QC saved");
  await row.getByText("3 accepted").waitFor();
});
await step("mark attendance with one tap", async () => {
  const btn = page.getByRole("button", { name: /^Present for/ }).first();
  await btn.click();
  await page.waitForTimeout(1500);
  await page.reload();
  const state = await page.getByRole("button", { name: /^Present for/ }).first().getAttribute("data-on");
  if (state !== "true") throw new Error("attendance not persisted, data-on=" + state);
  await shot("06-factory-after");
});
await step("staff who left stay on this month's attendance sheet", async () => {
  await page.goto(`${BASE}/factory/employees`);
  const row = page.getByRole("row").filter({ hasText: "Hanan" }).first();
  await row.getByRole("button", { name: "Edit" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("Currently working here").uncheck();
  await dlg.getByRole("button", { name: "Save changes" }).click();
  await waitToast("Staff details saved");
  await page.goto(`${BASE}/factory/attendance`);
  const sheetRow = page.locator("tr").filter({ hasText: "Hanan" }).first();
  await sheetRow.waitFor();
  await sheetRow.getByText("(left)").waitFor();
});
await step("stock reflects production", async () => {
  await page.goto(`${BASE}/stock?q=Sleepy+Bear&instock=1`);
  await page.getByRole("row").filter({ hasText: "Nest Bed" }).first().waitFor();
  await shot("07-stock");
});
await step("raw material purchase posts an expense", async () => {
  await page.goto(`${BASE}/factory/materials`);
  const row = page.getByRole("row").filter({ hasText: "MULL" }).first();
  await row.getByRole("button", { name: "Purchase" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.waitFor();
  await dlg.getByLabel(/^Quantity/).fill("10");
  await dlg.getByLabel(/Cost per/).fill("35");
  await dlg.getByRole("button", { name: "Add to stock" }).click();
  await waitToast("Purchase saved");
  await shot("08-materials");
});
await step("create a recipe", async () => {
  await page.goto(`${BASE}/factory/boms/new`);
  await page.getByPlaceholder(/Search product/).fill("Baby Blanket Sleepy Bear");
  await page.getByRole("listbox").getByRole("option").first().click();
  await pickOption(page.locator('select[name="materialId[]"]').first(), "MULL");
  await page.locator('input[name="qtyPerUnit[]"]').first().fill("1.5");
  await shot("09-recipe");
  await page.getByRole("button", { name: "Create recipe" }).click();
  await page.waitForURL(`${BASE}/factory/boms`, { timeout: 20000 });
  await page.getByText("Baby Blanket Sleepy Bear").first().waitFor();
});
await step("plan a batch, check its materials and make part of it", async () => {
  await page.goto(`${BASE}/factory/plan`);
  await page.getByRole("button", { name: "Plan production" }).first().click();
  const dlg = page.getByRole("dialog");
  await dlg.waitFor();
  await dlg.getByPlaceholder(/Search product/).fill("Baby Blanket Sleepy Bear");
  await dlg.getByRole("listbox").getByRole("option").first().click();
  await dlg.getByLabel("Pieces to make").fill("2");
  await dlg.getByText("Enough in store").waitFor();
  await shot("09b-production-plan");
  await dlg.getByRole("button", { name: "Add to the plan" }).click();
  await waitToast("added to the plan");
  const planRow = page.getByRole("row").filter({ hasText: "Baby Blanket Sleepy Bear" }).first();
  await planRow.waitFor({ timeout: 15000 });

  await page.goto(`${BASE}/factory`);
  await page.getByRole("button", { name: "Record production" }).click();
  const rec = page.getByRole("dialog");
  await rec.waitFor();
  await pickOption(rec.locator("select#productionFor"), "Baby Blanket Sleepy Bear");
  await rec.getByLabel("Quantity made").fill("1");
  await rec.getByRole("button", { name: "Record production" }).click();
  await waitToast("Waiting for QC");
  await page.goto(`${BASE}/factory`);
  const planned = page.locator("li").filter({ hasText: "Baby Blanket Sleepy Bear" }).first();
  await planned.waitFor({ timeout: 15000 });
  const plannedText = (await planned.textContent()) ?? "";
  if (!plannedText.includes("1 to make")) throw new Error(`daily register did not show the remaining piece: ${plannedText}`);
});
await step("production with recipe consumes material", async () => {
  await page.goto(`${BASE}/factory`);
  await page.getByRole("button", { name: "Record production" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByPlaceholder(/Search product/).fill("Baby Blanket Sleepy Bear");
  await dlg.getByRole("listbox").getByRole("option").first().click();
  await dlg.getByLabel("Quantity made").fill("2");
  await dlg.getByRole("button", { name: "Record production" }).click();
  await waitToast("Materials used");
});
await step("a recipe that production used can still be deleted", async () => {
  await page.goto(`${BASE}/factory/boms`);
  const row = page.getByRole("row").filter({ hasText: "Baby Blanket Sleepy Bear" }).first();
  await row.getByRole("button", { name: "Delete" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByRole("button", { name: "Delete" }).click();
  await waitToast("Recipe deleted");
});
await step("attach a bill photo to the expense", async () => {
  await page.goto(`${BASE}/sales?kind=expense`);
  const row = page.getByRole("row").filter({ hasText: "E2E tea" }).first();
  await row.getByRole("button", { name: /^Attachments for/ }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByText("Files for").waitFor();
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  await dlg.locator('input[type="file"]').setInputFiles({ name: "bill.png", mimeType: "image/png", buffer: png });
  await waitToast("File added");
  await dlg.locator("img[alt='bill.png']").waitFor({ timeout: 15000 });
  await page.keyboard.press("Escape");
});
await step("create and ship a dispatch", async () => {
  await page.goto(`${BASE}/dispatch/new`);
  await page.getByPlaceholder(/Search product/).first().fill("Nest Bed Sleepy Bear");
  await page.getByRole("listbox").getByRole("option").first().click();
  await page.locator('input[name="qty[]"]').first().fill("1");
  await page.getByLabel("Customer name").fill("E2E Customer");
  await page.getByLabel("Phone").fill("9999999999");
  await page.getByLabel("Address").fill("Angamaly, Ernakulam, Kerala");
  await page.getByLabel("Order value (₹)").fill("3999");
  await shot("10-dispatch-new");
  await page.getByRole("button", { name: "Create dispatch" }).click();
  await page.waitForURL(/\/dispatch\/[0-9a-f-]{36}$/, { timeout: 20000 });
  for (const [trigger,confirm] of [["Verify QC","Confirm QC"],["Verify billing","Confirm billing"]]) {
    await page.getByRole("button", {name:trigger}).click();
    const check=page.getByRole("dialog");
    await check.getByLabel("Check note / billing reference").fill("E2E external invoice and goods verified");
    await check.getByRole("button", {name:confirm}).click();
    await check.waitFor({state:"hidden"});
  }
  await page.getByRole("button", {name:"Mark packed"}).click();
  await page.getByRole("dialog").getByRole("button", {name:"Mark packed"}).click();
  await page.getByRole("dialog").waitFor({state:"hidden"});
  await page.getByRole("button", { name: "Mark shipped" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("Courier").fill("DTDC");
  await dlg.getByLabel("Tracking no.").fill("E2E123");
  await dlg.getByRole("button", { name: "Mark shipped" }).click();
  await waitToast("marked shipped");
  await shot("11-dispatch-detail");
});
await step("return parcel receipt and inspection work on a phone", async () => {
  await page.setViewportSize({width:390,height:844});
  await page.getByRole("button",{name:"Start return / RTO"}).click();
  let dlg=page.getByRole("dialog");
  await dlg.getByLabel("Reason").fill("Customer refused COD parcel");
  await dlg.getByRole("button",{name:"Start return",exact:true}).click();
  await dlg.waitFor({state:"hidden"});
  await page.getByRole("button",{name:"Mark return in transit"}).click();
  dlg=page.getByRole("dialog");
  await dlg.getByLabel("Return note").fill("Courier returning parcel");
  await dlg.getByRole("button",{name:"Save return update"}).click();
  await dlg.waitFor({state:"hidden"});
  await page.getByRole("button",{name:"Receive returned parcel"}).click();
  dlg=page.getByRole("dialog");
  await dlg.getByLabel(/^Received ·/).fill("1");
  await dlg.getByLabel("Return note").fill("One unit physically received");
  await dlg.getByRole("button",{name:"Save return update"}).click();
  await dlg.waitFor({state:"hidden"});
  await page.getByRole("button",{name:"Inspect returned goods"}).click();
  dlg=page.getByRole("dialog");
  await dlg.getByLabel(/^Saleable ·/).fill("1");
  await dlg.getByLabel(/^Damaged ·/).fill("0");
  await dlg.getByLabel("Return note").fill("Saleable after inspection");
  await shot("11a-return-inspection-mobile");
  await dlg.getByRole("button",{name:"Complete inspection"}).click();
  await dlg.waitFor({state:"hidden"});
  await page.getByText("Inspection complete",{exact:true}).waitFor();
  if (await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)) throw new Error("Return page overflows on mobile");
  await shot("11b-return-complete-mobile");
  await page.setViewportSize({width:1440,height:1000});
});
await step("job work order with materials", async () => {
  await page.goto(`${BASE}/contacts`);
  await page.getByRole("button", { name: "Add contact" }).click();
  let dlg = page.getByRole("dialog");
  await dlg.getByLabel("Type").selectOption("job_worker");
  await dlg.getByLabel("Name").fill(`E2E Stitching Unit ${RUN}`);
  await dlg.getByRole("button", { name: "Add contact" }).click();
  await waitToast("added");
  await page.goto(`${BASE}/jobwork/new`);
  await pickOption(page.getByLabel("Job worker"), `E2E Stitching Unit ${RUN}`);
  await page.getByLabel("Quantity ordered").fill("5");
  await page.getByLabel("Rate per piece (₹)").fill("120");
  await pickOption(page.locator('select[name="materialId[]"]').first(), "LACE");
  await page.locator('input[name="qtySent[]"]').first().fill("12.5");
  await page.getByRole("button", { name: "Create order" }).click();
  await page.waitForURL(/\/jobwork\/[0-9a-f-]{36}$/, { timeout: 20000 });
  // pieces come back in two batches and each batch is billed on its own
  await page.getByRole("button", { name: "Receive pieces" }).click();
  dlg = page.getByRole("dialog");
  await dlg.getByLabel("Accepted").fill("3");
  await dlg.getByRole("button", { name: "Record receipt" }).click();
  await waitToast("Receipt recorded");
  await page.getByRole("button", { name: "Record bill", exact: true }).click();
  dlg = page.getByRole("dialog");
  await dlg.getByRole("button", { name: "Record bill" }).click();
  await waitToast("Bill of ₹360");
  await page.getByText("3 of 3 pcs billed").waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: "Receive pieces" }).click();
  dlg = page.getByRole("dialog");
  await dlg.getByLabel("Accepted").fill("2");
  await dlg.getByRole("button", { name: "Record receipt" }).click();
  await page.getByText("2 accepted pieces not billed yet").waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: "Record next bill" }).click();
  dlg = page.getByRole("dialog");
  await dlg.getByRole("button", { name: "Record bill" }).click();
  await waitToast("Bill of ₹240");
  await page.getByText("5 of 5 pcs billed").waitFor({ timeout: 15000 });
  await shot("12-jobwork-detail");
});
await step("payments and payables", async () => {
  await page.goto(`${BASE}/payments?tab=payables`);
  const row = page.getByRole("row").filter({ hasText: `E2E Stitching Unit ${RUN}` }).first();
  await row.waitFor();
  await row.getByText("₹600").waitFor();
  await shot("13-payables");
});
await step("reports render", async () => {
  await page.goto(`${BASE}/reports`);
  await page.getByText("Profit summary").waitFor();
  await page.getByText("Output GST (other sales)").waitFor();
  await page.getByText("₹40.50").first().waitFor();
  await shot("14-reports");
});
await step("settings: add a login", async () => {
  await page.goto(`${BASE}/settings/users`);
  await page.getByRole("button", { name: "Add login" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("Name").fill("Factory Manager");
  await dlg.getByLabel("Email").fill(`factory-${RUN}@trupaths.in`);
  await dlg.getByLabel("Password").fill("factory-pass-123");
  await dlg.getByLabel("Role").selectOption("factory");
  await dlg.getByRole("button", { name: "Create login" }).click();
  await waitToast("can now sign in");
  await page.getByRole("button", {name:"Add login",exact:true}).click();
  await page.getByRole("dialog").getByLabel("Name").fill("Inventory Test");
  await page.getByRole("dialog").getByLabel("Email").fill(`inventory-${RUN}@trupaths.in`);
  await page.getByRole("dialog").getByLabel("Password").fill("inventory-pass-123");
  await page.getByRole("dialog").getByLabel("Role").selectOption("inventory");
  await page.getByRole("dialog").getByRole("button", {name:"Create login",exact:true}).click();
  await page.getByRole("dialog").waitFor({state:"hidden"});
  await shot("15-settings-users");
});
await step("owner can save their own login", async () => {
  await page.goto(`${BASE}/settings/users`);
  const row = page.getByRole("row").filter({ hasText: OWNER_EMAIL }).first();
  await row.getByRole("button", { name: "Edit" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("Name").fill("Owner");
  await dlg.getByRole("button", { name: "Save" }).click();
  await waitToast("Login updated");
});
await step("shopify settings page", async () => {
  await page.goto(`${BASE}/settings/shopify`);
  await page.getByText("How to connect").waitFor();
  await shot("16-settings-shopify");
});
await step("factory role sees only factory modules", async () => {
  const c2 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p2 = await c2.newPage();
  await p2.goto(`${BASE}/login`);
  await p2.getByLabel("Email").fill(`factory-${RUN}@trupaths.in`);
  await p2.getByLabel("Password").fill("factory-pass-123");
  await p2.getByRole("button", { name: "Sign in" }).click();
  await p2.waitForURL(`${BASE}/factory`, { timeout: 20000 });
  await p2.screenshot({ path: `${OUT}/17-mobile-factory.png` });
  await p2.goto(`${BASE}/sales`);
  if (!p2.url().startsWith(`${BASE}/?denied`)) throw new Error("factory user could open /sales: " + p2.url());
  await p2.goto(`${BASE}/contacts`);
  if (await p2.getByRole("columnheader", { name: "They owe", exact: true }).count() || await p2.getByRole("columnheader", { name: "We owe", exact: true }).count()) throw new Error("Factory role can see financial balances in contacts");
  await p2.goto(`${BASE}/sales/new`);
  if (!p2.url().startsWith(`${BASE}/?denied`)) throw new Error("factory user could open new sale");
  await p2.goto(`${BASE}/?brand=firstbon`);
  await p2.getByRole("heading",{name:"Factory today",exact:true}).waitFor();
  if (await p2.getByRole("heading",{name:"This month",exact:true}).count() || await p2.getByText("Website revenue this month",{exact:true}).count()) throw new Error("Factory dashboard exposes financial summaries");
  await p2.getByRole("link",{name:"Baby Gambling",exact:true}).waitFor();
  await p2.goto(`${BASE}/factory/materials`);
  await p2.screenshot({ path: `${OUT}/18-mobile-materials.png` });
  await c2.close();
});
await step("inventory dashboard shows dispatch and brands without sales totals", async () => {
  const c=await browser.newContext();const p=await c.newPage();await p.goto(`${BASE}/login`);await p.getByLabel("Email").fill(`inventory-${RUN}@trupaths.in`);await p.getByLabel("Password").fill("inventory-pass-123");await p.getByRole("button",{name:"Sign in"}).click();await p.waitForURL(`${BASE}/stock`);
  await p.goto(`${BASE}/?brand=babygambling`);await p.getByRole("heading",{name:"Dispatch today",exact:true}).waitFor();await p.getByRole("link",{name:"Firstbon",exact:true}).waitFor();
  if (await p.getByText("Website revenue this month",{exact:true}).count() || await p.getByText("Sales today",{exact:true}).count()) throw new Error("Inventory dashboard exposes sales summaries");
  await c.close();
});
await step("account menu: change password page, dark mode, sign out", async () => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${BASE}/`);
  await page.getByRole("button", { name: /Owner/ }).first().click();
  await page.getByRole("menuitem", { name: "Change password" }).waitFor({ timeout: 10000 });
  await page.getByRole("menuitem", { name: "Change password" }).click();
  await page.waitForURL(`${BASE}/account`, { timeout: 15000 });
  await page.getByRole("button", { name: /Owner/ }).first().click();
  await page.getByRole("menuitem", { name: "Dark mode" }).click();
  await page.waitForTimeout(300);
  if (!(await page.locator("html").getAttribute("class"))?.includes("dark")) throw new Error("dark mode did not apply");
  await page.getByRole("button", { name: /Owner/ }).first().click();
  await page.getByRole("menuitem", { name: "Light mode" }).click();
  await page.getByRole("button", { name: /Owner/ }).first().click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await page.waitForURL(/\/login/, { timeout: 15000 });
  await page.getByLabel("Email").fill(OWNER_EMAIL);
  await page.getByLabel("Password").fill(OWNER_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(`${BASE}/`, { timeout: 20000 });
});
await step("dark mode + mobile dashboard", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/`);
  await page.waitForTimeout(500);
  await shot("19-mobile-dashboard");
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.waitForTimeout(400);
  await shot("20-mobile-menu");
});

if (process.env.E2E_INVOICES === "1") {
  let issuedUrl;
  await step("manual sale previews inclusive GST without issuing", async () => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${BASE}/sales/new`);
    const product = process.env.E2E_INVOICE_PRODUCT ?? "Invoice browser test product";
    await page.getByPlaceholder("Search product or SKU…").fill(product);
    await page.getByRole("listbox").getByRole("option").filter({ hasText: product }).first().click();
    if (await page.getByLabel("Unit price including GST").inputValue() !== "1999") throw new Error("Product price did not populate");
    if (await page.getByLabel("Order value (₹)").inputValue() !== "1999") throw new Error("The calculated sale total is missing");
    await page.getByLabel("Saved customer (for statements)").selectOption({ label: process.env.E2E_INVOICE_CUSTOMER ?? "Invoice browser test customer" });
    await page.getByLabel("Books", { exact: true }).selectOption({ label: process.env.E2E_INVOICE_BOOK ?? "Invoice browser test books" });
    if (!await page.getByLabel("Address", { exact: true }).inputValue()) throw new Error("Customer address was not filled");
    await page.getByRole("button", { name: "Save sale and review invoice" }).click();
    await page.waitForURL(/\/print\/invoice\/preview\?/, { timeout: 15000 });
    await page.getByText("DRAFT - NOT A TAX INVOICE", { exact: true }).waitFor();
    for (const text of ["1,903.81", "95.19", "₹ 1,999.00"]) if (!(await page.locator("body").innerText()).includes(text)) throw new Error("Incorrect preview: " + text);
    await page.screenshot({ path: `${OUT}/21-invoice-preview.png`, fullPage: true });
    if (process.env.E2E_INVOICE_PDF) await page.pdf({ path: process.env.E2E_INVOICE_PDF, format: "A4", printBackground: true, preferCSSPageSize: true });
  });
  await step("reviewed invoice issues once and can be printed", async () => {
    await page.getByRole("button", { name: "Issue invoice", exact: true }).click();
    await page.waitForURL(/\/print\/invoice\/[0-9a-f-]{36}$/, { timeout: 15000 });
    issuedUrl = page.url();
    await page.getByText("Tax Invoice", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Print", exact: true }).waitFor();
    await page.reload();
    if (page.url() !== issuedUrl) throw new Error("Invoice did not keep its identity");
    await page.screenshot({ path: `${OUT}/22-issued-invoice.png`, fullPage: true });
  });
  await step("unshipped invoice cancellation preserves the document", async () => {
    if (!issuedUrl) throw new Error("Issuing did not complete");
    await page.getByRole("button", { name: "Cancel invoice", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Reason", { exact: true }).fill(`End of browser test ${RUN} - no goods sold`);
    await dialog.getByRole("button", { name: "Cancel invoice", exact: true }).click();
    await page.getByText("CANCELLED", { exact: true }).waitFor();
    if (page.url() !== issuedUrl) throw new Error("Cancelled invoice disappeared");
  });
  await step("cancelled invoice stays accessible in the invoice register", async () => {
    await page.goto(`${BASE}/sales/invoices`);
    await page.getByText(`Cancelled: End of browser test ${RUN} - no goods sold`, { exact: true }).waitFor();
    await page.screenshot({ path: `${OUT}/24-invoice-register.png`, fullPage: true });
  });
  await step("new sale fits a phone screen", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/sales/new`);
    const sizes = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    if (sizes.scroll > sizes.width + 1) throw new Error("New sale has horizontal overflow");
    await page.screenshot({ path: `${OUT}/23-mobile-new-sale.png`, fullPage: true });
  });
}

await step("brand dashboard shows Baby Gambling separately from accounting books", async () => {
  await page.setViewportSize({width:390,height:844});
  await page.goto(`${BASE}/?brand=babygambling`);
  await page.getByRole("link",{name:"Baby Gambling",exact:true}).waitFor();
  if (await page.getByRole("link",{name:"Baby Gambling",exact:true}).getAttribute("aria-current")!=="page") throw new Error("Brand is not selected");
  await page.getByText("Accounting books",{exact:true}).waitFor();
  const sizes=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
  await page.screenshot({path:`${OUT}/27-brand-dashboard-mobile.png`,fullPage:true});
  if (sizes.scroll>sizes.width+1) {
    const wide = await page.evaluate(() => [...document.querySelectorAll("body *")].filter(el => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1).slice(0, 12).map(el => ({ tag: el.tagName, class: el.className, width: Math.round(el.getBoundingClientRect().width) })));
    throw new Error(`Brand dashboard overflows on a phone: ${JSON.stringify({ ...sizes, wide })}`);
  }
  const ledgerLink = page.getByRole("link",{name:"Open ledger",exact:true});
  await ledgerLink.evaluate(el => el.scrollIntoView({ block: "center" }));
  await ledgerLink.click();
  if (!page.url().includes("brand=babygambling")) await page.waitForURL(/brand=babygambling/);
  await page.getByRole("button",{name:"Add expense",exact:true}).click();
  if (await page.getByRole("dialog").getByLabel("Brand",{exact:true}).inputValue()!=="babygambling") throw new Error("Brand not carried into entry form");
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({state:"hidden"});
});

if (process.env.E2E_INVOICES === "1") {
  let creditUrl;
  await step("credit note previews a partial return on a phone", async () => {
    await page.setViewportSize({width:390,height:844});
    await page.goto(`${BASE}/sales/invoices?q=Credit%20note%20browser`);
    await page.getByRole("row").filter({hasText:"Credit note browser"}).first().getByRole("link").first().click();
    await page.getByRole("link",{name:"Record return / credit note",exact:true}).click();
    await page.getByLabel("Return Invoice browser test product",{exact:true}).fill("1");
    await page.getByLabel("Restock Invoice browser test product",{exact:true}).fill("1");
    await page.getByLabel("Reason for return",{exact:true}).fill(`Browser return ${RUN} — inspected and saleable`);
    await page.getByText("DRAFT - NOT AN ISSUED CREDIT NOTE",{exact:true}).waitFor();
    const sizes=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
    if (sizes.scroll>sizes.width+1) throw new Error("Return form overflows the phone screen");
    await page.screenshot({path:`${OUT}/25-credit-note-mobile.png`,fullPage:true});
    await page.getByRole("checkbox").check();
  });
  await step("credit note issues and links back to the unchanged original", async () => {
    await page.getByRole("button",{name:"Issue credit note",exact:true}).click();
    await page.waitForURL(/\/print\/credit-note\/[0-9a-f-]{36}$/, {timeout:15000});
    creditUrl=page.url();
    await page.getByText("Credit Note",{exact:true}).waitFor();
    for (const text of ["1,903.81","95.19","₹ 1,999.00"]) if (!(await page.locator("body").innerText()).includes(text)) throw new Error("Incorrect credit note: "+text);
    await page.setViewportSize({width:1440,height:1000});
    await page.screenshot({path:`${OUT}/26-credit-note.png`,fullPage:true});
    if (process.env.E2E_CREDIT_PDF) await page.pdf({path:process.env.E2E_CREDIT_PDF,format:"A4",printBackground:true,preferCSSPageSize:true});
    await page.getByRole("link",{name:/^Original invoice B2C/}).click();
    await page.getByText("Tax Invoice",{exact:true}).waitFor();
    await page.getByRole("link",{name:"Record return / credit note",exact:true}).click();
    await page.getByText("1 remaining · original GST 5%",{exact:true}).waitFor();
  });
  await step("credit note is available in its register", async () => {
    await page.goto(`${BASE}/sales/credit-notes`);
    await page.getByRole("row").filter({hasText:`Browser return ${RUN}`}).getByRole("link",{name:/^CN\//}).click();
    if (page.url()!==creditUrl) await page.waitForURL(creditUrl);
  });
}

console.log(results.join("\n"));
console.log("console errors:", consoleErrors.length ? consoleErrors.slice(0, 10) : "none");
await browser.close();
fs.writeFileSync(`${OUT}/results.txt`, results.join("\n") + "\nconsole errors: " + JSON.stringify(consoleErrors.slice(0, 20)));
process.exit(results.some((r) => r.startsWith("FAIL")) || consoleErrors.length ? 1 : 0);
