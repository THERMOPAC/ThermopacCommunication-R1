/** Public Vite assets must not perform database-backed session lookups. */
export function isDevAssetRequest(method: string, path: string, environment: string | undefined): boolean {
  if (environment === "production" || !["GET", "HEAD"].includes(method)) return false;
  return path.startsWith("/src/")
    || path.startsWith("/@fs/")
    || path.startsWith("/@id/")
    || path === "/@vite/client"
    || path === "/@vite/env"
    || path === "/@react-refresh";
}