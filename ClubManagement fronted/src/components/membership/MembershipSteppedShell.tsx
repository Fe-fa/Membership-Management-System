import type { ChangeEvent, ReactNode, RefObject } from "react";
import { Link } from "@tanstack/react-router";
import { Camera, Check, List, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { API_BASE } from "@/services/membership/api";

export type MembershipListTo = "/members" | "/existing-members" | "/applications";

export function membershipPhotoSrc(url?: string | null) {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url) || url.startsWith("data:") || url.startsWith("blob:")) return url;
  return `${API_BASE}${url.startsWith("/") ? url : `/${url}`}`;
}

export type MembershipStepChip = {
  key: string;
  short: string;
  index: number;
  done: boolean;
  active: boolean;
  disabled?: boolean;
};

export function MembershipSteppedShell({
  displayName,
  subtitle,
  badge,
  photoUrl,
  photoBusy = false,
  photoInputRef,
  onPhotoPicked,
  showPhotoUpload = true,
  photoError,
  headerActions,
  listTo,
  listSearch,
  listLabel = "Back to List",
  steps,
  onStep,
  notices,
  children,
  readOnly = false,
  footerStart,
  footerEnd,
}: {
  displayName: string;
  subtitle?: string | undefined;
  badge?: string | undefined;
  photoUrl?: string | undefined;
  photoBusy?: boolean | undefined;
  photoInputRef?: RefObject<HTMLInputElement | null> | undefined;
  onPhotoPicked?: ((event: ChangeEvent<HTMLInputElement>) => void) | undefined;
  showPhotoUpload?: boolean | undefined;
  photoError?: string | undefined;
  headerActions?: ReactNode | undefined;
  listTo: MembershipListTo;
  listSearch?: Record<string, string | boolean | undefined> | undefined;
  listLabel?: string | undefined;
  steps: MembershipStepChip[];
  onStep: (key: string) => void;
  notices?: ReactNode | undefined;
  children: ReactNode;
  readOnly?: boolean | undefined;
  footerStart?: ReactNode | undefined;
  footerEnd?: ReactNode | undefined;
}) {
  const backToList = (
    <Button type="button" variant="outline" className="rounded-full bg-white" asChild>
      <Link to={listTo} {...(listSearch ? { search: listSearch as never } : {})}>
        <List className="size-4" />
        {listLabel}
      </Link>
    </Button>
  );

  const stepCols =
    steps.length <= 4
      ? "sm:grid-cols-2 lg:grid-cols-4"
      : steps.length <= 6
        ? "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
        : "sm:grid-cols-2 lg:grid-cols-4";

  function openPhoto() {
    if (!showPhotoUpload) return;
    photoInputRef?.current?.click();
  }

  return (
    <div className="mx-auto w-full max-w-[1080px] space-y-4">
      <section className="overflow-hidden rounded-2xl bg-gradient-to-r from-primary via-primary to-sky px-5 py-5 text-primary-foreground shadow-sm sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <div className="relative shrink-0">
              <button
                type="button"
                className="grid size-[4.5rem] place-items-center overflow-hidden rounded-full bg-white/20 text-sm font-medium text-primary-foreground ring-4 ring-white/25"
                onClick={openPhoto}
                disabled={photoBusy || !showPhotoUpload}
                title={showPhotoUpload ? "Change photo" : undefined}
              >
                {photoUrl ? <img src={photoUrl} alt="" className="size-full object-cover" /> : "?"}
              </button>
              {showPhotoUpload ? (
                <button
                  type="button"
                  className="absolute -bottom-0.5 -right-0.5 grid size-7 place-items-center rounded-full bg-sky text-white shadow-sm"
                  onClick={openPhoto}
                  disabled={photoBusy}
                  aria-label="Upload photo"
                >
                  {photoBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Camera className="size-3.5" />}
                </button>
              ) : null}
              {showPhotoUpload ? (
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => onPhotoPicked?.(event)}
                />
              ) : null}
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold leading-tight sm:text-[1.7rem]">{displayName}</h1>
              {subtitle ? <p className="mt-1 text-sm text-primary-foreground/80">{subtitle}</p> : null}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
            {badge ? (
              <span className="rounded-md border border-white/30 bg-white/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide">
                {badge}
              </span>
            ) : null}
            <div className="flex flex-wrap gap-2 sm:justify-end">
              {headerActions}
              {backToList}
            </div>
          </div>
        </div>
      </section>

      <ol className={cn("grid gap-2", stepCols)}>
        {steps.map((item) => (
          <li key={item.key}>
            <button
              type="button"
              onClick={() => onStep(item.key)}
              disabled={item.disabled}
              className={cn(
                "flex h-full w-full items-center gap-3 rounded-2xl border bg-white px-3 py-3 text-left shadow-sm transition-colors",
                item.active
                  ? "border-primary ring-2 ring-primary/20"
                  : "border-transparent hover:border-border",
                item.disabled && "cursor-not-allowed opacity-70",
              )}
            >
              <span
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold",
                  item.active
                    ? "bg-primary text-primary-foreground"
                    : item.done
                      ? "bg-success text-white"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {item.done && !item.active ? <Check className="size-3.5" /> : item.index + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Step {item.index + 1}
                </span>
                <span className="block truncate text-sm font-semibold text-foreground">{item.short}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>

      {notices}

      <div className="rounded-2xl border border-white bg-white p-5 shadow-sm sm:p-6">
        <fieldset
          disabled={readOnly}
          className={cn(
            "register-member-fields space-y-8 [&_.grid]:lg:!grid-cols-4 [&_h3]:text-xs [&_h3]:font-semibold [&_h3]:uppercase [&_h3]:tracking-[0.14em] [&_h3]:text-primary [&_label]:text-[13px] [&_label]:font-medium [&_label]:normal-case [&_label]:tracking-normal",
            readOnly && "disabled:opacity-100",
          )}
        >
          {photoError ? <p className="text-sm font-medium text-destructive">{photoError}</p> : null}
          {children}
        </fieldset>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {backToList}
          {footerStart}
        </div>
        <div className="flex flex-wrap items-center gap-2">{footerEnd}</div>
      </div>
    </div>
  );
}
