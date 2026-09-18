import { Paperclip } from "lucide-react";

import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/utils/cn";

export function isProofImage(url?: string | null, fileName?: string | null) {
  const hint = `${url ?? ""} ${fileName ?? ""}`.toLowerCase();
  return /\.(png|jpe?g|gif|webp|bmp)(\?|$)/i.test(hint);
}

export function PaymentProofBadge({
  url,
  fileName,
  fallback,
  onView,
}: {
  url?: string | null;
  fileName?: string | null;
  fallback?: string | null;
  onView?: () => void;
}) {
  if (!url) {
    return <span className="text-muted-foreground">{fallback || "—"}</span>;
  }

  const image = isProofImage(url, fileName);
  const label = image ? "View image" : "View file";

  const trigger = (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onView?.();
      }}
      className={cn(
        "inline-flex max-w-[14rem] items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-100",
      )}
    >
      {image ? (
        <img
          src={url}
          alt=""
          className="size-6 shrink-0 rounded object-cover"
        />
      ) : (
        <Paperclip className="size-3.5 shrink-0" />
      )}
      <span className="truncate">{label}</span>
    </button>
  );

  if (!image) return trigger;

  return (
    <HoverCard openDelay={200} closeDelay={80}>
      <HoverCardTrigger asChild>{trigger}</HoverCardTrigger>
      <HoverCardContent className="w-56 p-2" side="left">
        <img src={url} alt={fileName || "Payment proof"} className="max-h-40 w-full rounded object-contain" />
        <p className="mt-1 truncate text-[11px] text-muted-foreground">{fileName || "Payment proof"}</p>
      </HoverCardContent>
    </HoverCard>
  );
}

export function PaymentProofSheet({
  open,
  url,
  fileName,
  title,
  onClose,
}: {
  open: boolean;
  url?: string | null;
  fileName?: string | null;
  title?: string;
  onClose: () => void;
}) {
  const image = Boolean(url && isProofImage(url, fileName));
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent side="right" className="flex w-full flex-col gap-4 sm:max-w-lg">
        <SheetHeader className="pr-8 text-left">
          <SheetTitle>Payment proof</SheetTitle>
          <SheetDescription>{title || fileName || "Uploaded clearance document"}</SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
          {url && image ? (
            <img src={url} alt={fileName || "Payment proof"} className="mx-auto max-h-[70vh] w-auto object-contain" />
          ) : url ? (
            <div className="space-y-3 p-4 text-center text-sm">
              <p className="font-medium">{fileName || "Payment proof"}</p>
              <Button asChild size="sm" variant="outline">
                <a href={url} target="_blank" rel="noreferrer">
                  Open file
                </a>
              </Button>
            </div>
          ) : (
            <p className="p-6 text-center text-sm text-muted-foreground">No file was uploaded for this payment.</p>
          )}
        </div>
        {url ? (
          <Button asChild variant="outline">
            <a href={url} target="_blank" rel="noreferrer">
              Open in new tab
            </a>
          </Button>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
