import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { PdfLockup, PdfParentMark } from "@/lib/pdf-brand";
import { formatMoney } from "@/lib/money";

export type EarningInvoicePdfContext = {
  reference: string;
  payeeName: string;
  payeeEmail: string;
  period: Date;
  submittedAt: Date;
  currency: string;
  amount: number;
  source: "DELIVERY_PAYOUT" | "MONTHLY_SALARY";
  status: string;
  notes?: string | null;
  paidAt?: Date | null;
  paymentReference?: string | null;
};

const styles = StyleSheet.create({
  page: { paddingTop: 44, paddingBottom: 54, paddingHorizontal: 48, fontSize: 9, lineHeight: 1.45, color: "#252525" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", borderBottomWidth: 2, borderBottomColor: "#FFD700", paddingBottom: 13, marginBottom: 20 },
  metaRight: { alignItems: "flex-end", minWidth: 155 },
  title: { fontSize: 17, fontWeight: 700, color: "#111111", marginTop: 10, marginBottom: 3, textAlign: "right" },
  reference: { fontSize: 9.5, fontWeight: 700, color: "#8a6a08", textAlign: "right" },
  status: { marginTop: 5, fontSize: 7.5, fontWeight: 700, color: "#555555", letterSpacing: 0.6 },
  grid: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#e7e4da", paddingBottom: 15, marginBottom: 20 },
  person: { width: "50%" }, date: { width: "25%" }, total: { width: "25%", textAlign: "right" },
  label: { fontSize: 7.25, color: "#777777", textTransform: "uppercase", letterSpacing: 0.85, marginBottom: 4 },
  strong: { fontSize: 10, fontWeight: 700, color: "#111111" },
  lineHead: { flexDirection: "row", borderBottomWidth: 1.25, borderBottomColor: "#222222", paddingBottom: 5 },
  line: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#e7e4da", paddingVertical: 9 },
  desc: { width: "65%" }, amt: { width: "35%", textAlign: "right" },
  head: { fontSize: 7.25, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.25 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1.5, borderTopColor: "#111111", marginTop: 18, paddingTop: 7, marginLeft: "50%" },
  totalText: { fontSize: 11, fontWeight: 700, color: "#111111" },
  note: { marginTop: 20, borderLeftWidth: 3, borderLeftColor: "#FFD700", backgroundColor: "#faf9f6", paddingVertical: 9, paddingHorizontal: 11 },
  paid: { marginTop: 16, borderWidth: 1, borderColor: "#b9d8c3", backgroundColor: "#f0f7f2", padding: 8, color: "#1f5c3d", fontSize: 9, fontWeight: 700, textAlign: "center", borderRadius: 3 },
  footer: { position: "absolute", bottom: 24, left: 48, right: 48, borderTopWidth: 1, borderTopColor: "#e7e4da", paddingTop: 7, fontSize: 7, color: "#777777", flexDirection: "row", justifyContent: "space-between" },
});

const day = (value: Date) => value.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const month = (value: Date) => value.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

function EarningInvoiceDocument({ context }: { context: EarningInvoicePdfContext }) {
  const description = context.source === "DELIVERY_PAYOUT"
    ? `Approved delivery payout — ${month(context.period)}`
    : `Monthly compensation — ${month(context.period)}`;
  return <Document title={`Earning invoice ${context.reference}`} author="QONIC systems">
    <Page size="A4" style={styles.page}>
      <View style={styles.header}>
        <PdfLockup />
        <View style={styles.metaRight}>
          <PdfParentMark />
          <Text style={styles.title}>EARNING INVOICE</Text>
          <Text style={styles.reference}>{context.reference}</Text>
          <Text style={styles.status}>{context.status.replaceAll("_", " ")}</Text>
        </View>
      </View>
      <View style={styles.grid}>
        <View style={styles.person}><Text style={styles.label}>Raised by</Text><Text style={styles.strong}>{context.payeeName}</Text><Text>{context.payeeEmail}</Text></View>
        <View style={styles.date}><Text style={styles.label}>Submitted</Text><Text>{day(context.submittedAt)}</Text></View>
        <View style={styles.total}><Text style={styles.label}>Invoice total</Text><Text style={styles.strong}>{formatMoney(context.amount, context.currency)}</Text></View>
      </View>
      <View style={styles.lineHead}><Text style={[styles.desc, styles.head]}>Description</Text><Text style={[styles.amt, styles.head]}>Amount</Text></View>
      <View style={styles.line}><Text style={styles.desc}>{description}</Text><Text style={styles.amt}>{formatMoney(context.amount, context.currency)}</Text></View>
      <View style={styles.totalRow}><Text style={styles.totalText}>Amount due from Qonic Systems</Text><Text style={styles.totalText}>{formatMoney(context.amount, context.currency)}</Text></View>
      {context.paidAt ? <Text style={styles.paid}>PAID {day(context.paidAt)}{context.paymentReference ? ` · Reference ${context.paymentReference}` : ""}</Text> : null}
      {context.notes ? <View style={styles.note}><Text style={styles.head}>Payee note</Text><Text>{context.notes}</Text></View> : null}
      <View style={styles.footer} fixed><Text>QONIC systems | {context.reference} | Company payable</Text><Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} /></View>
    </Page>
  </Document>;
}

export function renderEarningInvoicePdf(context: EarningInvoicePdfContext): Promise<Buffer> {
  return renderToBuffer(<EarningInvoiceDocument context={context} />);
}
