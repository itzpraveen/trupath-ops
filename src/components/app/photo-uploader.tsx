"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, LoaderCircle, Trash } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Photo = { id: string; fileName: string; size: number; createdAt: string };

async function shrink(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/") || file.type === "image/heic") return file;
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

export function PhotoUploader({ kind, refId, photos, editable }: { kind: "dispatch_photo" | "jobwork_file"; refId: string; photos: Photo[]; editable: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    let ok = 0;
    for (const file of Array.from(files)) {
      try {
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
    if (ok) toast.success(ok === 1 ? "Photo added" : `${ok} photos added`);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  };

  const remove = async (id: string) => {
    const res = await fetch(`/api/uploads/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Photo removed");
      router.refresh();
    } else toast.error("Could not remove photo");
  };

  return (
    <div className="space-y-3">
      {editable ? (
        <div className="flex items-center gap-2">
          <input ref={inputRef} type="file" accept="image/*,application/pdf" capture="environment" multiple hidden onChange={(e) => upload(e.target.files)} />
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? <LoaderCircle className="animate-spin" /> : <Camera />}
            {busy ? "Uploading…" : "Add photo"}
          </Button>
          <span className="text-xs text-muted-foreground">Packed parcel, invoice, courier slip. Photos are resized before upload.</span>
        </div>
      ) : null}
      {photos.length ? (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {photos.map((p) => (
            <li key={p.id} className="group relative overflow-hidden rounded-lg border bg-muted">
              <a href={`/api/uploads/${p.id}`} target="_blank" rel="noreferrer" className="block aspect-square">
                {p.fileName.toLowerCase().endsWith(".pdf") ? (
                  <span className="grid h-full place-items-center text-xs text-muted-foreground">PDF</span>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/uploads/${p.id}`} alt={p.fileName} className="h-full w-full object-cover" loading="lazy" />
                )}
              </a>
              {editable ? (
                <button type="button" onClick={() => remove(p.id)} aria-label="Remove photo" className="absolute right-1 top-1 rounded-md bg-background/90 p-1 text-destructive opacity-0 shadow transition-opacity group-hover:opacity-100 focus-visible:opacity-100">
                  <Trash className="size-3.5" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No photos yet.</p>
      )}
    </div>
  );
}
