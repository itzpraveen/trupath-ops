"use client";

import { Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PhotoUploader } from "@/components/app/photo-uploader";

type Attachment = { id: string; fileName: string; size: number; createdAt: string };

/** Paperclip on a ledger row: bills, invoices and receipts attached to the entry. */
export function RecordAttachments({ recordId, label, files, editable }: { recordId: string; label: string; files: Attachment[]; editable: boolean }) {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="ghost" size="xs" aria-label={`Attachments for ${label}`} className={files.length ? "" : "text-muted-foreground/60"} />}>
        <Paperclip className="size-3.5" />
        {files.length ? <span className="tabular">{files.length}</span> : null}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Files for {label}</DialogTitle>
          <DialogDescription>Photos or PDFs of the bill, invoice or receipt behind this entry.</DialogDescription>
        </DialogHeader>
        <PhotoUploader kind="expense_bill" refId={recordId} photos={files} editable={editable} />
      </DialogContent>
    </Dialog>
  );
}
