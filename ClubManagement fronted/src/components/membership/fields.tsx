import { memo, useCallback, useId, useRef, useState } from "react";
import { Loader2, Paperclip, Upload, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { uploadFile } from "@/services/membership/api";
import type { FileRef } from "@/services/membership/schema";
import { kenyaTodayISO } from "@/utils/kenyaDate";

export function FieldShell({
  label,
  error,
  hint,
  required,
  htmlFor,
  className,
  children,
}: {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  required?: boolean | undefined;
  htmlFor?: string | undefined;
  className?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label
        htmlFor={htmlFor}
        className="text-xs font-semibold tracking-wide uppercase text-muted-foreground"
      >
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}

type TextFieldProps = React.ComponentProps<typeof Input> & {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  containerClassName?: string | undefined;
};

export const TextField = memo(function TextField({
  label,
  error,
  hint,
  required,
  containerClassName,
  ...props
}: TextFieldProps) {
  const id = useId();
  const isDate = props.type === "date";
  return (
    <FieldShell
      label={label}
      error={error}
      hint={hint ?? (isDate ? "Kenya date — DD/MM/YYYY (Africa/Nairobi)" : undefined)}
      required={required}
      htmlFor={id}
      className={containerClassName}
    >
      <Input
        id={id}
        aria-invalid={!!error}
        className={cn(error && "border-destructive focus-visible:ring-destructive/40")}
        {...props}
        lang={isDate ? "en-KE" : props.lang}
        max={isDate ? (props.max ?? kenyaTodayISO()) : props.max}
      />
    </FieldShell>
  );
});

/**
 * A select option: a plain string (value === label) or a lookup row
 * ({ code, name }) where the stored value is the code and the label is the name.
 */
export type SelectOption = string | { code: string; name: string };

export const SelectField = memo(function SelectField({
  label,
  error,
  required,
  options,
  placeholder = "Select…",
  ...props
}: React.ComponentProps<"select"> & {
  label: string;
  error?: string | undefined;
  options: readonly SelectOption[];
  placeholder?: string;
}) {
  const id = useId();
  return (
    <FieldShell label={label} error={error} required={required} htmlFor={id}>
      <select
        id={id}
        aria-invalid={!!error}
        className={cn(
          "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40",
          error && "border-destructive",
        )}
        {...props}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => {
          const value = typeof o === "string" ? o : o.code;
          const label = typeof o === "string" ? o : o.name;
          return (
            <option key={value} value={value}>
              {label}
            </option>
          );
        })}
      </select>
    </FieldShell>
  );
});

export const YesNoField = memo(function YesNoField({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  error?: string | undefined;
}) {
  return (
    <FieldShell label={label} error={error}>
      <div className="flex gap-2">
        {[true, false].map((option) => (
          <button
            key={String(option)}
            type="button"
            aria-pressed={value === option}
            onClick={() => onChange(option)}
            className={cn(
              "min-w-20 rounded-md border px-4 py-1.5 text-sm font-medium transition-colors",
              value === option
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input bg-background hover:bg-secondary",
            )}
          >
            {option ? "Yes" : "No"}
          </button>
        ))}
      </div>
    </FieldShell>
  );
});

export const SignatureField = memo(function SignatureField({
  label = "Signature",
  value,
  onChange,
  error,
}: {
  label?: string | undefined;
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
}) {
  const id = useId();
  return (
    <FieldShell
      label={label}
      error={error}
      required
      htmlFor={id}
      hint="Type your full name — this counts as your electronic signature."
    >
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Your full name"
        aria-invalid={!!error}
        className={cn(
          "font-display text-lg italic tracking-wide",
          error && "border-destructive focus-visible:ring-destructive/40",
        )}
      />
    </FieldShell>
  );
});

export const TextareaField = memo(function TextareaField({
  label,
  error,
  hint,
  required,
  rows = 4,
  value,
  onChange,
}: {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  required?: boolean | undefined;
  rows?: number;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
}) {
  const id = useId();
  return (
    <FieldShell label={label} error={error} hint={hint} required={required} htmlFor={id}>
      <Textarea
        id={id}
        rows={rows}
        value={value}
        onChange={onChange}
        aria-invalid={!!error}
        className={cn(error && "border-destructive")}
      />
    </FieldShell>
  );
});

export const FileField = memo(function FileField({
  label,
  purpose,
  accept,
  value,
  onChange,
  error,
  required,
  hint,
}: {
  label: string;
  purpose: string;
  accept: string;
  value: FileRef | null;
  onChange: (value: FileRef | null) => void;
  error?: string | undefined;
  required?: boolean | undefined;
  hint?: string | undefined;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const handleFile = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (file.size > 8 * 1024 * 1024) {
        setFailed("File must be 8 MB or smaller");
        return;
      }
      setFailed(null);
      setBusy(true);
      try {
        onChange(await uploadFile(file, purpose));
      } catch (e) {
        setFailed(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setBusy(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [onChange, purpose],
  );

  return (
    <FieldShell label={label} error={failed ?? error} required={required} hint={hint}>
      <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={handleFile} />
      {value ? (
        <div className="flex items-center gap-2 rounded-md border border-border bg-secondary/60 px-3 py-2 text-sm">
          <Paperclip className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{value.fileName}</span>
          <span className="ml-auto shrink-0 text-xs text-muted-foreground">
            {(value.size / 1024).toFixed(0)} KB
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => onChange(null)}
          >
            <X className="size-4" />
            <span className="sr-only">Remove {value.fileName}</span>
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="w-full justify-start"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          {busy ? "Uploading…" : `Upload ${label.toLowerCase()}`}
        </Button>
      )}
    </FieldShell>
  );
});

export function SectionTitle({ children, note }: { children: React.ReactNode; note?: string }) {
  return (
    <div className="border-b border-border pb-2">
      <h3 className="text-base font-semibold text-foreground">{children}</h3>
      {note && <p className="mt-1 text-sm text-muted-foreground">{note}</p>}
    </div>
  );
}

export const Grid = ({ children, cols = 3 }: { children: React.ReactNode; cols?: 2 | 3 }) => (
  <div
    className={cn("grid gap-4", cols === 2 ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3")}
  >
    {children}
  </div>
);