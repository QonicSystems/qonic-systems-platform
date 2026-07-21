"use client";

import { ErrorPage } from "@/components/error-page";
import "@/app/globals.css";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body>
        <ErrorPage code={500} reset={reset} />
      </body>
    </html>
  );
}
