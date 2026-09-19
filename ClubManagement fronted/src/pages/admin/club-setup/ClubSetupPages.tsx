import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { ClubSetupListing } from "@/components/admin/ClubSetupListing";
import { PageFrame } from "@/components/layout/PageFrame";
import { PageDataGate } from "@/components/layout/PageLoading";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  deleteClubCompany,
  deleteClubDesignation,
  listClubCompanies,
  listClubCountries,
  listClubDesignations,
  saveClubCompany,
  saveClubCountry,
  saveClubDesignation,
  type ClubSetupCompany,
  type ClubSetupCountry,
  type ClubSetupDesignation,
} from "@/services/admin/clubSetup";
import { extractErrorMessage } from "@/services/membership/api";
import { tenantQueryKey } from "@/services/tenant";
import { clubLogoUrl } from "@/utils/clubLogo";

function dash(value?: string | null) {
  return value?.trim() || "—";
}

export function CountryListingsPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ClubSetupCountry | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("");

  const list = useQuery({ queryKey: ["club-setup", "countries"], queryFn: listClubCountries });

  const save = useMutation({
    mutationFn: () =>
      saveClubCountry(
        { countryCode: code, countryName: name, currencyDescription: currency },
        editing?.id,
      ),
    onSuccess: () => {
      toast.success(editing ? "Country updated." : "Country created.");
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["club-setup", "countries"] });
      void queryClient.invalidateQueries({ queryKey: tenantQueryKey });
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  function startCreate() {
    setEditing(null);
    setCode("");
    setName("");
    setCurrency("");
    setOpen(true);
  }

  function startEdit(row: ClubSetupCountry) {
    setEditing(row);
    setCode(row.countryCode);
    setName(row.countryName);
    setCurrency(row.currencyDescription ?? "");
    setOpen(true);
  }

  return (
    <PageFrame width="lg" className="max-w-[1400px]">
      <PageDataGate loading={list.isLoading} label="Loading countries…" minHeightClassName="min-h-[20rem]">
        <ClubSetupListing
          title="Country Listings"
          rows={list.data ?? []}
          rowKey={(row) => row.id}
          searchText={(row) => `${row.countryCode} ${row.countryName} ${row.currencyDescription ?? ""}`}
          onCreate={startCreate}
          onEdit={startEdit}
          columns={[
            { key: "code", header: "Country Code", render: (row) => row.countryCode },
            { key: "name", header: "Country Name", render: (row) => row.countryName },
            { key: "currency", header: "Currency Description", render: (row) => dash(row.currencyDescription) },
          ]}
        />
      </PageDataGate>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit country" : "Create country"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <Field label="Country code" value={code} onChange={setCode} />
            <Field label="Country name" value={name} onChange={setName} />
            <Field label="Currency description" value={currency} onChange={setCurrency} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={save.isPending} onClick={() => save.mutate()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageFrame>
  );
}

export function CompanyListingsPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ClubSetupCompany | null>(null);
  const [draft, setDraft] = useState<Omit<ClubSetupCompany, "id">>({
    logoUrl: "",
    companyCode: "",
    companyName: "",
    slug: "",
    payrollName: "",
    postalAddress: "",
    physicalLocation: "",
    town: "",
    pinNumber: "",
    countryId: null,
  });

  const list = useQuery({ queryKey: ["club-setup", "companies"], queryFn: listClubCompanies });
  const countries = useQuery({ queryKey: ["club-setup", "countries"], queryFn: listClubCountries });

  const save = useMutation({
    mutationFn: () => saveClubCompany(draft, editing?.id),
    onSuccess: () => {
      toast.success(editing ? "Company updated." : "Company created.");
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["club-setup", "companies"] });
      void queryClient.invalidateQueries({ queryKey: tenantQueryKey });
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteClubCompany(id),
    onSuccess: () => {
      toast.success("Company deactivated.");
      void queryClient.invalidateQueries({ queryKey: ["club-setup", "companies"] });
      void queryClient.invalidateQueries({ queryKey: tenantQueryKey });
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  function startCreate() {
    setEditing(null);
    setDraft({
      logoUrl: "",
      companyCode: "",
      companyName: "",
      slug: "",
      payrollName: "",
      postalAddress: "",
      physicalLocation: "",
      town: "",
      pinNumber: "",
      countryId: null,
    });
    setOpen(true);
  }

  function startEdit(row: ClubSetupCompany) {
    setEditing(row);
    setDraft({
      logoUrl: row.logoUrl ?? "",
      companyCode: row.companyCode,
      companyName: row.companyName,
      slug: row.slug ?? "",
      payrollName: row.payrollName ?? "",
      postalAddress: row.postalAddress ?? "",
      physicalLocation: row.physicalLocation ?? "",
      town: row.town ?? "",
      pinNumber: row.pinNumber ?? "",
      countryId: row.countryId ?? null,
    });
    setOpen(true);
  }

  const searchText = useMemo(
    () => (row: ClubSetupCompany) =>
      `${row.companyCode} ${row.companyName} ${row.payrollName ?? ""} ${row.town ?? ""} ${row.pinNumber ?? ""} ${row.countryName ?? ""}`,
    [],
  );

  return (
    <PageFrame width="lg" className="max-w-[1400px]">
      <PageDataGate loading={list.isLoading} label="Loading companies…" minHeightClassName="min-h-[20rem]">
        <ClubSetupListing
          title="Company Listings"
          rows={list.data ?? []}
          rowKey={(row) => row.id}
          searchText={searchText}
          onCreate={startCreate}
          onEdit={startEdit}
          onDelete={(row) => remove.mutate(row.id)}
          deleteDisabled={(row) => row.companyCode.toUpperCase() === "ACEA"}
          columns={[
            {
              key: "logo",
              header: "Logo",
              render: (row) => (
                <img
                  src={row.logoUrl || clubLogoUrl()}
                  alt=""
                  className="size-9 rounded object-contain"
                />
              ),
            },
            { key: "code", header: "Company Code", render: (row) => row.companyCode },
            { key: "name", header: "Company Name", render: (row) => row.companyName },
            { key: "slug", header: "Apply slug", render: (row) => row.slug || "—" },
            { key: "payroll", header: "Payroll Name", render: (row) => dash(row.payrollName) },
            { key: "postal", header: "Postal Address", render: (row) => dash(row.postalAddress) },
            { key: "location", header: "Physical Location", render: (row) => dash(row.physicalLocation) },
            { key: "town", header: "Town", render: (row) => dash(row.town) },
            { key: "country", header: "Country", render: (row) => dash(row.countryName) },
            { key: "pin", header: "Pin Number", render: (row) => dash(row.pinNumber) },
          ]}
        />
      </PageDataGate>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit company" : "Create company"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Company code"
              value={draft.companyCode ?? ""}
              onChange={(value) => setDraft((current) => ({ ...current, companyCode: value }))}
            />
            <Field
              label="Company name"
              value={draft.companyName ?? ""}
              onChange={(value) => setDraft((current) => ({ ...current, companyName: value }))}
            />
            <Field
              label="Apply slug"
              value={draft.slug ?? ""}
              onChange={(value) => setDraft((current) => ({ ...current, slug: value }))}
            />
            <Field
              label="Payroll name"
              value={draft.payrollName ?? ""}
              onChange={(value) => setDraft((current) => ({ ...current, payrollName: value }))}
            />
            <Field
              label="Pin number"
              value={draft.pinNumber ?? ""}
              onChange={(value) => setDraft((current) => ({ ...current, pinNumber: value }))}
            />
            <Field
              label="Postal address"
              value={draft.postalAddress ?? ""}
              onChange={(value) => setDraft((current) => ({ ...current, postalAddress: value }))}
            />
            <Field
              label="Physical location"
              value={draft.physicalLocation ?? ""}
              onChange={(value) => setDraft((current) => ({ ...current, physicalLocation: value }))}
            />
            <Field
              label="Town"
              value={draft.town ?? ""}
              onChange={(value) => setDraft((current) => ({ ...current, town: value }))}
            />
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Country</span>
              <select
                className="h-9 rounded-md border border-slate-200 bg-white px-3"
                value={draft.countryId ?? ""}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    countryId: event.target.value ? Number(event.target.value) : null,
                  }))
                }
              >
                <option value="">Select country</option>
                {(countries.data ?? []).map((country) => (
                  <option key={country.id} value={country.id}>
                    {country.countryName}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Logo</span>
              <input
                type="file"
                accept="image/*"
                className="text-sm"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  if (file.size > 200_000) {
                    toast.error("Logo must be under 200 KB.");
                    return;
                  }
                  const reader = new FileReader();
                  reader.onload = () =>
                    setDraft((current) => ({ ...current, logoUrl: String(reader.result ?? "") }));
                  reader.readAsDataURL(file);
                }}
              />
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={save.isPending} onClick={() => save.mutate()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageFrame>
  );
}

