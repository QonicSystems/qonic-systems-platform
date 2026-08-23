import { GlobalAgreementResponse } from "@/components/ats/global-agreement-response";

export const metadata = { title: "Global Candidate agreement" };

export default async function GlobalAgreementAcknowledgementPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <GlobalAgreementResponse token={token} />;
}
