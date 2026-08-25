"use client";

import Link from "next/link";
import { EmptyState } from "@/components/portal/empty-state";
import { TableToolbar } from "@/components/portal/table-toolbar";
import { StatusChip } from "@/components/status-chip";
import { describeStatus } from "@/lib/contracts/workflow";
import type { ContractStatus } from "@/lib/generated/prisma/enums";
import { useFilter } from "@/lib/ui/filter";

export type ContractLetterRow = {
  id: string;
  reference: string;
  author: string;
  subject: string;
  jobTitle: string;
  status: ContractStatus;
  updated: string;
};

/** Search stays in the browser because the permitted letter set is already
 * scoped on the server before it reaches this component. */
export function ContractLetterTable({ letters }: { letters: ReadonlyArray<ContractLetterRow> }) {
  const { query, setQuery, rows, isFiltered } = useFilter(letters, (letter) => [
    letter.reference, letter.author, letter.subject, letter.jobTitle, letter.status, letter.updated,
  ]);

  return <>
    <TableToolbar search={query} onSearch={setQuery} placeholder="Search reference, person, position, or status…" label="Search contract letters" />
    {rows.length === 0
      ? <EmptyState message="No contract letters yet." filteredMessage="No contract letters match that search." isFiltered={isFiltered} />
      : <div className="matrix-scroll">
        <table className="matrix matrix--people">
          <thead>
            <tr><th scope="col">Reference</th><th scope="col">Employee</th><th scope="col">Position</th><th scope="col">Status</th><th scope="col">Updated</th></tr>
          </thead>
          <tbody>
            {rows.map((letter) => <tr key={letter.id}>
              <th scope="row">
                <Link className="text-link" href={`/contracts/${letter.id}`}>{letter.reference}</Link>
                <span>Drafted by {letter.author}</span>
              </th>
              <td>{letter.subject}</td>
              <td>{letter.jobTitle}</td>
              <td><StatusChip status={letter.status} label={describeStatus(letter.status)} /></td>
              <td>{letter.updated}</td>
            </tr>)}
          </tbody>
        </table>
      </div>}
  </>;
}
