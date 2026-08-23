import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendMail, createTransport } = vi.hoisted(() => {
  const sendMail = vi.fn();
  return { sendMail, createTransport: vi.fn(() => ({ sendMail })) };
});

vi.mock("nodemailer", () => ({ default: { createTransport } }));

import { sendEmail } from "@/lib/notify";

describe("sendEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_PORT = "587";
    process.env.SMTP_USER = "user";
    process.env.SMTP_PASSWORD = "password";
    process.env.CONTACT_FROM_EMAIL = "billing@qonicsystems.com";
    sendMail.mockResolvedValue({ messageId: "sent" });
  });

  it("delivers generated PDFs as email attachments", async () => {
    const pdf = Buffer.from("%PDF-1.7 test document");

    const delivered = await sendEmail(
      ["billing@example.com"],
      "Invoice issued: QNC-INV-2026-0001",
      "Your document is attached.",
      "/invoices",
      [{ filename: "QNC-INV-2026-0001.pdf", content: pdf }]
    );

    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ host: "smtp.example.com" }));
    expect(delivered).toBe(true);
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
      to: "billing@example.com",
      attachments: [{ filename: "QNC-INV-2026-0001.pdf", content: pdf, contentType: "application/pdf" }],
    }));
  });
});
