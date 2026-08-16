import { describe, expect, it } from "vitest";
import {
  CLIENT_ARCHIVED_STATUS,
  CLIENT_STATUSES,
  CLIENT_STATUS_LABELS,
  PROJECT_ARCHIVED_STATUS,
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  validateClient,
  validateProject,
} from "@/lib/delivery/validate";

const client = (status: string) => ({
  name: "Acme Industries",
  code: "ACME",
  status,
  industry: "",
  website: "",
  ownerId: "",
  notes: "",
});

const project = (status: string) => ({
  name: "Portal Rebuild",
  code: "WEB-01",
  clientId: "client-1",
  status,
  billing: "TIME_AND_MATERIALS",
  budgetAmount: "",
  defaultRate: "",
  startDate: "",
  endDate: "",
  managerId: "",
  notes: "",
  // COMPLETED is the one status that demands a reason.
  completedReason: "Delivered and signed off.",
});

/**
 * A client that has projects, jobs, or invoices cannot be deleted, and the API
 * tells you to archive it instead. That advice used to point at a status the
 * validator rejected — ARCHIVED was in the Prisma enum but missing from
 * CLIENT_STATUSES, so the only route out of a blocked delete was closed.
 */
describe("delivery retirement statuses", () => {
  it("accepts the archived status the client delete guard recommends", () => {
    expect(CLIENT_STATUSES).toContain(CLIENT_ARCHIVED_STATUS);
    expect(validateClient(client(CLIENT_ARCHIVED_STATUS)).data?.status).toBe(CLIENT_ARCHIVED_STATUS);
  });

  it("accepts the cancelled status the project delete guard recommends", () => {
    expect(PROJECT_STATUSES).toContain(PROJECT_ARCHIVED_STATUS);
    expect(validateProject(project(PROJECT_ARCHIVED_STATUS)).data?.status).toBe(PROJECT_ARCHIVED_STATUS);
  });

  it("still rejects a status that is not offered", () => {
    expect(validateClient(client("DELETED")).errors.status).toBeTruthy();
    expect(validateProject(project("ARCHIVED")).errors.status).toBeTruthy();
  });

  it("keeps the previously valid statuses working", () => {
    for (const status of ["ACTIVE", "UPCOMING", "RESCHEDULED", "CANCELLED"]) {
      expect(validateClient(client(status)).data?.status).toBe(status);
    }
    for (const status of ["ACTIVE", "COMPLETED"]) {
      expect(validateProject(project(status)).data?.status).toBe(status);
    }
  });

  it("still demands a reason when a project is completed", () => {
    expect(validateProject({ ...project("COMPLETED"), completedReason: "" }).errors.completedReason).toBeTruthy();
    // Cancelling deliberately does not, so a row action can do it in one click.
    expect(validateProject({ ...project(PROJECT_ARCHIVED_STATUS), completedReason: "" }).data?.status)
      .toBe(PROJECT_ARCHIVED_STATUS);
  });

  it("labels every status it offers", () => {
    for (const status of CLIENT_STATUSES) expect(CLIENT_STATUS_LABELS[status]).toBeTruthy();
    for (const status of PROJECT_STATUSES) expect(PROJECT_STATUS_LABELS[status]).toBeTruthy();
  });
});
