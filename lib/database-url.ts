const LEGACY_SSL_MODES = new Set(["prefer", "require", "verify-ca"]);

/**
 * Keeps pg's current certificate-verifying behavior explicit before its next
 * major release changes the meaning of legacy sslmode values. URLs already
 * using another mode are returned byte-for-byte unchanged.
 */
export function normalizeDatabaseUrl(connectionString: string) {
  const url = new URL(connectionString);
  const isPostgres = url.protocol === "postgres:" || url.protocol === "postgresql:";
  const sslMode = url.searchParams.get("sslmode")?.toLowerCase();

  if (!isPostgres || !sslMode || !LEGACY_SSL_MODES.has(sslMode)) {
    return connectionString;
  }

  url.searchParams.set("sslmode", "verify-full");
  return url.toString();
}
