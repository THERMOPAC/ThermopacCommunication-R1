import { describe, expect, it } from "vitest";
import { isDevAssetRequest } from "../server/utils/dev-asset-request";

describe("development asset session boundary", () => {
  it("skips session lookups for public Vite assets only", () => {
    for (const path of ["/src/hooks/use-toast.ts", "/src/index.css", "/@vite/client", "/@vite/env", "/@react-refresh", "/@fs/project/node_modules/react.js", "/@id/module"]) {
      expect(isDevAssetRequest("GET", path, "development")).toBe(true);
      expect(isDevAssetRequest("HEAD", path, "development")).toBe(true);
      expect(isDevAssetRequest("POST", path, "development")).toBe(false);
      expect(isDevAssetRequest("GET", path, "production")).toBe(false);
    }
  });
  it("retains sessions for every application and API route", () => {
    for (const path of ["/", "/api/user", "/api/ecr-pre-pilot/designs/latest-saved", "/api/src/data", "/auth/google/callback", "/design-software/ecr-pre-pilot-design/stage-2", "/src-admin", "/@vite/private"]) {
      expect(isDevAssetRequest("GET", path, "development")).toBe(false);
    }
  });
});