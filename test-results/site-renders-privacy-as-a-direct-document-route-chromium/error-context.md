# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: site.spec.ts >> renders /privacy as a direct document route
- Location: tests/e2e/site.spec.ts:4:7

# Error details

```
Error: expect(page).toHaveTitle(expected) failed

Expected pattern: /Apex Resource Partners/
Received string:  "Privacy Policy | Avenstrix Consulting"
Timeout: 5000ms

Call log:
  - Expect "toHaveTitle" with timeout 5000ms
    14 × unexpected value "Privacy Policy | Avenstrix Consulting"

```

```yaml
- link "Skip to main content":
  - /url: "#main-content"
- banner:
  - navigation "Primary navigation":
    - link "Avenstrix Consulting — Home":
      - /url: /
      - text: AvenstrixConsulting
    - link "Home":
      - /url: /
    - link "About Us":
      - /url: /about
    - link "Industries":
      - /url: /industries
    - link "Services":
      - /url: /services
    - link "Testimonials":
      - /url: /#testimonials
    - link "Contact Us":
      - /url: /contact
    - link "Let's Talk":
      - /url: /contact
- main:
  - paragraph: Legal
  - heading "Privacy Policy" [level=1]
  - article:
    - paragraph: "Last updated: July 17, 2026"
    - heading "Information we collect" [level=2]
    - paragraph: We collect the information you submit through our contact form so we can respond to your recruitment enquiry.
    - heading "How we use information" [level=2]
    - paragraph: We use your information to communicate with you, evaluate your request, and improve our services. We do not sell personal information.
    - heading "Contact" [level=2]
    - paragraph:
      - text: For privacy questions, contact
      - link "hello@avenstrixconsulting.com":
        - /url: mailto:hello@avenstrixconsulting.com
      - text: .
- contentinfo:
  - link "AvenstrixConsulting":
    - /url: /
  - paragraph: Connecting talent with visionary organizations and building lasting impact.
  - heading "Company" [level=2]
  - list:
    - listitem:
      - link "About Us":
        - /url: /about
    - listitem:
      - link "Industries":
        - /url: /industries
    - listitem:
      - link "Services":
        - /url: /services
    - listitem:
      - link "Testimonials":
        - /url: /#testimonials
    - listitem:
      - link "Contact Us":
        - /url: /contact
  - heading "Industries" [level=2]
  - list:
    - listitem:
      - link "Information Technology":
        - /url: /industries
    - listitem:
      - link "Pharmaceuticals":
        - /url: /industries
    - listitem:
      - link "Biotechnology":
        - /url: /industries
    - listitem:
      - link "Medical Devices":
        - /url: /industries
    - listitem:
      - link "Non-IT & Corporate":
        - /url: /industries
  - heading "Contact" [level=2]
  - list:
    - listitem:
      - link "hello@avenstrixconsulting.com":
        - /url: mailto:hello@avenstrixconsulting.com
    - listitem:
      - link "+1 (555) 123-4567":
        - /url: tel:+15551234567
    - listitem: Global Plaza, Innovation District, Suite 400
  - text: © 2026 Avenstrix Consulting. All Rights Reserved.
  - link "Privacy Policy":
    - /url: /privacy
  - link "Terms of Service":
    - /url: /terms
- alert
```

# Test source

```ts
  1  | import { expect, test } from "@playwright/test";
  2  | 
  3  | for (const path of ["/", "/about", "/industries", "/services", "/contact", "/privacy", "/terms"]) {
  4  |   test(`renders ${path} as a direct document route`, async ({ page }) => {
  5  |     const response = await page.goto(path);
  6  |     expect(response?.status()).toBe(200);
  7  |     await expect(page.locator("main")).toBeVisible();
> 8  |     await expect(page).toHaveTitle(/Apex Resource Partners/);
     |                        ^ Error: expect(page).toHaveTitle(expected) failed
  9  |   });
  10 | }
  11 | 
  12 | test("uses a normal navigation link, supports carousel controls, and exposes the contact form", async ({ page }) => {
  13 |   await page.goto("/");
  14 |   await Promise.all([page.waitForURL("**/about"), page.getByRole("link", { name: "About Us" }).first().click()]);
  15 |   await page.goto("/");
  16 |   const initialQuote = await page.locator("blockquote").textContent();
  17 |   await page.getByRole("button", { name: "Next testimonial" }).click();
  18 |   await expect(page.locator("blockquote")).not.toHaveText(initialQuote ?? "");
  19 |   await page.goto("/contact");
  20 |   await expect(page.getByRole("button", { name: "Submit Request" })).toBeVisible();
  21 | });
  22 | 
```