# Apex Resource Partners

A server-rendered, multi-page recruitment website built with Next.js, React, TypeScript, and Tailwind CSS. It is deliberately **not** a single-page application: the primary navigation uses normal document links and each route renders independently.

## Routes

- `/` — landing page, industry preview, process, testimonials, and CTA
- `/about`, `/industries`, `/services`, `/contact` — dedicated marketing pages
- `/privacy`, `/terms` — legal information pages
- `/api/contact` — validated SMTP contact endpoint

## Development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. A Node-capable deployment is required because the contact endpoint sends email through SMTP.

## SMTP Configuration

Set the following variables in `.env.local` locally and in your deployment environment:

```dotenv
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-smtp-username
SMTP_PASSWORD=your-smtp-password
CONTACT_TO_EMAIL=hello@apexresourcepartners.com
CONTACT_FROM_EMAIL=website@apexresourcepartners.com
```

`SMTP_SECURE` is normally `false` with port `587` and `true` with port `465`. `CONTACT_FROM_EMAIL` must be permitted by the SMTP provider.

## Validation

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

The API tests cover validation, successful SMTP handoff, and a safe mail-provider failure response. Use a browser or end-to-end suite in your deployed environment to confirm the supplied SMTP credentials deliver mail.
