import { expect, test } from "@playwright/test";

// Seeded by `npx tsx prisma/seed-demo.ts`.
const DEMO_PASSWORD = "Demo-Passw0rd-2026";
const EMPLOYEE = "developer@qonicsystems.com";
const HR = "hr@qonicsystems.com";

const portalNav = (page: import("@playwright/test").Page) =>
  page.getByRole("navigation", { name: "Portal navigation" });

async function signIn(page: import("@playwright/test").Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Work Email").fill(email);
  await page.getByLabel("Password").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForURL("**/dashboard");
}

test.describe("finding the way in", () => {
  test("offers a sign-in link from the public site on desktop", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Sign In", exact: true }).click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: /sign in to your workspace/i })).toBeVisible();
  });

  test("offers a sign-in link from the footer", async ({ page }) => {
    await page.goto("/terms");
    await page.getByRole("link", { name: "Staff Sign In" }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  test("offers a sign-in link inside the mobile menu", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.getByRole("button", { name: "Toggle navigation menu" }).click();
    await page.getByRole("link", { name: /sign in to the staff portal/i }).click();
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("authentication", () => {
  test("sends an anonymous visitor from a portal page to the login page and back again", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/);

    await page.getByLabel("Work Email").fill(EMPLOYEE);
    await page.getByLabel("Password").fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: "Sign In" }).click();

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Welcome back");
  });

  test("rejects a wrong password without revealing whether the account exists", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Work Email").fill(EMPLOYEE);
    await page.getByLabel("Password").fill("definitely-not-the-password");
    await page.getByRole("button", { name: "Sign In" }).click();

    await expect(page.locator("form").getByRole("alert")).toHaveText("Email or password is incorrect.");
    await expect(page).toHaveURL(/\/login/);
  });

  test("gives an unknown email the exact same message as a wrong password", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Work Email").fill("does-not-exist@qonicsystems.com");
    await page.getByLabel("Password").fill("definitely-not-the-password");
    await page.getByRole("button", { name: "Sign In" }).click();

    await expect(page.locator("form").getByRole("alert")).toHaveText("Email or password is incorrect.");
  });

  test("refuses to redirect off-site after login", async ({ page }) => {
    await page.goto("/login?next=https://evil.example.com");
    await page.getByLabel("Work Email").fill(EMPLOYEE);
    await page.getByLabel("Password").fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: "Sign In" }).click();

    await expect(page).toHaveURL(/127\.0\.0\.1:3008\/dashboard/);
  });

  test("signs the user out and re-protects the portal", async ({ page }) => {
    await signIn(page, EMPLOYEE);
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: "Sign Out" }).click();
    await page.waitForURL("**/login");

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("role-based access", () => {
  test("hides administration from an employee and blocks the URL", async ({ page }) => {
    await signIn(page, EMPLOYEE);
    await expect(portalNav(page).getByRole("link", { name: "Administration" })).toHaveCount(0);

    await page.goto("/admin");
    await expect(page).toHaveURL(/\/dashboard\?denied=1/);
    // Scoped to main: Next.js also renders a route announcer with role="alert".
    await expect(page.locator("main").getByRole("alert")).toContainText("do not have permission");
  });

  test("gives HR the administration area but not the permission matrix", async ({ page }) => {
    await signIn(page, HR);
    await expect(portalNav(page).getByRole("link", { name: "Administration" })).toBeVisible();

    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "People" })).toBeVisible();

    // rbac.manage is reserved for the CEO, so even an admin-console user is refused.
    await page.goto("/admin/permissions");
    await expect(page).toHaveURL(/\/dashboard\?denied=1/);
  });

  test("shows an employee only the capabilities their role grants", async ({ page }) => {
    await signIn(page, EMPLOYEE);
    await expect(page.getByText("Access the staff portal")).toBeVisible();
    await expect(page.getByText("Manage roles and permissions")).toHaveCount(0);
  });
});
