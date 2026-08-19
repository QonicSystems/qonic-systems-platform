"use client";

import { useMemo, useState } from "react";
import { Avatar } from "@/components/portal/avatar";
import { TechStackBadges } from "@/components/ats/tech-stack-badges";

export type DirectoryPerson = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  jobTitle: string | null;
  photoUrl: string | null;
  techStack: string | null;
  roleLabel: string;
  managerName: string | null;
};

/**
 * Client-side search + role filter over an already-fetched, already
 * permission-checked list — no new endpoint, no client cache library, just
 * local UI state, consistent with how the rest of the portal handles forms.
 */
export function DirectoryList({ people }: { people: DirectoryPerson[] }) {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<string | null>(null);

  const roles = useMemo(() => {
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const person of people) {
      if (!seen.has(person.roleLabel)) { seen.add(person.roleLabel); ordered.push(person.roleLabel); }
    }
    return ordered;
  }, [people]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return people.filter((person) => {
      if (role && person.roleLabel !== role) return false;
      if (!needle) return true;
      return [person.name, person.jobTitle, person.email, person.techStack]
        .some((field) => field?.toLowerCase().includes(needle));
    });
  }, [people, query, role]);

  return <>
    <div className="directory-filters">
      <input
        type="search"
        className="directory-search"
        placeholder="Search by name, title, or skill…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        aria-label="Search the directory"
      />
      <div className="directory-role-tabs" role="group" aria-label="Filter by role">
        <button type="button" className={role === null ? "is-active" : ""} onClick={() => setRole(null)}>
          All <span>{people.length}</span>
        </button>
        {roles.map((label) => <button key={label} type="button" className={role === label ? "is-active" : ""} onClick={() => setRole(label)}>
          {label} <span>{people.filter((person) => person.roleLabel === label).length}</span>
        </button>)}
      </div>
    </div>

    {filtered.length === 0
      ? <p className="portal-note">No one matches “{query}”.</p>
      : <div className="portal-grid">
          {filtered.map((person) => <article key={person.id} className="portal-card portal-card--person">
            <Avatar name={person.name} photoUrl={person.photoUrl} size={64} />
            <div>
              <strong>{person.name}</strong>
              <p>{person.jobTitle ?? person.roleLabel}</p>
              <a className="text-link" href={`mailto:${person.email}`} title={person.email}>{person.email}</a>
              {person.phone && <p className="portal-muted">{person.phone}</p>}
              {person.managerName && <p className="portal-muted">Reports to {person.managerName}</p>}
              {person.techStack && (
                <div className="mt-2">
                  <TechStackBadges stack={person.techStack} />
                </div>
              )}
            </div>
          </article>)}
        </div>}
  </>;
}
