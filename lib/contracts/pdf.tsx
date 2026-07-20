import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { formatDate, formatSalary, type ContractPayload } from "@/lib/contracts/payload";
import { FIELD_LABELS, findTemplate, type LetterTemplate } from "@/lib/contracts/templates";

export type LetterContext = {
  reference: string;
  subjectName: string;
  subjectEmail: string;
  payload: ContractPayload;
  releasedByName: string;
  releasedAt: Date;
  revokedAt?: Date | null;
};

const styles = StyleSheet.create({
  page: { paddingTop: 48, paddingBottom: 56, paddingHorizontal: 52, fontSize: 10, lineHeight: 1.5, color: "#1d2b47" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", borderBottomWidth: 2, borderBottomColor: "#e84218", paddingBottom: 10, marginBottom: 20 },
  brand: { fontSize: 16, fontWeight: 700, color: "#09142e" },
  brandAccent: { color: "#8b96a9", fontWeight: 400 },
  meta: { fontSize: 8.5, color: "#8b96a9", textAlign: "right" },
  title: { fontSize: 15, fontWeight: 700, color: "#09142e", marginBottom: 4 },
  subtitle: { fontSize: 9.5, color: "#8b96a9", marginBottom: 16 },
  paragraph: { marginBottom: 9 },
  sectionTitle: { fontSize: 10.5, fontWeight: 700, color: "#09142e", marginTop: 11, marginBottom: 6 },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#e2e7f0", paddingVertical: 4.5 },
  rowLabel: { width: "38%", color: "#8b96a9" },
  rowValue: { width: "62%", color: "#09142e", fontWeight: 700 },
  signature: { marginTop: 22, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#e2e7f0", flexDirection: "row", justifyContent: "space-between" },
  signatureName: { fontSize: 10.5, fontWeight: 700, color: "#09142e" },
  signatureRole: { fontSize: 8.5, color: "#8b96a9" },
  revoked: { marginBottom: 14, borderWidth: 1, borderColor: "#fecaca", backgroundColor: "#fef2f2", padding: 8, color: "#b91c1c", fontSize: 9.5, fontWeight: 700 },
  footer: { position: "absolute", bottom: 30, left: 52, right: 52, borderTopWidth: 1, borderTopColor: "#e2e7f0", paddingTop: 8, fontSize: 7.5, color: "#8b96a9", flexDirection: "row", justifyContent: "space-between" },
});

function Field({ label, value }: { label: string; value: string }) {
  return <View style={styles.row}><Text style={styles.rowLabel}>{label}</Text><Text style={styles.rowValue}>{value}</Text></View>;
}

function valueFor(field: keyof ContractPayload, payload: ContractPayload): string {
  if (field === "startDate") return formatDate(payload.startDate);
  if (field === "annualSalary") return formatSalary(payload);
  return payload[field] ?? "";
}

function LetterDocument({ template, context }: { template: LetterTemplate; context: LetterContext }) {
  const { payload } = context;
  const firstName = context.subjectName.split(" ")[0];

  return <Document title={`${template.label} ${context.reference}`} author="QONIC consulting">
    <Page size="A4" style={styles.page}>
      <View style={styles.header}>
        <Text style={styles.brand}>QONIC<Text style={styles.brandAccent}> consulting</Text></Text>
        <View>
          <Text style={styles.meta}>Reference: {context.reference}</Text>
          <Text style={styles.meta}>Issued: {formatDate(context.releasedAt.toISOString().slice(0, 10))}</Text>
        </View>
      </View>

      {/* A revoked letter must never be mistaken for a live one. */}
      {context.revokedAt ? <Text style={styles.revoked}>
        REVOKED — this letter was withdrawn on {formatDate(context.revokedAt.toISOString().slice(0, 10))} and is no longer in force.
      </Text> : null}

      <Text style={styles.title}>{template.title}</Text>
      <Text style={styles.subtitle}>Private and confidential — prepared for {context.subjectName}</Text>

      <Text style={styles.paragraph}>{template.intro.replace("{first}", firstName)}</Text>

      <Text style={styles.sectionTitle}>Details</Text>
      <Field label="Employee" value={context.subjectName} />
      <Field label="Email" value={context.subjectEmail} />
      {template.fields.map((field) => {
        const value = valueFor(field, payload);
        return value ? <Field key={field} label={FIELD_LABELS[field]} value={value} /> : null;
      })}

      {payload.additionalTerms ? <>
        <Text style={styles.sectionTitle}>Additional terms</Text>
        <Text style={styles.paragraph}>{payload.additionalTerms}</Text>
      </> : null}

      <Text style={styles.sectionTitle}>{template.requiresAcknowledgement ? "Acceptance" : "Confirmation"}</Text>
      <Text style={styles.paragraph}>{template.closing}</Text>

      <View style={styles.signature} wrap={false}>
        <View>
          <Text style={styles.signatureName}>{context.releasedByName}</Text>
          <Text style={styles.signatureRole}>Released on behalf of QONIC consulting</Text>
        </View>
        <View>
          <Text style={styles.signatureName}>{context.subjectName}</Text>
          <Text style={styles.signatureRole}>
            {template.requiresAcknowledgement ? "Employee — acknowledged in the staff portal" : "Employee"}
          </Text>
        </View>
      </View>

      <View style={styles.footer} fixed>
        <Text>QONIC consulting · {context.reference} · Confidential</Text>
        <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
      </View>
    </Page>
  </Document>;
}

/**
 * Renders a letter on demand. Nothing is persisted: the inputs are the frozen
 * payload and the release metadata, both held in the database.
 */
export function renderLetterPdf(templateKey: string, context: LetterContext): Promise<Buffer> {
  return renderToBuffer(<LetterDocument template={findTemplate(templateKey)} context={context} />);
}
