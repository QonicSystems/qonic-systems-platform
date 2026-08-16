"use client";

import { useState } from "react";

export function ContractDispatch({
  letterId,
  reference,
  subjectName,
  subjectPhone,
  subjectEmail,
  status,
}: {
  letterId: string;
  reference: string;
  subjectName: string;
  subjectPhone?: string | null;
  subjectEmail?: string | null;
  status: string;
}) {
  const [copied, setCopied] = useState(false);

  // The direct review / signing URL
  const host = typeof window !== "undefined" ? window.location.origin : "https://consulting.qonicsystems.com";
  const signingUrl = `${host}/contracts/${letterId}`;

  const messageText = `Hello ${subjectName}! Your official contract letter (${reference}) from Qonic Systems is ready for your review and digital signature: ${signingUrl}`;

  const whatsappPhone = subjectPhone ? subjectPhone.replace(/[^0-9]/g, "") : "";
  const whatsappUrl = whatsappPhone
    ? `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(messageText)}`
    : `https://wa.me/?text=${encodeURIComponent(messageText)}`;

  const emailSubject = encodeURIComponent(`Action Required: Your Contract Letter (${reference}) - Qonic Systems`);
  const emailBody = encodeURIComponent(
    `Dear ${subjectName},\n\nWe are pleased to issue your contract letter (${reference}) at Qonic Systems.\n\nPlease review and digitally acknowledge the document using the secure link below:\n\n${signingUrl}\n\nWarm regards,\nLeadership Team\nQonic Systems`
  );
  const mailtoUrl = `mailto:${subjectEmail ?? ""}?subject=${emailSubject}&body=${emailBody}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(signingUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
    }
  };

  if (status !== "RELEASED" && status !== "ACKNOWLEDGED") return null;

  return (
    <div className="portal-section my-4 p-4 bg-neutral-900/60 border border-amber-500/30 rounded-xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-amber-400 flex items-center gap-2">
            <span>⚡ Smart Dispatch &amp; Candidate Notification</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-400/10 text-amber-300 border border-amber-400/20">
              Ready for Signature
            </span>
          </h3>
          <p className="text-xs text-neutral-400 mt-1">
            Instantly dispatch the secure digital signing link to {subjectName} via WhatsApp or Email.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="button button-outline text-xs py-1.5 px-3 text-emerald-400 border-emerald-500/30 hover:border-emerald-400 hover:bg-emerald-500/10 flex items-center gap-1.5"
          >
            <span>💬 Share via WhatsApp</span>
          </a>

          <a
            href={mailtoUrl}
            className="button button-outline text-xs py-1.5 px-3 text-sky-400 border-sky-500/30 hover:border-sky-400 hover:bg-sky-500/10 flex items-center gap-1.5"
          >
            <span>✉️ Dispatch Email</span>
          </a>

          <button
            type="button"
            onClick={copyLink}
            className="button button-outline text-xs py-1.5 px-3 text-amber-300 border-amber-500/30 hover:border-amber-400 hover:bg-amber-500/10 flex items-center gap-1.5"
          >
            <span>{copied ? "✓ Copied Link!" : "🔗 Copy Signing Link"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
