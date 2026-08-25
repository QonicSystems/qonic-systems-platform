import { ConsentResponse } from "@/components/ats/consent-response";

export const metadata = { title: "Profile marketing consent" };

export default async function ConsentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ConsentResponse token={token} />;
}
