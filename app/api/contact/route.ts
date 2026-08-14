import { NextResponse } from "next/server";
import { crossSiteRejection } from "@/lib/http/same-origin";
import nodemailer from "nodemailer";
import { validateContactPayload } from "@/lib/contact";

export const runtime = "nodejs";

function configuration() {
  const required = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "CONTACT_TO_EMAIL", "CONTACT_FROM_EMAIL"] as const;
  const missing = required.some((name) => !process.env[name]);
  if (missing) return null;
  return {
    host: process.env.SMTP_HOST!, port: Number(process.env.SMTP_PORT), secure: process.env.SMTP_SECURE === "true",
    auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASSWORD! }, to: process.env.CONTACT_TO_EMAIL!, from: process.env.CONTACT_FROM_EMAIL!,
  };
}

export async function POST(request: Request) {
  const crossSite = crossSiteRejection(request.headers);
  if (crossSite) return crossSite;

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Please submit a valid request." }, { status: 400 }); }
  const { data, errors } = validateContactPayload(body);
  if (!data) return NextResponse.json({ message: "Please correct the highlighted fields.", errors }, { status: 422 });
  const smtp = configuration();
  if (!smtp) return NextResponse.json({ message: "Contact service is temporarily unavailable." }, { status: 503 });
  try {
    const transporter = nodemailer.createTransport({ host: smtp.host, port: smtp.port, secure: smtp.secure, auth: smtp.auth });
    await transporter.sendMail({ from: smtp.from, to: smtp.to, replyTo: data.email, subject: `New website enquiry from ${data.name}`, text: [`Name: ${data.name}`, `Email: ${data.email}`, `Phone: ${data.phone || "Not supplied"}`, `Industry: ${data.industry}`, "", "Message:", data.message].join("\n") });
    return NextResponse.json({ message: "Thank you! We’ll be in touch within 4 business hours." });
  } catch (error) {
    console.error("Contact email delivery failed", error);
    return NextResponse.json({ message: "Unable to send your request. Please try again later." }, { status: 502 });
  }
}
