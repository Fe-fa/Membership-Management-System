import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Loader2, Pencil, Printer, ScrollText } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { readUser } from "@/lib/auth";
import { apiRequest, extractErrorMessage } from "@/services/membership/api";
import { tenantDocumentBrand, useCurrentTenant } from "@/services/tenant";
import { formatKes } from "@/utils/format";
import { buildStatementHtml, printHtmlDocument, type StatementDocument } from "@/utils/financeExport";

export type CorporateCompany = {
  corporateCompanyId: number;
  code: string;
  name: string;
  email: string;
  phone?: string | null;
  kraPin?: string | null;
  isActive: boolean;
};

const emptyForm = {
  code: "",
  name: "",
  email: "",
  phone: "",
  kraPin: "",
};

export function CorporateCompaniesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [statementCompany, setStatementCompany] = useState<CorporateCompany | null>(null);

  const companies = useQuery({
    queryKey: ["finance", "companies"],
    queryFn: () => apiRequest<CorporateCompany[]>("/api/finance/companies"),
    enabled: open,
  });
  const creditReport = useQuery({
    queryKey: ["advance-credit-report-companies"],
    enabled: open,
    queryFn: () => apiRequest<{
      companies: Array<{ name: string; referenceNo?: string | null; credit: number; source?: string | null; status: string }>;
    }>("/api/finance/advance-credit/report"),
  });

  const reset = () => {
    setEditingId(null);
    setForm(emptyForm);
    setFieldError(null);
  };

  const save = useMutation({
    mutationFn: () => {
      const body = {
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || null,
        kraPin: form.kraPin.trim().toUpperCase() || null,
      };
      return apiRequest<CorporateCompany>(
        editingId ? `/api/finance/companies/${editingId}` : "/api/finance/companies",
        { method: editingId ? "PUT" : "POST", body: JSON.stringify(body) },
      );
    },
    onSuccess: () => {
      toast.success(editingId ? "Company updated." : "Corporate company added.");
      reset();
      void queryClient.invalidateQueries({ queryKey: ["finance", "companies"] });
    },
    onError: (error) => setFieldError(extractErrorMessage(error)),
  });

  const toggle = useMutation({
    mutationFn: (company: CorporateCompany) =>
      apiRequest(`/api/finance/companies/${company.corporateCompanyId}/active`, {
        method: "POST",
        body: JSON.stringify({ active: !company.isActive }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["finance", "companies"] });
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  const clientError = validateCompany(form);

  return (
    <>
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="size-5" />
            Corporate companies
          </DialogTitle>
          <DialogDescription>
            Companies that can be billed for a member&apos;s joining fee or annual subscription.
          </DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (clientError) {
              setFieldError(clientError);
              return;
            }
            setFieldError(null);
            save.mutate();
          }}
        >
          <Field label="Code" error={fieldError && !form.code.trim() ? fieldError : undefined}>
            <Input
              value={form.code}
              maxLength={40}
              placeholder="KQ"
              onChange={(event) => setForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))}
            />
          </Field>
          <Field label="Company name">
            <Input
              value={form.name}
              maxLength={200}
              placeholder="Kenya Airways"
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            />
          </Field>
          <Field label="Billing email">
            <Input
              type="email"
              value={form.email}
              placeholder="accounts@company.co.ke"
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
            />
          </Field>
          <Field label="Phone">
            <Input
              value={form.phone}
              maxLength={40}
              placeholder="+254 700 000 000"
              onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
            />
          </Field>
          <Field label="KRA PIN">
            <Input
              value={form.kraPin}
              maxLength={20}
              placeholder="P000000000A"
              onChange={(event) => setForm((current) => ({ ...current, kraPin: event.target.value.toUpperCase() }))}
            />
          </Field>
          <div className="flex items-end gap-2">
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              {editingId ? "Save company" : "Add company"}
            </Button>
            {editingId ? (
              <Button type="button" variant="outline" onClick={reset}>
                Cancel
              </Button>
            ) : null}
          </div>
          {fieldError ? <p className="sm:col-span-2 text-sm text-destructive">{fieldError}</p> : null}
        </form>

        <div className="overflow-hidden rounded-lg border border-slate-200">
          {companies.isLoading ? (
            <p className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading companies…
            </p>
          ) : companies.isError ? (
            <p className="px-4 py-6 text-sm text-destructive">{extractErrorMessage(companies.error)}</p>
          ) : (companies.data ?? []).length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">No corporate companies yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Company</th>
                  <th className="px-3 py-2 font-medium">Billing email</th>
                  <th className="px-3 py-2 font-medium">KRA PIN</th>
                  <th className="px-3 py-2 font-medium">Advance credit</th>
                  <th className="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {(companies.data ?? []).map((company) => {
                  const credit = creditReport.data?.companies.find((row) => row.referenceNo === company.code);
                  return (
                  <tr key={company.corporateCompanyId} className="border-t border-slate-100">
                    <td className="px-3 py-2">
                      <p className="font-medium">{company.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {company.code}
                        {company.phone ? ` · ${company.phone}` : ""}
                        {company.isActive ? "" : " · Inactive"}
                      </p>
                    </td>
                    <td className="px-3 py-2">{company.email}</td>
                    <td className="px-3 py-2">{company.kraPin || "—"}</td>
                    <td className="px-3 py-2">
                      <p className="font-medium tabular-nums">{credit && credit.credit > 0 ? `${formatKes(credit.credit)} CR` : formatKes(0)}</p>
                      <p className="text-xs text-muted-foreground">
                        {credit && credit.credit > 0 ? `${credit.status}${credit.source ? ` · ${credit.source}` : ""}` : "No available credit"}
                      </p>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setStatementCompany(company)}
                        >
                          <ScrollText className="size-3.5" />
                          Statement
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingId(company.corporateCompanyId);
                            setFieldError(null);
                            setForm({
                              code: company.code,
                              name: company.name,
                              email: company.email,
                              phone: company.phone ?? "",
                              kraPin: company.kraPin ?? "",
                            });
                          }}
                        >
                          <Pencil className="size-3.5" />
                          Edit
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={toggle.isPending}
                          onClick={() => toggle.mutate(company)}
                        >
                          {company.isActive ? "Deactivate" : "Activate"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
    <CorporateStatementDialog company={statementCompany} onClose={() => setStatementCompany(null)} />
    </>
  );
}

