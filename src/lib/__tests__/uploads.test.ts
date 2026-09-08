import { describe, expect, it } from "vitest";
import { MODULES } from "@/lib/permissions";
import { isUploadKind, UPLOAD_KINDS, UPLOAD_TYPES } from "@/lib/uploads";

describe("uploads", () => {
  it("every upload kind is governed by a real module", () => {
    for (const [kind, meta] of Object.entries(UPLOAD_KINDS)) {
      expect(isUploadKind(kind)).toBe(true);
      expect(MODULES[meta.module]).toBeDefined();
      expect(MODULES[meta.module].edit.length).toBeGreaterThan(0);
    }
    expect(isUploadKind("constructor")).toBe(false);
    expect(isUploadKind("anything")).toBe(false);
  });
  it("refuses formats phones and browsers cannot show reliably", () => {
    expect(UPLOAD_TYPES.has("image/heic")).toBe(false);
    expect(UPLOAD_TYPES.has("image/jpeg")).toBe(true);
    expect(UPLOAD_TYPES.has("application/pdf")).toBe(true);
  });
});
