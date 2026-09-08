"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Paperclip, Trash } from "lucide-react";
import { toast } from "sonner";
import type { UploadKind } from "@/db/schema";
import { UPLOAD_ACCEPT } from "@/lib/uploads";
import { Button } from "@/components/ui/button";

type Photo = { id: string; fileName: string; size: number; createdAt: string };

const HINT: Record<UploadKind, string> = {
  dispatch_photo: "Packed parcel, invoice, courier slip.",
  jobwork_file: "Challan, sample photos, the job worker's bill.",
  expense_bill: "Photo or PDF of the bill or invoice.",
};

async function shrink(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bmp = await createImageBitmap(file);
    const max = 1600;
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 900_000) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("resize failed"))), "image/jpeg", 0.82));
  } catch {
    return file;
  }
}

const isHeic = (file: File) => /hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);

export function PhotoUploader({ kind, refId, photos, editable }: { kind: UploadKind; refId: string; photos: Photo[]; editable: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    let ok = 0;
    for (const file of Array.from(files)) {
      try {
        if (isHeic(file)) throw new Error("iPhone HEIC photos are not supported. In the phone's camera settings choose \"Most compatible\", or share the photo as a JPEG.");
        const blob = await shrink(file);
        const fd = new FormData();
        fd.set("kind", kind);
        fd.set("refId", refId);
        fd.set("file", new File([blob], file.name.replace(/\.[^.]+$/, "") + (blob.type === "image/jpeg" ? ".jpg" : file.name.slice(file.name.lastIndexOf("."))), { type: blob.type || file.type }));
        const res = await fetch("/api/uploads", { method: "POST", body: fd });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Upload failed");
        ok++;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed");
      }
    }
    if (ok) toast.success(ok === 1 ? "File added" : `${ok} files added`);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  };

  const remove = async (id: string) => {
    setConfirming(null);
    const res = await fetch(`/api/uploads/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("File removed");
      router.refresh();
    } else {
      const json = await res.json().catch(() => ({}));
      toast.error(json.error ?? "Could not remove the file");
    }
  };

  return (
    <div className="space-y-3">
      {editable ? (
        <div className="flex flex-wrap items-center gap-2">
          {/* no `capture`: the phone offers its camera or the gallery, and PDFs stay selectable */}
          <input ref={inputRef} type="file" accept={UPLOAD_ACCEPT} multiple hidden onChange={(e) => upload(e.target.files)} />
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? <LoaderCircle className="animate-spin" /> : <Paperclip />}
            {busy ? "Uploading…" : "Add photo or PDF"}
          </Button>
          <span className="text-xs text-muted-foreground">{HINT[kind]} Photos are resized before upload.</span>
        </div>
      ) : null}
      {photos.length ? (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {photos.map((p) => (
            <li key={p.id} className="group relative overflow-hidden rounded-lg border bg-muted">
              <a href={`/api/uploads/${p.id}`} target="_blank" rel="noreferrer" className="block aspect-square">
                {p.fileName.toLowerCase().endsWith(".pdf") ? (
                  <span className="grid h-full place-items-center px-2 text-center text-xs text-muted-foreground">PDF · {p.fileName}</span>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/uploads/${p.id}`} alt={p.fileName} className="h-full w-full object-cover" loading="lazy" />
                )}
              </a>
              {editable && confirming === p.id ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/90 p-2 text-center text-xs">
                  <span>Remove this file?</span>
                  <div className="flex gap-1">
                    <Button type="button" size="xs" variant="destructive" onClick={() => remove(p.id)}>
                      Remove
                    </Button>
                    <Button type="button" size="xs" variant="outline" onClick={() => setConfirming(null)}>
                      Keep
                    </Button>
                  </div>
                </div>
              ) : editable ? (
                // always visible on touch screens; on desktop it appears on hover
                <button type="button" onClick={() => setConfirming(p.id)} aria-label={`Remove ${p.fileName}`} className="absolute right-1 top-1 rounded-md bg-background/90 p-1.5 text-destructive shadow md:opacity-0 md:transition-opacity md:group-hover:opacity-100 md:focus-visible:opacity-100">
                  <Trash className="size-3.5" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No files yet.</p>
      )}
    </div>
  );
}