function yearStart() {
  return `${new Date().getFullYear()}-01-01`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function CorporateStatementDialog({
  company,
  onClose,
}: {
  company: CorporateCompany | null;
  onClose: () => void;
}) {
  const tenant = useCurrentTenant();
  const [from, setFrom] = useState(yearStart);
  const [to, setTo] = useState(todayIso);
  const open = company != null;
  const statement = useQuery({
    queryKey: ["finance", "company-statement", company?.corporateCompanyId, from, to],
    enabled: open && Boolean(from) && Boolean(to) && from <= to,
    queryFn: () =>
      apiRequest<StatementDocument>(
        `/api/finance/companies/${company!.corporateCompanyId}/statement?from=${from}&to=${to}`,
      ),
  });
  const html = statement.data
    ? buildStatementHtml({
        ...statement.data,
        ...tenantDocumentBrand(tenant.data),
        issuedBy: readUser()?.fullName?.trim() || readUser()?.username || "—",
      })
    : "";

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="z-[80] flex h-[min(92vh,56rem)] w-[min(96vw,72rem)] max-w-[72rem] flex-col gap-4 overflow-hidden">
        <DialogHeader>
          <DialogTitle>Corporate statement · {company?.name}</DialogTitle>
          <DialogDescription>
            Invoices billed to this company. A member whose subscription is paid by the company does not see that amount as their own debt.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1">
            <Label htmlFor="company-statement-from">From</Label>
            <Input id="company-statement-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="company-statement-to">To</Label>
            <Input id="company-statement-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </div>
        </div>
        {from > to ? <p className="text-sm text-destructive">End date must be on or after the start date.</p> : null}
        {statement.isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading statement…
          </p>
        ) : statement.isError ? (
          <p className="text-sm text-destructive">{extractErrorMessage(statement.error)}</p>
        ) : (
          <iframe title="Corporate statement" className="min-h-0 w-full flex-1 rounded-xl border border-border bg-white" srcDoc={html} />
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Close</Button>
          <Button
            type="button"
            disabled={!html}
            onClick={() => {
              printHtmlDocument(html);
              toast.success(`Statement for ${company?.name} is ready to print.`);
            }}
          >
            <Printer className="size-4" />
            Print
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      {children}
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </label>
  );
}

function validateCompany(form: typeof emptyForm) {
  if (!/^[A-Z0-9][A-Z0-9-]{1,39}$/.test(form.code.trim().toUpperCase())) {
    return "Code must be 2–40 letters, numbers, or hyphens.";
  }
  if (form.name.trim().length < 2) return "Company name is required.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return "Enter a valid billing email.";
  const pin = form.kraPin.trim();
  if (pin && (pin.length < 8 || pin.length > 20)) return "KRA PIN must be between 8 and 20 characters.";
  return null;
}
