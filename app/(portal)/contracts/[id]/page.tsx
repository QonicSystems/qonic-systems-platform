import Link from "next/link";
import { notFound } from "next/navigation";
import { ContractForm } from "@/components/contracts/contract-form";
import { TransitionActions, type Action } from "@/components/contracts/transition-actions";
import { appOrigin } from "@/lib/app-origin";
import { requireAuth } from "@/lib/auth/guard";
import { formatCompensation, formatDate, type ContractPayload } from "@/lib/contracts/payload";
import { availableTransitions, canDeleteLetter, canDispatchLetter, canEditContent, canViewLetter, describeStatus } from "@/lib/contracts/workflow";
import { db } from "@/lib/db";
import { StatusChip } from "@/components/status-chip";

import { ContractDispatch } from "@/components/contracts/contract-dispatch";

export const metadata = { title: "Contract Letter" };

const TONES: Record<string, Action["tone"]> = { RELEASED: "primary", PENDING_RELEASE: "primary", ACKNOWLEDGED: "primary", CHANGES_REQUESTED: "outline", REVOKED: "danger" };

export default async function ContractDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireAuth();
  const { id } = await params;

  const letter = await db.contractLetter.findUnique({
    where: { id },
    include: { subject: true, author: true, events: { orderBy: { createdAt: "asc" } } },
  });

  // Indistinguishable from "does not exist", so this page cannot be used to
  // discover which letters are on file.
  if (!letter || !canViewLetter(context, letter)) notFound();

  const payload = letter.payload as unknown as ContractPayload;
  const editable = canEditContent(context, letter);
  const actions: Action[] = availableTransitions(context, letter).map((rule) => ({
    to: rule.to, label: rule.label, description: rule.description, tone: TONES[rule.to] ?? "outline",
  }));

  const actorNames = new Map((await db.user.findMany({ where: { id: { in: letter.events.map((event) => event.actorId) } } })).map((user) => [user.id, user.name]));

  return <div className="portal-page">
    <header className="portal-page-head">
      <p className="eyebrow">{letter.reference}</p>
      <h1 className="portal-title">Contract letter — {letter.subject.name}</h1>
      <p className="portal-lead">
        <StatusChip status={letter.status} label={describeStatus(letter.status)} />
        {" "}Drafted by {letter.author.name}.
      </p>
    </header>

    <TransitionActions letterId={letter.id} actions={actions} canDelete={canDeleteLetter(context, letter)} />

    {canDispatchLetter(context, letter) && <ContractDispatch
      letterId={letter.id}
      reference={letter.reference}
      subjectName={letter.subject.name}
      subjectPhone={letter.subject.phone}
      subjectEmail={letter.subject.email}
      status={letter.status}
      origin={appOrigin()}
    />}

    {letter.status === "RELEASED" || letter.status === "ACKNOWLEDGED" ? <p className="mb-4">
      {/* A plain link, not fetch: the route either streams the PDF or 302s to a
          short-lived presigned URL. */}
      <a className="button button-outline" href={`/api/contracts/${letter.id}/pdf`}>Download the signed PDF</a>
    </p> : null}

    <section className="portal-section">
      <h2 className="portal-section-title">Terms</h2>
      <div className="matrix-scroll">
        <table className="matrix matrix--people">
          <tbody>
            <tr><th scope="row">Employee</th><td>{letter.subject.name} — {letter.subject.email}</td></tr>
            <tr><th scope="row">Position</th><td>{payload.jobTitle}</td></tr>
            <tr><th scope="row">Employment type</th><td>{payload.employmentType}</td></tr>
            <tr><th scope="row">Start date</th><td>{formatDate(payload.startDate)}</td></tr>
            <tr><th scope="row">{formatCompensation(payload).label}</th><td>{formatCompensation(payload).value}</td></tr>
            <tr><th scope="row">Location</th><td>{payload.location}</td></tr>
            {payload.reportingTo ? <tr><th scope="row">Reporting to</th><td>{payload.reportingTo}</td></tr> : null}
            <tr><th scope="row">Notice period</th><td>{payload.noticePeriod}</td></tr>
            {payload.additionalTerms ? <tr><th scope="row">Additional terms</th><td>{payload.additionalTerms}</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>

    {editable && <section className="portal-section">
      <h2 className="portal-section-title">Edit the terms</h2>
      <div className="portal-panel"><ContractForm letterId={letter.id} initial={payload} /></div>
    </section>}

    <section className="portal-section">
      <h2 className="portal-section-title">History</h2>
      <ol className="timeline">
        {letter.events.map((event) => <li key={event.id}>
          <strong>{describeStatus(event.toStatus)}</strong>
          <span>
            {actorNames.get(event.actorId) ?? "Unknown"} · {event.createdAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
          </span>
          {event.note && <p className="timeline-note">“{event.note}”</p>}
        </li>)}
      </ol>
    </section>

    <p><Link className="text-link" href="/contracts">Back to contract letters</Link></p>
  </div>;
}
