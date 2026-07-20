import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
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
};

const styles = StyleSheet.create({
  page: { paddingTop: 48, paddingBottom: 56, paddingHorizontal: 52, fontSize: 9.5, lineHeight: 1.5, color: "#2b2b2b" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", borderBottomWidth: 2, borderBottomColor: "#FFD700", paddingBottom: 10, marginBottom: 18 },
  brand: { fontSize: 16, fontWeight: 700, color: "#111111" },
  brandAccent: { color: "#8a8a8a", fontWeight: 400 },
  meta: { fontSize: 8.5, color: "#8a8a8a", textAlign: "right" },
  title: { fontSize: 20, fontWeight: 700, color: "#111111", marginBottom: 2, textAlign: "right" },
  /// The reference is how this document is identified in correspondence, so it
  /// needs real contrast rather than the muted grey used for supporting text.
  number: { fontSize: 10, fontWeight: 700, color: "#6b5206", textAlign: "right" },
  billTo: { flexDirection: "row", justifyContent: "space-between", marginBottom: 18 },
  label: { fontSize: 7.5, color: "#8a8a8a", textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 },
  strong: { fontSize: 10.5, fontWeight: 700, color: "#111111" },
  tableHead: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#111111", paddingBottom: 5, marginBottom: 2 },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#e7e4da", paddingVertical: 5 },
  cDesc: { width: "52%" },
  cQty: { width: "12%", textAlign: "right" },
  cRate: { width: "18%", textAlign: "right" },
  cAmt: { width: "18%", textAlign: "right" },
  headCell: { fontSize: 8, fontWeight: 700, color: "#111111" },
  totals: { marginTop: 12, marginLeft: "auto", width: "48%" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  grand: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 2, borderTopColor: "#111111", marginTop: 4, paddingTop: 6 },
  grandText: { fontSize: 12, fontWeight: 700, color: "#111111" },
  paid: { marginTop: 14, borderWidth: 1, borderColor: "#cfe3d6", backgroundColor: "#f0f7f2", padding: 8, color: "#1f5c3d", fontSize: 9, fontWeight: 700 },
  void: { marginBottom: 14, borderWidth: 1, borderColor: "#fecaca", backgroundColor: "#fef2f2", padding: 8, color: "#b91c1c", fontSize: 10, fontWeight: 700 },
  notes: { marginTop: 18, fontSize: 8.5, color: "#4f4f4f" },
  footer: { position: "absolute", bottom: 30, left: 52, right: 52, borderTopWidth: 1, borderTopColor: "#e7e4da", paddingTop: 8, fontSize: 7.5, color: "#8a8a8a", flexDirection: "row", justifyContent: "space-between" },
});

const day = (date: Date) => date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

function InvoiceDocument({ context }: { context: InvoiceContext }) {
  const outstanding = context.total - context.paidAmount;
  return <Document title={`Invoice ${context.number}`} author="QONIC consulting">
    <Page size="A4" style={styles.page}>
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>QONIC<Text style={styles.brandAccent}> consulting</Text></Text>
          <Text style={styles.meta}>Global Plaza, Innovation District, Suite 400</Text>
        </View>
        <View>
          <Text style={styles.title}>INVOICE</Text>
          <Text style={styles.number}>{context.number}</Text>
        </View>
      </View>

      {/* A void invoice must never be mistaken for a payable one. */}
      {context.status === "VOID" ? <Text style={styles.void}>VOID — this invoice has been cancelled and is not payable.</Text> : null}

      <View style={styles.billTo}>
        <View>
          <Text style={styles.label}>Billed to</Text>
          <Text style={styles.strong}>{context.clientName}</Text>
          {context.projectName ? <Text>{context.projectName}</Text> : null}
        </View>
        <View>
          <Text style={styles.label}>Issued</Text>
          <Text>{day(context.issueDate)}</Text>
        </View>
        <View>
          <Text style={styles.label}>Due</Text>
          <Text style={styles.strong}>{day(context.dueDate)}</Text>
        </View>
      </View>

      <View style={styles.tableHead}>
        <Text style={[styles.cDesc, styles.headCell]}>Description</Text>
        <Text style={[styles.cQty, styles.headCell]}>Qty</Text>
        <Text style={[styles.cRate, styles.headCell]}>Rate</Text>
        <Text style={[styles.cAmt, styles.headCell]}>Amount</Text>
      </View>
      {context.lines.map((line, index) => <View style={styles.row} key={index}>
        <Text style={styles.cDesc}>{line.description}</Text>
        <Text style={styles.cQty}>{formatQuantity(line.quantity)}</Text>
        <Text style={styles.cRate}>{formatMoney(line.unitRate, context.currency)}</Text>
        <Text style={styles.cAmt}>{formatMoney(line.amount, context.currency)}</Text>
      </View>)}

      <View style={styles.totals}>
        <View style={styles.totalRow}><Text>Subtotal</Text><Text>{formatMoney(context.subtotal, context.currency)}</Text></View>
        {context.taxPercent > 0 ? <View style={styles.totalRow}>
          <Text>Tax ({context.taxPercent}%)</Text><Text>{formatMoney(context.taxAmount, context.currency)}</Text>
        </View> : null}
        <View style={styles.grand}>
          <Text style={styles.grandText}>Total</Text>
          <Text style={styles.grandText}>{formatMoney(context.total, context.currency)}</Text>
        </View>
        {context.paidAmount > 0 ? <View style={styles.totalRow}>
          <Text>Paid</Text><Text>{formatMoney(context.paidAmount, context.currency)}</Text>
        </View> : null}
        {outstanding > 0 && context.paidAmount > 0 ? <View style={styles.totalRow}>
          <Text>Outstanding</Text><Text>{formatMoney(outstanding, context.currency)}</Text>
        </View> : null}
      </View>

      {outstanding <= 0 && context.status !== "VOID" ? <Text style={styles.paid}>PAID IN FULL — thank you.</Text> : null}
      {context.notes ? <Text style={styles.notes}>{context.notes}</Text> : null}

      <View style={styles.footer} fixed>
        <Text>QONIC consulting · {context.number}</Text>
        <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
      </View>
    </Page>
  </Document>;
}

/** Rendered on demand from the stored figures. Nothing is persisted. */
export function renderInvoicePdf(context: InvoiceContext): Promise<Buffer> {
  return renderToBuffer(<InvoiceDocument context={context} />);
}
