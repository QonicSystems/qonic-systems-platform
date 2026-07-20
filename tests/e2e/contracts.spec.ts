import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "Demo-Passw0rd-2026";
const HR = "hr@avenstrixconsulting.com";
const EMPLOYEE = "developer@avenstrixconsulting.com";
const COFOUNDER = "cofounder@avenstrixconsulting.com";

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Work Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForURL("**/dashboard");
}

/**
 * Switches role on the SAME page rather than opening extra browser contexts:
 * `browser.newContext()` does not inherit `baseURL` from the config, which makes
 * relative navigation in a fresh context unreliable.
 */
async function switchTo(page: Page, email: string) {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Sign Out" }).click();
  await page.waitForURL("**/login");
  await signIn(page, email);
}

const formAlert = (page: Page) => page.locator("main").getByRole("status").or(page.locator("main").getByRole("alert"));

test.describe("contract letters", () => {
  test("runs the full lifecycle: HR drafts, leadership releases, employee downloads", async ({ page }) => {
    // --- HR drafts and submits
    await signIn(page, HR);
    await page.goto("/contracts/new");

    // Resolve the option by its text, since selectOption's label match needs an exact string.
    const employeeSelect = page.getByLabel("Employee");
    const employeeValue = await employeeSelect.locator("option", { hasText: "Arjun Nair" }).getAttribute("value");
    await employeeSelect.selectOption(employeeValue!);
    await page.getByLabel("Position").fill("Staff Engineer");
    await page.getByLabel("Start Date").fill("2027-03-01");
    await page.getByLabel("Annual Salary").fill("2100000");
    await page.getByLabel("Work Location").fill("Remote — India");
    await page.getByRole("button", { name: "Create Draft" }).click();

    // Must exclude /contracts/new — a bare `[a-z0-9]+` also matches "new", which
    // would capture the draft form's URL instead of the created letter's.
    await page.waitForURL((url) => /^\/contracts\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith("/new"));
    const letterUrl = page.url();
    await expect(page.getByText("draft", { exact: true }).first()).toBeVisible();

    // HR can submit but must NOT be able to release.
    await expect(page.getByRole("button", { name: "Submit for release" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Release letter" })).toHaveCount(0);

    await page.getByRole("button", { name: "Submit for release" }).click();
    await expect(formAlert(page).first()).toContainText("submit for release complete");

    // --- Co-Founder releases (the requirement: CEO *and* Co-Founder may release)
    await switchTo(page, COFOUNDER);
    await page.goto(letterUrl);
    await expect(page.getByRole("button", { name: "Release letter" })).toBeVisible();
    await page.getByRole("button", { name: "Release letter" }).click();
    await expect(formAlert(page).first()).toContainText("release letter complete");

    // --- Employee sees it, downloads the PDF, acknowledges
    await switchTo(page, EMPLOYEE);
    await page.goto(letterUrl);

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: "Download the signed PDF" }).click(),
    ]);
    expect(await download.path()).not.toBeNull();

    // The subject may acknowledge but never release or revoke their own letter.
    await expect(page.getByRole("button", { name: "Acknowledge receipt" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Revoke letter" })).toHaveCount(0);
    await page.getByRole("button", { name: "Acknowledge receipt" }).click();
    await expect(formAlert(page).first()).toContainText("acknowledge receipt complete");
  });

  test("keeps other people's letters out of an employee's list", async ({ page }) => {
    await signIn(page, EMPLOYEE);
    await page.goto("/contracts");
    await expect(page.getByRole("heading", { name: "My contract letters" })).toBeVisible();
    // No drafting rights, so no draft button.
    await expect(page.getByRole("link", { name: "Draft a new letter" })).toHaveCount(0);
  });

  test("shows HR the drafting entry point", async ({ page }) => {
    await signIn(page, HR);
    await page.goto("/contracts");
    await expect(page.getByRole("heading", { name: "All contract letters" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Draft a new letter" })).toBeVisible();
  });
});

test.describe("people management", () => {
  test("lets HR edit an Employee but not a peer-ranked colleague", async ({ page }) => {
    await signIn(page, HR);
    await page.goto("/admin");

    const employeeRow = page.getByRole("row", { name: /Arjun Nair/ });
    await expect(employeeRow.getByRole("button", { name: "Edit" })).toBeVisible();

    // Accounts shares HR's rank, so HR has no authority over them.
    const accountsRow = page.getByRole("row", { name: /Rahul Mehta/ });
    await expect(accountsRow.getByRole("button", { name: "Edit" })).toHaveCount(0);
    await expect(accountsRow.getByText("No access")).toBeVisible();
  });

  test("withholds deactivate and remove from HR", async ({ page }) => {
    await signIn(page, HR);
    await page.goto("/admin");
    const employeeRow = page.getByRole("row", { name: /Arjun Nair/ });
    await expect(employeeRow.getByRole("button", { name: "Deactivate" })).toHaveCount(0);
    await expect(employeeRow.getByRole("button", { name: "Remove" })).toHaveCount(0);
  });

  test("saves an edit made by HR", async ({ page }) => {
    await signIn(page, HR);
    await page.goto("/admin");
    await page.getByRole("row", { name: /Arjun Nair/ }).getByRole("button", { name: "Edit" }).click();

    await page.getByLabel("Job Title").fill("Principal Developer");
    await page.getByRole("button", { name: "Save Changes" }).click();

    await expect(page.locator("main").getByRole("status").first()).toContainText("updated");
  });
});
