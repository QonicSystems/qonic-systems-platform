import { describe, expect, it } from "vitest";
import { normalizeDatabaseUrl } from "@/lib/database-url";

describe("normalizeDatabaseUrl", () => {
  it.each(["prefer", "require", "verify-ca"])("makes legacy sslmode=%s explicitly verify the certificate", (sslMode) => {
    const value = normalizeDatabaseUrl(`postgresql://user:password@db.example.com:5432/qonic?application_name=qonic&sslmode=${sslMode}`);
    const url = new URL(value);

    expect(url.searchParams.get("sslmode")).toBe("verify-full");
    expect(url.searchParams.get("application_name")).toBe("qonic");
  });

  it("leaves explicit secure modes and local URLs untouched", () => {
    const secure = "postgresql://user:password@db.example.com:5432/qonic?sslmode=verify-full";
    const local = "postgresql://user:password@localhost:5432/qonic";

    expect(normalizeDatabaseUrl(secure)).toBe(secure);
    expect(normalizeDatabaseUrl(local)).toBe(local);
  });
});
