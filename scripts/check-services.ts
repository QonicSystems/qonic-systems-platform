import "dotenv/config";
import nodemailer from "nodemailer";

/**
 * Checks the two third-party integrations without sending anything to a real
 * person or needing a browser.
 *
 * Both fail quietly in normal use by design — a missing SMTP config makes the
 * contact form return 503 and password-reset mail silently never arrive, and a
 * missing reCAPTCHA secret skips verification entirely — so "it looks fine" is
 * not evidence either one works. This turns that into a five-second answer.
 *
 *   npm run check:services              # verify configuration and credentials
 *   npm run check:services -- --send    # also send one real test email
 */
const ok = (message: string) => console.log(`  \x1b[32m✔\x1b[0m ${message}`);
const bad = (message: string) => console.log(`  \x1b[31m✘\x1b[0m ${message}`);
const info = (message: string) => console.log(`  \x1b[90m·\x1b[0m ${message}`);

let failed = false;

async function checkMail(send: boolean) {
  console.log("\nSMTP\n────");

  const required = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "CONTACT_FROM_EMAIL"] as const;
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) {
    bad(`not configured — missing ${missing.join(", ")}`);
    info("The contact form will return 503 and no password-reset email will be sent.");
    failed = true;
    return;
  }

  const host = process.env.SMTP_HOST!;
  const port = Number(process.env.SMTP_PORT);
  const secure = process.env.SMTP_SECURE === "true";
  const user = process.env.SMTP_USER!;
  const from = process.env.CONTACT_FROM_EMAIL!;
  const to = process.env.CONTACT_TO_EMAIL;

  info(`${user} via ${host}:${port} (${secure ? "SSL" : "STARTTLS"})`);

  // Port and SMTP_SECURE have to agree or the handshake hangs rather than
  // failing cleanly: 465 is implicit TLS, 587 upgrades with STARTTLS.
  if (port === 465 && !secure) bad('port 465 needs SMTP_SECURE="true"');
  if (port === 587 && secure) bad('port 587 needs SMTP_SECURE="false"');

  // Zoho rejects a From that is not the authenticated mailbox or one of its
  // aliases, with "Relaying disallowed" — and only at send time, so it survives
  // a successful auth check.
  if (from.toLowerCase() !== user.toLowerCase()) {
    info(`CONTACT_FROM_EMAIL (${from}) differs from SMTP_USER (${user}) — it must be a registered alias, or sending fails with "Relaying disallowed".`);
  }

  const transporter = nodemailer.createTransport({
    host, port, secure,
    auth: { user, pass: process.env.SMTP_PASSWORD! },
  });

  try {
    await transporter.verify();
    ok("connected and authenticated");
  } catch (error) {
    bad(`could not authenticate — ${(error as Error).message}`);
    info("Wrong host for your plan (smtp vs smtppro), wrong datacenter (.in/.com/.eu), or 2FA is on and this is not an app-specific password.");
    failed = true;
    return;
  }

  if (!send) {
    info("Run with -- --send to deliver a real test message.");
    return;
  }

  const recipient = to ?? user;
  try {
    await transporter.sendMail({
      from, to: recipient,
      subject: "QONIC platform — SMTP test",
      text: "If you are reading this, the platform can send mail. Nothing else to do.",
    });
    ok(`test message sent to ${recipient}`);
  } catch (error) {
    bad(`authenticated, but sending failed — ${(error as Error).message}`);
    failed = true;
  }
}

async function checkCaptcha() {
  console.log("\nreCAPTCHA v3\n────────────");

  const site = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
  const secret = process.env.RECAPTCHA_SECRET_KEY;

  if (!site && !secret) {
    info("not configured — verification is skipped and the public forms rely on rate limiting alone");
    return;
  }
  if (!site) { bad("RECAPTCHA_SECRET_KEY is set but NEXT_PUBLIC_RECAPTCHA_SITE_KEY is not — the browser cannot mint a token, so every submission will be rejected"); failed = true; return; }
  if (!secret) { bad("NEXT_PUBLIC_RECAPTCHA_SITE_KEY is set but RECAPTCHA_SECRET_KEY is not — tokens are minted and then never checked"); failed = true; return; }

  ok("both keys are set");

  // Google keys are 40 characters and start with "6L". Worth checking only
  // because the two keys are easy to paste into each other's slot, and that
  // failure mode otherwise shows up as "every submission is rejected".
  const shaped = (value: string) => /^6L[\w-]{30,}$/.test(value);
  if (!shaped(site)) info(`NEXT_PUBLIC_RECAPTCHA_SITE_KEY does not look like a reCAPTCHA key (expected 6L…): ${site.slice(0, 12)}…`);
  if (!shaped(secret)) info(`RECAPTCHA_SECRET_KEY does not look like a reCAPTCHA key (expected 6L…): ${secret.slice(0, 12)}…`);
  if (site === secret) { bad("the site key and secret key are identical — one of them is pasted in the wrong slot"); failed = true; }

  // The secret CANNOT be validated from here. siteverify checks the response
  // token first and short-circuits, so a junk token returns
  // invalid-input-response for a valid and an invalid secret alike — verified
  // against the live endpoint. Only a token minted by a real browser proves the
  // pair works, which is what a real form submission does.
  try {
    const response = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: "probe" }),
      signal: AbortSignal.timeout(8000),
    });
    if (response.ok) ok("Google's verification endpoint is reachable");
    else { bad(`Google's verification endpoint returned ${response.status}`); failed = true; }
  } catch (error) {
    bad(`could not reach Google — ${(error as Error).message}`);
    failed = true;
  }

  info("Key validity can only be proven by a real submission — submit the contact form once after deploying.");
}

async function main() {
  const send = process.argv.includes("--send");
  await checkMail(send);
  await checkCaptcha();
  console.log("");
  process.exit(failed ? 1 : 0);
}

main();