export function DesignationListingsPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ClubSetupDesignation | null>(null);
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [active, setActive] = useState(true);
  const [companyId, setCompanyId] = useState<number | null>(null);

  const list = useQuery({ queryKey: ["club-setup", "designations"], queryFn: listClubDesignations });
  const companies = useQuery({ queryKey: ["club-setup", "companies"], queryFn: listClubCompanies });

  const save = useMutation({
    mutationFn: () =>
      saveClubDesignation(
        { designationCode: code, description, isActive: active, companyId, isGlobal: companyId == null, isProtected: false },
        editing?.id,
      ),
    onSuccess: () => {
      toast.success(editing ? "Designation updated." : "Designation created.");
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["club-setup", "designations"] });
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteClubDesignation(id),
    onSuccess: () => {
      toast.success("Designation removed.");
      void queryClient.invalidateQueries({ queryKey: ["club-setup", "designations"] });
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  function startCreate() {
    setEditing(null);
    setCode("");
    setDescription("");
    setActive(true);
    setCompanyId(null);
    setOpen(true);
  }

  function startEdit(row: ClubSetupDesignation) {
    setEditing(row);
    setCode(row.designationCode);
    setDescription(row.description);
    setActive(row.isActive);
    setCompanyId(row.companyId ?? null);
    setOpen(true);
  }

  return (
    <PageFrame width="lg" className="max-w-[1400px]">
      <PageDataGate loading={list.isLoading} label="Loading designations…" minHeightClassName="min-h-[20rem]">
        <ClubSetupListing
          title="Designation Listings"
          rows={list.data ?? []}
          rowKey={(row) => row.id}
          searchText={(row) => `${row.designationCode} ${row.description} ${row.companyName ?? "Global"}`}
          onCreate={startCreate}
          onEdit={startEdit}
          onDelete={(row) => remove.mutate(row.id)}
          columns={[
            { key: "code", header: "Designation Code", render: (row) => row.designationCode },
            { key: "description", header: "Designation Description", render: (row) => row.description },
            { key: "company", header: "Company", render: (row) => (row.isGlobal ? "Global" : dash(row.companyName)) },
            { key: "active", header: "Active", render: (row) => (row.isActive ? "Y" : "N") },
          ]}
        />
      </PageDataGate>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit designation" : "Create designation"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <Field label="Designation code" value={code} onChange={setCode} disabled={Boolean(editing?.isProtected)} />
            <Field label="Designation description" value={description} onChange={setDescription} />
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Company scope</span>
              <select
                className="h-9 rounded-md border border-slate-200 bg-white px-3"
                value={companyId ?? ""}
                disabled={Boolean(editing?.isProtected)}
                onChange={(event) => setCompanyId(event.target.value ? Number(event.target.value) : null)}
              >
                <option value="">Global (all companies)</option>
                {(companies.data ?? []).map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.companyName}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
              Active
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={save.isPending} onClick={() => save.mutate()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageFrame>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <Input value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}
