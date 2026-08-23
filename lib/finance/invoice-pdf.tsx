import { Document, Link, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { PdfLockup, PdfParentMark } from "@/lib/pdf-brand";
import { formatMoney, formatQuantity } from "@/lib/money";

export type InvoiceContext = {
  number: string;
  status: string;
  issueDate: Date;
  dueDate: Date;
  currency: string;
  clientName: string;
  clientAddress?: string | null;
  projectName?: string | null;
  lines: ReadonlyArray<{ description: string; quantity: number; unitRate: number; amount: number }>;
  subtotal: number;
  taxPercent: number;
  taxAmount: number;
  total: number;
  paidAmount: number;
  notes?: string | null;
  paymentUrl?: string | null;
};

export type CreditNoteContext = {
  number: string;
  issuedAt: Date;
  currency: string;
  clientName: string;
  projectName?: string | null;
  invoiceNumber: string;
  invoiceIssueDate: Date;
  invoiceTotal: number;
  creditAmount: number;
  reason: string;
};

const styles = StyleSheet.create({
  page: { paddingTop: 42, paddingBottom: 52, paddingHorizontal: 48, fontSize: 9, lineHeight: 1.45, color: "#252525" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", borderBottomWidth: 2, borderBottomColor: "#FFD700", paddingBottom: 13, marginBottom: 20 },
  documentMeta: { alignItems: "flex-end", minWidth: 150 },
  title: { fontSize: 20, fontWeight: 700, color: "#111111", lineHeight: 1.1, marginTop: 10, marginBottom: 3, textAlign: "right" },
  number: { fontSize: 9.5, fontWeight: 700, color: "#8a6a08", textAlign: "right" },
  void: { marginBottom: 15, borderWidth: 1, borderColor: "#fecaca", backgroundColor: "#fef2f2", padding: 8, color: "#b91c1c", fontSize: 9, fontWeight: 700, textAlign: "center", borderRadius: 3 },
  metaGrid: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#e7e4da", paddingBottom: 15, marginBottom: 16 },
  metaClient: { width: "48%" },
  metaDate: { width: "26%" },
  metaDue: { width: "26%", textAlign: "right" },
  label: { fontSize: 7.25, color: "#777777", textTransform: "uppercase", letterSpacing: 0.85, marginBottom: 4 },
  strong: { fontSize: 10, fontWeight: 700, color: "#111111" },
  muted: { color: "#666666" },
  tableHead: { flexDirection: "row", borderBottomWidth: 1.25, borderBottomColor: "#222222", paddingBottom: 5 },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#e7e4da", paddingVertical: 7 },
  cDesc: { width: "50%" },
  cQty: { width: "12%", textAlign: "right" },
  cRate: { width: "19%", textAlign: "right" },
  cAmt: { width: "19%", textAlign: "right" },
  headCell: { fontSize: 7.25, fontWeight: 700, color: "#222222", textTransform: "uppercase", letterSpacing: 0.25 },
  summaryGrid: { flexDirection: "row", justifyContent: "space-between", marginTop: 20, alignItems: "flex-start" },
  paymentBox: { width: "51%", borderWidth: 1, borderColor: "#e2d5a2", backgroundColor: "#fffdf5", borderRadius: 4, paddingVertical: 10, paddingHorizontal: 11 },
  paymentTitle: { fontSize: 8.5, fontWeight: 700, color: "#594500", marginBottom: 5 },
  paymentText: { fontSize: 7.6, color: "#4a4a4a", marginBottom: 3 },
  payLink: { fontSize: 8, fontWeight: 700, color: "#7a5e00", textDecoration: "underline", marginTop: 5 },
  totals: { width: "41%" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  grand: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1.5, borderTopColor: "#111111", marginTop: 4, paddingTop: 6 },
  grandText: { fontSize: 11, fontWeight: 700, color: "#111111" },
  paid: { marginTop: 14, borderWidth: 1, borderColor: "#b9d8c3", backgroundColor: "#f0f7f2", padding: 7, color: "#1f5c3d", fontSize: 8.5, fontWeight: 700, textAlign: "center", borderRadius: 3 },
  notePanel: { marginTop: 20, borderLeftWidth: 3, borderLeftColor: "#FFD700", backgroundColor: "#faf9f6", paddingVertical: 9, paddingHorizontal: 11 },
  noteTitle: { fontSize: 8, fontWeight: 700, color: "#333333", marginBottom: 3, textTransform: "uppercase", letterSpacing: 0.45 },
  footer: { position: "absolute", bottom: 24, left: 48, right: 48, borderTopWidth: 1, borderTopColor: "#e7e4da", paddingTop: 7, fontSize: 7, color: "#777777", flexDirection: "row", justifyContent: "space-between" },
  creditBanner: { backgroundColor: "#fff8dc", borderWidth: 1, borderColor: "#ead487", borderRadius: 3, padding: 9, marginBottom: 16, fontSize: 8.5, color: "#4f420b" },
  creditReason: { width: "51%", borderWidth: 1, borderColor: "#e7e4da", borderRadius: 3, padding: 10 },
});

const day = (value: Date) => value.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

function DocumentHeader({ label, number }: { label: string; number: string }) {
  return <View style={styles.header}>
    <PdfLockup />
    <View style={styles.documentMeta}>
      <PdfParentMark />
      <Text style={styles.title}>{label}</Text>
      <Text style={styles.number}>{number}</Text>
    </View>
  </View>;
}

function DocumentFooter({ reference }: { reference: string }) {
  return <View style={styles.footer} fixed>
    <Text>QONIC consulting | {reference}</Text>
    <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
  </View>;
}

function InvoiceDocument({ context }: { context: InvoiceContext }) {
  const outstanding = Math.max(0, context.total - context.paidAmount);
  const payUrl = context.paymentUrl || `https://consulting.qonicsystems.com/invoices/${context.number}`;

  return <Document title={`Invoice ${context.number}`} author="QONIC consulting">
    <Page size="A4" style={styles.page}>
      <DocumentHeader label="INVOICE" number={context.number} />
      {context.status === "VOID" ? <Text style={styles.void}>VOID - this invoice has been cancelled and is not payable.</Text> : null}

      <View style={styles.metaGrid}>
        <View style={styles.metaClient}>
          <Text style={styles.label}>Billed to</Text>
          <Text style={styles.strong}>{context.clientName}</Text>
          {context.projectName ? <Text style={styles.muted}>{context.projectName}</Text> : null}
          {context.clientAddress ? <Text style={styles.muted}>{context.clientAddress}</Text> : null}
        </View>
        <View style={styles.metaDate}>
          <Text style={styles.label}>Issued</Text>
          <Text>{day(context.issueDate)}</Text>
        </View>
        <View style={styles.metaDue}>
          <Text style={styles.label}>Due date</Text>
          <Text style={styles.strong}>{day(context.dueDate)}</Text>
        </View>
      </View>

      <View style={styles.tableHead} fixed>
        <Text style={[styles.cDesc, styles.headCell]}>Description</Text>
        <Text style={[styles.cQty, styles.headCell]}>Quantity</Text>
        <Text style={[styles.cRate, styles.headCell]}>Rate</Text>
        <Text style={[styles.cAmt, styles.headCell]}>Amount</Text>
      </View>
      {context.lines.map((line, index) => <View style={styles.row} key={index} wrap={false}>
        <Text style={styles.cDesc}>{line.description}</Text>
        <Text style={styles.cQty}>{formatQuantity(line.quantity)}</Text>
        <Text style={styles.cRate}>{formatMoney(line.unitRate, context.currency)}</Text>
        <Text style={styles.cAmt}>{formatMoney(line.amount, context.currency)}</Text>
      </View>)}

      <View style={styles.summaryGrid} wrap={false}>
        {outstanding > 0 && context.status !== "VOID" ? <View style={styles.paymentBox}>
          <Text style={styles.paymentTitle}>Payment instructions</Text>
          <Text style={styles.paymentText}>Bank: JPMorgan Chase / HDFC Global Commercial</Text>
          <Text style={styles.paymentText}>Beneficiary: Qonic Systems Inc.</Text>
          <Text style={styles.paymentText}>Reference: {context.number}</Text>
          <Link src={payUrl} style={styles.payLink}>Pay this invoice online or view payment options</Link>
        </View> : <View style={{ width: "51%" }} />}
        <View style={styles.totals}>
          <View style={styles.totalRow}><Text>Subtotal</Text><Text>{formatMoney(context.subtotal, context.currency)}</Text></View>
          {context.taxPercent > 0 ? <View style={styles.totalRow}>
            <Text>Tax ({context.taxPercent}%)</Text><Text>{formatMoney(context.taxAmount, context.currency)}</Text>
          </View> : null}
          <View style={styles.grand}>
            <Text style={styles.grandText}>Invoice total</Text>
            <Text style={styles.grandText}>{formatMoney(context.total, context.currency)}</Text>
          </View>
          {context.paidAmount > 0 ? <View style={styles.totalRow}>
            <Text>Received</Text><Text>{formatMoney(context.paidAmount, context.currency)}</Text>
          </View> : null}
          {context.paidAmount > 0 && outstanding > 0 ? <View style={styles.totalRow}>
            <Text>Balance due</Text><Text>{formatMoney(outstanding, context.currency)}</Text>
          </View> : null}
        </View>
      </View>

      {outstanding === 0 && context.status !== "VOID" ? <Text style={styles.paid}>PAID IN FULL - THANK YOU</Text> : null}
      {context.notes ? <View style={styles.notePanel}><Text style={styles.noteTitle}>Notes</Text><Text>{context.notes}</Text></View> : null}
      <DocumentFooter reference={context.number} />
    </Page>
  </Document>;
}

function CreditNoteDocument({ context }: { context: CreditNoteContext }) {
  return <Document title={`Credit note ${context.number}`} author="QONIC consulting">
    <Page size="A4" style={styles.page}>
      <DocumentHeader label="CREDIT NOTE" number={context.number} />
      <Text style={styles.creditBanner}>This credit note reduces the amount due on invoice {context.invoiceNumber}. Keep it with the original invoice for your records.</Text>

      <View style={styles.metaGrid}>
        <View style={styles.metaClient}>
          <Text style={styles.label}>Issued to</Text>
          <Text style={styles.strong}>{context.clientName}</Text>
          {context.projectName ? <Text style={styles.muted}>{context.projectName}</Text> : null}
        </View>
        <View style={styles.metaDate}>
          <Text style={styles.label}>Credit note date</Text>
          <Text>{day(context.issuedAt)}</Text>
        </View>
        <View style={styles.metaDue}>
          <Text style={styles.label}>Original invoice</Text>
          <Text style={styles.strong}>{context.invoiceNumber}</Text>
          <Text style={styles.muted}>{day(context.invoiceIssueDate)}</Text>
        </View>
      </View>

      <View style={styles.tableHead}>
        <Text style={[styles.cDesc, styles.headCell]}>Description</Text>
        <Text style={[styles.cQty, styles.headCell]}>Quantity</Text>
        <Text style={[styles.cRate, styles.headCell]}>Rate</Text>
        <Text style={[styles.cAmt, styles.headCell]}>Credit amount</Text>
      </View>
      <View style={styles.row} wrap={false}>
        <Text style={styles.cDesc}>Credit against invoice {context.invoiceNumber}</Text>
        <Text style={styles.cQty}>1.00</Text>
        <Text style={styles.cRate}>{formatMoney(context.creditAmount, context.currency)}</Text>
        <Text style={styles.cAmt}>-{formatMoney(context.creditAmount, context.currency)}</Text>
      </View>

      <View style={styles.summaryGrid} wrap={false}>
        <View style={styles.creditReason}>
          <Text style={styles.noteTitle}>Reason for credit</Text>
          <Text>{context.reason}</Text>
        </View>
        <View style={styles.totals}>
          <View style={styles.totalRow}><Text>Original invoice total</Text><Text>{formatMoney(context.invoiceTotal, context.currency)}</Text></View>
          <View style={styles.totalRow}><Text>Credit adjustment</Text><Text>-{formatMoney(context.creditAmount, context.currency)}</Text></View>
          <View style={styles.grand}>
            <Text style={styles.grandText}>Credit note total</Text>
            <Text style={styles.grandText}>-{formatMoney(context.creditAmount, context.currency)}</Text>
          </View>
        </View>
      </View>
      <DocumentFooter reference={context.number} />
    </Page>
  </Document>;
}

/** Rendered on demand from the stored figures. Nothing is persisted. */
export function renderInvoicePdf(context: InvoiceContext): Promise<Buffer> {
  return renderToBuffer(<InvoiceDocument context={context} />);
}

/** A formal correction document linked to its original invoice. */
export function renderCreditNotePdf(context: CreditNoteContext): Promise<Buffer> {
  return renderToBuffer(<CreditNoteDocument context={context} />);
}
