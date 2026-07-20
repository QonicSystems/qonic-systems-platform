import { expect, test } from "@playwright/test";

for (const path of ["/", "/about", "/industries", "/services", "/contact", "/privacy", "/terms"]) {
  test(`renders ${path} as a direct document route`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.locator("main")).toBeVisible();
    await expect(page).toHaveTitle(/Avenstrix Consulting/);
  });
}

test("uses a normal navigation link, supports carousel controls, and exposes the contact form", async ({ page }) => {
  await page.goto("/");
  await Promise.all([page.waitForURL("**/about"), page.getByRole("link", { name: "About Us" }).first().click()]);
  await page.goto("/");
  const initialQuote = await page.locator("blockquote").textContent();
  await page.getByRole("button", { name: "Next testimonial" }).click();
  await expect(page.locator("blockquote")).not.toHaveText(initialQuote ?? "");
  await page.goto("/contact");
  await expect(page.getByRole("button", { name: "Submit Request" })).toBeVisible();
});
