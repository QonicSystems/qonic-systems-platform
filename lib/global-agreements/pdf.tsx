import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { PdfLockup, PdfParentMark } from "@/lib/pdf-brand";
import { dateLabel, type GlobalCandidateAgreementPayload } from "@/lib/global-agreements/payload";

export type GlobalCandidateAgreementContext = {
  reference: string;
  issuedAt: Date;
  payload: GlobalCandidateAgreementPayload;
};

const styles = StyleSheet.create({
  page: { paddingTop: 44, paddingBottom: 54, paddingHorizontal: 48, fontSize: 9, lineHeight: 1.45, color: "#252525" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", borderBottomWidth: 2, borderBottomColor: "#FFD700", paddingBottom: 13, marginBottom: 20 },
  documentMeta: { alignItems: "flex-end", minWidth: 160 },
  title: { fontSize: 15, fontWeight: 700, color: "#111111", marginTop: 10, marginBottom: 3, textAlign: "right" },
  reference: { fontSize: 9, fontWeight: 700, color: "#8a6a08", textAlign: "right" },
  subtitle: { fontSize: 9.5, color: "#666666", marginBottom: 16 },
  paragraph: { marginBottom: 9 },
  sectionTitle: { fontSize: 10.5, fontWeight: 700, color: "#111111", marginTop: 12, marginBottom: 6 },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#e7e4da", paddingVertical: 5 },
  rowLabel: { width: "36%", color: "#666666" },
  rowValue: { width: "64%", color: "#111111", fontWeight: 700 },
  callout: { borderLeftWidth: 3, borderLeftColor: "#FFD700", backgroundColor: "#faf9f6", paddingVertical: 9, paddingHorizontal: 11, marginTop: 11 },
  footer: { position: "absolute", bottom: 24, left: 48, right: 48, borderTopWidth: 1, borderTopColor: "#e7e4da", paddingTop: 7, fontSize: 7, color: "#777777", flexDirection: "row", justifyContent: "space-between" },
});

function Field({ label, value }: { label: string; value: string }) {
  return <View style={styles.row}><Text style={styles.rowLabel}>{label}</Text><Text style={styles.rowValue}>{value}</Text></View>;
}

function AgreementDocument({ context }: { context: GlobalCandidateAgreementContext }) {
  const { payload } = context;
  const issued = context.issuedAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

  return <Document title={`Global Candidate Agreement ${context.reference}`} author="QONIC consulting">
    <Page size="A4" style={styles.page}>
      <View style={styles.header}>
        <PdfLockup />
        <View style={styles.documentMeta}>
          <PdfParentMark />
          <Text style={styles.title}>GLOBAL CANDIDATE AGREEMENT</Text>
          <Text style={styles.reference}>{context.reference}</Text>
        </View>
      </View>

      <Text style={styles.subtitle}>Master Representation and Commission Agreement | Issued {issued}</Text>
      <Text style={styles.paragraph}>Dear {payload.candidateName}, this master agreement confirms the terms under which QONIC consulting may represent your professional profile for relevant client opportunities. It does not create employment, a QONIC Systems portal account, or a guarantee of placement.</Text>

      <Text style={styles.sectionTitle}>Candidate profile</Text>
      <Field label="Candidate" value={payload.candidateName} />
      <Field label="Contact email" value={payload.candidateEmail} />
      {payload.location ? <Field label="Location" value={payload.location} /> : null}
      {payload.skills ? <Field label="Professional profile" value={payload.skills} /> : null}

      <Text style={styles.sectionTitle}>Visa and work-authorisation declaration</Text>
      <Field label="Visa type" value={payload.visaType || "Not supplied"} />
      <Field label="Visa status" value={payload.visaStatus || "Not supplied"} />
      <Field label="Visa expiry" value={dateLabel(payload.visaExpiry)} />
      <Text style={styles.paragraph}>You confirm that the information above is accurate and will notify QONIC consulting if your work-authorisation status changes. Sensitive identifiers and document numbers are intentionally not included in this agreement.</Text>

      <Text style={styles.sectionTitle}>Representation and commission terms</Text>
      <View style={styles.callout}><Text>{payload.commissionTerms}</Text></View>
      <View style={styles.callout}><Text>{payload.paymentTerms}</Text></View>
      <Text style={styles.paragraph}>Client-specific commercial amounts, rates, and commission percentages must be recorded in the applicable client commission schedule. They are not implied by this master agreement.</Text>

      {payload.additionalTerms ? <><Text style={styles.sectionTitle}>Additional terms</Text><Text style={styles.paragraph}>{payload.additionalTerms}</Text></> : null}

      <Text style={styles.sectionTitle}>Confirmation</Text>
      <Text style={styles.paragraph}>By acknowledging this agreement using the secure link in the accompanying email, you authorise QONIC consulting to represent your profile under these terms and confirm that you understand the data-consent and commission conditions described above.</Text>

      <View style={styles.footer} fixed>
        <Text>QONIC consulting | {context.reference} | Confidential</Text>
        <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
      </View>
    </Page>
  </Document>;
}

export function renderGlobalCandidateAgreementPdf(context: GlobalCandidateAgreementContext): Promise<Buffer> {
  return renderToBuffer(<AgreementDocument context={context} />);
}
