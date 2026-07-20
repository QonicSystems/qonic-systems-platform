import { NextResponse } from "next/server";
import { can, guardRoute } from "@/lib/auth/guard";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export type SearchHit = { kind: string; label: string; sub: string; href: string };

/**
 * Global search.
 *
 * Every branch is gated on the caller's own permissions, so results can never
 * reveal the existence of something they are not entitled to see — a search box
 * is an easy accidental information leak.
 */
export async function GET(request: Request) {
  const { context, response } = await guardRoute();
  if (response) return response;

  const query = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (query.length < 2) return NextResponse.json({ hits: [] });

  const like = { contains: query, mode: "insensitive" as const };
  const hits: SearchHit[] = [];

  if (can(context, "directory.view")) {
    const people = await db.user.findMany({
      where: { status: "ACTIVE", OR: [{ name: like }, { email: like }, { jobTitle: like }] },
      take: 5, select: { id: true, name: true, email: true, jobTitle: true },
    });
    hits.push(...people.map((person) => ({ kind: "Person", label: person.name, sub: person.jobTitle ?? person.email, href: "/directory" })));
  }

  if (can(context, "client.view")) {
    const clients = await db.client.findMany({ where: { OR: [{ name: like }, { code: like }] }, take: 5, select: { id: true, name: true, code: true } });
    hits.push(...clients.map((client) => ({ kind: "Client", label: client.name, sub: client.code, href: "/clients" })));
  }

  if (can(context, "project.view")) {
    const projects = await db.project.findMany({ where: { OR: [{ name: like }, { code: like }] }, take: 5, include: { client: { select: { name: true } } } });
    hits.push(...projects.map((project) => ({ kind: "Project", label: project.name, sub: `${project.code} · ${project.client.name}`, href: "/projects" })));
  }

  if (can(context, "job.view")) {
    const jobs = await db.job.findMany({ where: { OR: [{ title: like }, { reference: like }] }, take: 5, include: { client: { select: { name: true } } } });
    hits.push(...jobs.map((job) => ({ kind: "Job", label: job.title, sub: `${job.reference} · ${job.client.name}`, href: `/jobs/${job.id}` })));
  }

  if (can(context, "candidate.view")) {
    const candidates = await db.candidate.findMany({
      where: { OR: [{ name: like }, { email: like }, { skills: like }, { headline: like }] },
      take: 5, select: { id: true, name: true, headline: true, email: true },
    });
    hits.push(...candidates.map((candidate) => ({ kind: "Candidate", label: candidate.name, sub: candidate.headline ?? candidate.email, href: "/candidates" })));
  }

  if (can(context, "invoice.view")) {
    const invoices = await db.invoice.findMany({ where: { number: like }, take: 5, include: { client: { select: { name: true } } } });
    hits.push(...invoices.map((invoice) => ({ kind: "Invoice", label: invoice.number, sub: invoice.client.name, href: "/invoices" })));
  }

  // Contract letters: your own always, everyone else's only with the grant.
  const letters = await db.contractLetter.findMany({
    where: {
      reference: like,
      ...(can(context, "contract.view_all") ? {} : { subjectUserId: context.user.id }),
    },
    take: 5, include: { subject: { select: { name: true } } },
  });
  hits.push(...letters.map((letter) => ({ kind: "Contract", label: letter.reference, sub: letter.subject.name, href: `/contracts/${letter.id}` })));

  return NextResponse.json({ hits });
}
