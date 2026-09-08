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
  try { await fn(); results.push(`PASS ${name}`); }
  catch (e) { results.push(`FAIL ${name}: ${String(e.message ?? e).split("\n")[0].slice(0, 300)}`); }
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
  await dlg.getByRole("option").first().click();
  await dlg.getByLabel("Quantity made").fill("3");
  await dlg.getByLabel("Made by").selectOption({ index: 1 });
  await shot("05-production-dialog");
  await dlg.getByRole("button", { name: "Record production" }).click();
  await waitToast("recorded");
  await page.getByRole("row").filter({ hasText: "PROD/" }).first().waitFor({ timeout: 15000 });
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
  await page.getByRole("option").first().click();
  await pickOption(page.locator('select[name="materialId[]"]').first(), "MULL");
  await page.locator('input[name="qtyPerUnit[]"]').first().fill("1.5");
  await shot("09-recipe");
  await page.getByRole("button", { name: "Create recipe" }).click();
  await page.waitForURL(`${BASE}/factory/boms`, { timeout: 20000 });
  await page.getByText("Baby Blanket Sleepy Bear").first().waitFor();
});
await step("production with recipe consumes material", async () => {
  await page.goto(`${BASE}/factory`);
  await page.getByRole("button", { name: "Record production" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByPlaceholder(/Search product/).fill("Baby Blanket Sleepy Bear");
  await dlg.getByRole("option").first().click();
  await dlg.getByLabel("Quantity made").fill("2");
  await dlg.getByRole("button", { name: "Record production" }).click();
  await waitToast("Materials used");
});
await step("create and ship a dispatch", async () => {
  await page.goto(`${BASE}/dispatch/new`);
  await page.getByPlaceholder(/Search product/).first().fill("Nest Bed Sleepy Bear");
  await page.getByRole("option").first().click();
  await page.locator('input[name="qty[]"]').first().fill("1");
  await page.getByLabel("Customer name").fill("E2E Customer");
  await page.getByLabel("Phone").fill("9999999999");
  await page.getByLabel("Address").fill("Angamaly, Ernakulam, Kerala");
  await page.getByLabel("Order value (₹)").fill("3999");
  await shot("10-dispatch-new");
  await page.getByRole("button", { name: "Create dispatch" }).click();
  await page.waitForURL(/\/dispatch\/[0-9a-f-]{36}$/, { timeout: 20000 });
  await page.getByRole("button", { name: "Mark shipped" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("Courier").fill("DTDC");
  await dlg.getByLabel("Tracking no.").fill("E2E123");
  await dlg.getByRole("button", { name: "Mark shipped" }).click();
  await waitToast("marked shipped");
  await shot("11-dispatch-detail");
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
  await shot("15-settings-users");
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
  await p2.goto(`${BASE}/factory/materials`);
  await p2.screenshot({ path: `${OUT}/18-mobile-materials.png` });
  await c2.close();
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

console.log(results.join("\n"));
console.log("console errors:", consoleErrors.length ? consoleErrors.slice(0, 10) : "none");
await browser.close();
fs.writeFileSync(`${OUT}/results.txt`, results.join("\n") + "\nconsole errors: " + JSON.stringify(consoleErrors.slice(0, 20)));
process.exit(results.some((r) => r.startsWith("FAIL")) || consoleErrors.length ? 1 : 0);
