import type { Metadata } from "next";
import { ErrorPage } from "@/components/error-page";

export const metadata: Metadata = { title: "404 — Page not found" };

export default function NotFound() {
  return <ErrorPage code={404} />;
}
