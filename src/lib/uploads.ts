import type { UploadKind } from "@/db/schema";
import type { ModuleKey } from "@/lib/permissions";

/** What each kind of upload is attached to, and which module's permissions govern it. */
export const UPLOAD_KINDS: Record<UploadKind, { module: ModuleKey; label: string }> = {
  dispatch_photo: { module: "dispatch", label: "dispatch photo" },
  jobwork_file: { module: "jobwork", label: "job work file" },
  expense_bill: { module: "sales", label: "bill" },
};

export function isUploadKind(kind: string): kind is UploadKind {
  return Object.hasOwn(UPLOAD_KINDS, kind);
}

export const UPLOAD_MAX_BYTES = 6 * 1024 * 1024;
/** Photos are resized to JPEG in the browser first; HEIC is refused because most browsers cannot show it. */
export const UPLOAD_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
export const UPLOAD_ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";
