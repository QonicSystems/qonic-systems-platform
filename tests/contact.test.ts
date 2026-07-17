import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendMail, createTransport } = vi.hoisted(() => {
  const sendMail = vi.fn();
  return { sendMail, createTransport: vi.fn(() => ({ sendMail })) };
});

vi.mock("nodemailer", () => ({ default: { createTransport } }));

import { POST } from "@/app/api/contact/route";
import { validateContactPayload } from "@/lib/contact";

const validPayload = { name: "Jordan Lee", email: "jordan@example.com", phone: "+1 555 0100", industry: "it", message: "We need help hiring a platform engineer." };

describe("contact validation", () => {
  it("rejects incomplete or invalid requests", () => {
    const result = validateContactPayload({ name: "J", email: "not-an-email", industry: "", message: "short" });
    expect(result.data).toBeUndefined();
    expect(result.errors).toMatchObject({ name: expect.any(String), email: expect.any(String), industry: expect.any(String), message: expect.any(String) });
  });
});

describe("POST /api/contact", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_PORT = "587";
    process.env.SMTP_SECURE = "false";
    process.env.SMTP_USER = "user";
    process.env.SMTP_PASSWORD = "password";
    process.env.CONTACT_TO_EMAIL = "team@example.com";
    process.env.CONTACT_FROM_EMAIL = "website@example.com";
  });

  it("returns validation errors before attempting delivery", async () => {
    const response = await POST(new Request("http://localhost/api/contact", { method: "POST", body: JSON.stringify({}) }));
    expect(response.status).toBe(422);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("sends a validated request without exposing SMTP values", async () => {
    sendMail.mockResolvedValue({ messageId: "sent" });
    const response = await POST(new Request("http://localhost/api/contact", { method: "POST", body: JSON.stringify(validPayload) }));
    expect(response.status).toBe(200);
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ host: "smtp.example.com", auth: { user: "user", pass: "password" } }));
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ replyTo: validPayload.email, to: "team@example.com" }));
    expect(await response.json()).toEqual({ message: "Thank you! We’ll be in touch within 4 business hours." });
  });

  it("returns a safe failure when the mail provider rejects delivery", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    sendMail.mockRejectedValue(new Error("Authentication failed"));
    const response = await POST(new Request("http://localhost/api/contact", { method: "POST", body: JSON.stringify(validPayload) }));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ message: "Unable to send your request. Please try again later." });
    error.mockRestore();
  });
});
