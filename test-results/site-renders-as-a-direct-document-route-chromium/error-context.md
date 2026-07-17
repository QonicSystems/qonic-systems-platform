# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: site.spec.ts >> renders / as a direct document route
- Location: tests/e2e/site.spec.ts:4:7

# Error details

```
Error: expect(page).toHaveTitle(expected) failed

Expected pattern: /Apex Resource Partners/
Received string:  "Avenstrix Consulting | Talent Solutions & Consulting"
Timeout: 5000ms

Call log:
  - Expect "toHaveTitle" with timeout 5000ms
    14 × unexpected value "Avenstrix Consulting | Talent Solutions & Consulting"

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
  - paragraph: Talent & Consulting Solutions
  - heading "Connecting Talent. Creating Tomorrow." [level=1]
  - paragraph: We help ambitious companies and professionals connect with opportunity, insight, and lasting impact.
  - link "Start a Conversation":
    - /url: /contact
  - link "Explore Services":
    - /url: /industries
  - paragraph: Trusted by industry leaders
  - text: TechFlow Solutions MedTech Innovators NovaBio Therapeutics GlobalPharma Inc. Helix Biosciences Northwind Corporate
  - region "Company statistics":
    - strong: 0+
    - paragraph: Successful Placements
    - strong: 0+
    - paragraph: Enterprise Clients
    - strong: "0"
    - paragraph: Industry Verticals
    - strong: 0%
    - paragraph: Client Retention Rate
  - strong: 15+ Years
  - paragraph: of Strategic Partnership
  - paragraph: About Avenstrix
  - heading "The right connection changes everything." [level=1]
  - paragraph: "We are a specialist consulting partner built around a simple belief: exceptional people deserve exceptional opportunities."
  - list:
    - listitem: ✓ Deep sector expertise
    - listitem: ✓ Global reach, personal approach
    - listitem: ✓ Long-term partnerships
  - link "Meet Avenstrix Consulting":
    - /url: /about
  - paragraph: Our Industries
  - heading "Specialized Talent for Specialized Sectors" [level=1]
  - paragraph: Our focused teams understand the skills, regulations, and business dynamics that shape your industry.
  - article:
    - heading "Information Technology" [level=2]
    - paragraph: From cloud architects to cybersecurity specialists, we connect technology teams with the expertise that moves business forward.
    - link "Build your team":
      - /url: /contact
  - article:
    - heading "Non-IT & Corporate" [level=2]
    - paragraph: Build high-performing finance, operations, HR, and executive teams with candidates who fit your culture and goals.
    - link "Build your team":
      - /url: /contact
  - article:
    - heading "Pharmaceuticals" [level=2]
    - paragraph: Advance discovery and commercialization with specialized talent across clinical, regulatory, quality, and manufacturing roles.
    - link "Build your team":
      - /url: /contact
  - article:
    - heading "Biotechnology" [level=2]
    - paragraph: Find the scientists, engineers, and leaders helping turn breakthrough science into real-world impact.
    - link "Build your team":
      - /url: /contact
  - article:
    - heading "Medical Devices" [level=2]
    - paragraph: Connect with proven experts in product development, quality systems, regulatory affairs, and market access.
    - link "Build your team":
      - /url: /contact
  - paragraph: How We Work
  - heading "A Process Built for Precision" [level=1]
  - paragraph: Every search is carefully tailored, transparent, and driven by the outcomes that matter to you.
  - list:
    - listitem:
      - text: "01"
      - heading "Discovery" [level=2]
      - paragraph: We learn your business, culture, technical needs, and the outcomes the role must deliver.
    - listitem:
      - text: "02"
      - heading "Sourcing & Vetting" [level=2]
      - paragraph: Our specialist recruiters identify, engage, and thoroughly assess exceptional candidates.
    - listitem:
      - text: "03"
      - heading "Placement & Onboarding" [level=2]
      - paragraph: We manage the process through acceptance and remain a partner long after the placement.
  - paragraph: Client Stories
  - heading "Trusted Partnerships. Measurable Impact." [level=1]
  - paragraph: See why ambitious organizations choose Avenstrix for their most important hires.
  - region "Client testimonials":
    - article:
      - text: “ ★★★★★
      - blockquote: “Avenstrix understood the specialized talent we needed from day one. They delivered a senior clinical operations leader who transformed our trial timelines.”
      - text: SM
      - strong: Dr. Sarah Mitchell
      - paragraph: VP Clinical Operations, NovaBio Therapeutics
    - button "Previous testimonial": ←
    - tablist "Choose testimonial":
      - tab "Show testimonial 1" [selected]
      - tab "Show testimonial 2"
      - tab "Show testimonial 3"
    - button "Next testimonial": →
  - paragraph: Ready when you are
  - heading "Build the team that moves your business forward." [level=2]
  - link "Start a Conversation":
    - /url: /contact
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