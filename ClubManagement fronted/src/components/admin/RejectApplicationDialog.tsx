import { useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function RejectApplicationDialog({
  open,
  applicantLabel,
  pending = false,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  applicantLabel?: string;
  pending?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
}) {
  const [step, setStep] = useState<"confirm" | "reason">("confirm");
  const [reason, setReason] = useState("");

  const reset = () => {
    setStep("confirm");
    setReason("");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="z-[70] max-w-md">
        {step === "confirm" ? (
          <>
            <DialogHeader>
              <DialogTitle>Are you sure you want to reject?</DialogTitle>
              <DialogDescription>
                {applicantLabel
                  ? `This will reject ${applicantLabel}. The applicant will see your reason.`
                  : "The applicant will see your reason."}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                No
              </Button>
              <Button type="button" variant="destructive" onClick={() => setStep("reason")}>
                Yes
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Rejection reason</DialogTitle>
              <DialogDescription>
                Required. This message is shown to the applicant.
              </DialogDescription>
            </DialogHeader>
            <label className="grid gap-1 text-sm">
              <Label htmlFor="reject-reason">Reason</Label>
              <Textarea
                id="reject-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why this application is being rejected"
                rows={4}
              />
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setStep("confirm")}>
                Back
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={pending || reason.trim().length < 5}
                onClick={() => onConfirm(reason.trim())}
              >
                {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                Reject application
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
