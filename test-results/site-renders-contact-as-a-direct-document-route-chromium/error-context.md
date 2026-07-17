# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: site.spec.ts >> renders /contact as a direct document route
- Location: tests/e2e/site.spec.ts:4:7

# Error details

```
Error: expect(page).toHaveTitle(expected) failed

Expected pattern: /Apex Resource Partners/
Received string:  "Contact Us | Avenstrix Consulting"
Timeout: 5000ms

Call log:
  - Expect "toHaveTitle" with timeout 5000ms
    14 × unexpected value "Contact Us | Avenstrix Consulting"

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
  - paragraph: Contact Avenstrix
  - heading "Ready to scale your team?" [level=1]
  - paragraph: Tell us about your hiring needs and one of our specialists will be in touch.
  - paragraph: Let’s Connect
  - heading "Your next great hire starts here." [level=1]
  - paragraph: Whether you need a specialist, a senior leader, or an entire project team, we are ready to help.
  - term: Email
  - definition:
    - link "hello@avenstrixconsulting.com":
      - /url: mailto:hello@avenstrixconsulting.com
  - term: Phone
  - definition:
    - link "+1 (555) 123-4567":
      - /url: tel:+15551234567
  - term: Office
  - definition: Global Plaza, Innovation District, Suite 400
  - text: Full Name
  - emphasis: "*"
  - textbox "Full Name *"
  - text: Work Email
  - emphasis: "*"
  - textbox "Work Email *"
  - text: Phone Number
  - textbox "Phone Number"
  - text: Industry
  - emphasis: "*"
  - combobox "Industry *":
    - option "Select your industry" [selected]
    - option "Information Technology"
    - option "Non-IT & Corporate"
    - option "Pharmaceuticals"
    - option "Biotechnology"
    - option "Medical Devices"
    - option "Other"
  - text: How can we help?
  - emphasis: "*"
  - textbox "How can we help? *":
    - /placeholder: Tell us about the roles you need to fill, your timeline, and any specific requirements…
  - button "Submit Request"
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