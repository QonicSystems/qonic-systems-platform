"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CURRENCIES,
  EMPLOYMENT_TYPES,
  emptyContractPayload,
  type ContractPayload,
  type ContractPayloadErrors,
} from "@/lib/contracts/payload";
import { ACTIVE_LETTER_TEMPLATES, DEFAULT_TEMPLATE_KEY } from "@/lib/contracts/templates";

type Employee = { id: string; name: string; roleLabel: string };

const REPORTING_OPTIONS = [
  "CEO & Founder",
  "Co-Founder",
  "Joint (CEO & Founder / Co-Founder)",
] as const;

export function ContractForm({
  employees,
  letterId,
  initial,
  initialSubjectId,
}: {
  employees?: ReadonlyArray<Employee>;
  letterId?: string;
  initial?: ContractPayload;
  initialSubjectId?: string;
}) {
  const router = useRouter();
  const editing = Boolean(letterId);
  const [subjectUserId, setSubjectUserId] = useState(initialSubjectId ?? "");
  const [templateKey, setTemplateKey] = useState(DEFAULT_TEMPLATE_KEY);
  const [data, setData] = useState<ContractPayload>(initial ?? emptyContractPayload);
  const [errors, setErrors] = useState<ContractPayloadErrors>({});
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const update = (key: keyof ContractPayload, value: string) => {
    setData((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("submitting");
    setMessage("");
    try {
      const response = await fetch(editing ? `/api/contracts/${letterId}` : "/api/contracts", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? data : { ...data, subjectUserId, templateKey }),
      });
      const result = (await response.json()) as {
        message?: string;
        errors?: ContractPayloadErrors;
        id?: string;
      };
      if (!response.ok) {
        setErrors(result.errors ?? {});
        setMessage(result.message ?? "Unable to save.");
        setStatus("error");
        return;
      }
      setMessage(result.message ?? "Saved.");
      setStatus("success");
      if (result.id) router.push(`/contracts/${result.id}`);
      router.refresh();
    } catch {
      setMessage("Unable to reach the server.");
      setStatus("error");
    }
  };

  return (
    <form className="contact-form" noValidate onSubmit={submit}>
      {!editing && (
        <div className="mb-5">
          <label htmlFor="templateKey">
            Letter Type <em>*</em>
          </label>
          <select
            id="templateKey"
            value={templateKey}
            onChange={(event) => setTemplateKey(event.target.value)}
          >
            {ACTIVE_LETTER_TEMPLATES.map((template) => (
              <option key={template.key} value={template.key}>
                {template.label}
              </option>
            ))}
          </select>
          <p className="field-hint">
            {ACTIVE_LETTER_TEMPLATES.find((t) => t.key === templateKey)?.description}
          </p>
        </div>
      )}

      {!editing && (
        <div className="mb-5">
          <label htmlFor="subject">
            Employee <em>*</em>
          </label>
          <select
            id="subject"
            value={subjectUserId}
            onChange={(event) => {
              setSubjectUserId(event.target.value);
              setErrors((c) => ({ ...c, subjectUserId: undefined }));
            }}
            aria-invalid={Boolean(errors.subjectUserId)}
          >
            <option value="">Select an employee</option>
            {employees?.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name} — {employee.roleLabel}
              </option>
            ))}
          </select>
          {errors.subjectUserId ? (
            <p className="form-error">{errors.subjectUserId}</p>
          ) : (
            <p className="field-hint">Drafting is restricted to leadership for developer staff.</p>
          )}
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="jobTitle">
            Position <em>*</em>
          </label>
          <input
            id="jobTitle"
            value={data.jobTitle}
            onChange={(event) => update("jobTitle", event.target.value)}
            aria-invalid={Boolean(errors.jobTitle)}
            placeholder="Senior Developer / Software Engineer"
          />
          {errors.jobTitle && <p className="form-error">{errors.jobTitle}</p>}
        </div>
        <div>
          <label htmlFor="employmentType">
            Employment Type <em>*</em>
          </label>
          <select
            id="employmentType"
            value={data.employmentType}
            onChange={(event) => update("employmentType", event.target.value)}
          >
            {EMPLOYMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="startDate">
            Effective / Start Date <em>*</em>
          </label>
          <input
            id="startDate"
            type="date"
            value={data.startDate}
            onChange={(event) => update("startDate", event.target.value)}
            aria-invalid={Boolean(errors.startDate)}
          />
          {errors.startDate && <p className="form-error">{errors.startDate}</p>}
        </div>
        <div>
          <label htmlFor="endDate">End Date / Duration</label>
          <input
            id="endDate"
            value={data.endDate ?? "Till project is running"}
            onChange={(event) => update("endDate", event.target.value)}
            placeholder="Till project is running"
          />
          <p className="field-hint">Defaults to dynamic duration: &ldquo;Till project is running&rdquo;.</p>
        </div>
        <div className="grid grid-cols-[7rem_1fr] gap-3">
          <div>
            <label htmlFor="currency">Currency</label>
            <select
              id="currency"
              value={data.currency}
              onChange={(event) => update("currency", event.target.value)}
            >
              {CURRENCIES.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="annualSalary">
              Annual Compensation <em>*</em>
            </label>
            <input
              id="annualSalary"
              inputMode="numeric"
              value={data.annualSalary}
              onChange={(event) => update("annualSalary", event.target.value)}
              aria-invalid={Boolean(errors.annualSalary)}
            />
            {errors.annualSalary && <p className="form-error">{errors.annualSalary}</p>}
          </div>
        </div>
        <div>
          <label htmlFor="location">
            Work Location <em>*</em>
          </label>
          <input
            id="location"
            value={data.location}
            onChange={(event) => update("location", event.target.value)}
            aria-invalid={Boolean(errors.location)}
            placeholder="Remote / Office"
          />
          {errors.location && <p className="form-error">{errors.location}</p>}
        </div>
        <div>
          <label htmlFor="reportingTo">Reporting To (Founder & Co-Founder)</label>
          <select
            id="reportingTo"
            value={data.reportingTo}
            onChange={(event) => update("reportingTo", event.target.value)}
          >
            {REPORTING_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="noticePeriod">
            Notice Period <em>*</em>
          </label>
          <input
            id="noticePeriod"
            value={data.noticePeriod}
            onChange={(event) => update("noticePeriod", event.target.value)}
            aria-invalid={Boolean(errors.noticePeriod)}
          />
          {errors.noticePeriod && <p className="form-error">{errors.noticePeriod}</p>}
        </div>
      </div>

      <div className="mt-5">
        <label htmlFor="additionalTerms">Additional Terms & Clauses</label>
        <textarea
          id="additionalTerms"
          rows={4}
          value={data.additionalTerms}
          onChange={(event) => update("additionalTerms", event.target.value)}
          placeholder="Client project details, intellectual property assignment, milestone milestones…"
        />
      </div>

      <button className="button button-primary mt-7" type="submit" disabled={status === "submitting"}>
        {status === "submitting" ? "Saving…" : editing ? "Save Draft" : "Create Draft"}
      </button>

      {status !== "idle" && status !== "submitting" && message && (
        <p className={`form-status form-status--${status}`} role="status">
          {message}
        </p>
      )}
    </form>
  );
}
