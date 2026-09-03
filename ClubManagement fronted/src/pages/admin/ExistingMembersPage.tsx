import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Loader2, Pencil, Plus, Trash2, UserPlus, UserRound } from "lucide-react";
import { toast } from "sonner";

import { ListPagination } from "@/components/common/ListPagination";
import { PageBackLink, PageFrame, PageHeader } from "@/components/layout/PageFrame";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  formatMembershipDate,
  privilegeLabels,
  type LookupRow,
  type MemberRow,
  type MembershipTypeRow,
} from "@/services/admin/membershipDesk";
import { apiRequest, extractErrorMessage } from "@/services/membership/api";
import { DEFAULT_PAGE_SIZE, emptyPage, pagedQuery, type PagedResult } from "@/lib/pagination";
import { cn } from "@/utils/cn";

const routeApi = getRouteApi("/existing-members/");

export function ExistingMembersPage() {
  const { tab } = routeApi.useSearch();
  const navigate = useNavigate({ from: "/existing-members/" });

  return (
    <PageFrame width="lg">
      <PageBackLink to="/admin" label="Back to admin dashboard" />
      <PageHeader
        title="Existing members"
      />
      <Tabs
        value={tab}
        onValueChange={(value) => {
          void navigate({
            search: { tab: value as "register" | "privileges" },
          });
        }}
      >
        <TabsList className="h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="register">Existing members</TabsTrigger>
          <TabsTrigger value="privileges">Privileges</TabsTrigger>
        </TabsList>
        <TabsContent value="register" className="mt-5">
          <ExistingMembersPanel />
        </TabsContent>
        <TabsContent value="privileges" className="mt-5">
          <PrivilegesPanel />
        </TabsContent>
      </Tabs>
    </PageFrame>
  );
}

function ExistingMembersPanel() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [invite, setInvite] = useState<{ username: string; inviteUrl: string; emailSent: boolean } | null>(null);

  const members = useQuery({
    queryKey: ["members", search, page, pageSize],
    queryFn: () =>
      apiRequest<PagedResult<MemberRow>>(
        `/api/membership-accounts?${pagedQuery({
          page,
          pageSize,
          search: search.trim() || undefined,
        })}`,
      ),
  });
  const types = useQuery({
    queryKey: ["membership-types"],
    queryFn: () => apiRequest<MembershipTypeRow[]>("/api/membership-types"),
  });

  const changeType = useMutation({
    mutationFn: ({ accountId, membershipTypeId }: { accountId: number; membershipTypeId: number }) =>
      apiRequest(`/api/membership-accounts/${accountId}/type`, {
        method: "POST",
        body: JSON.stringify({ membershipTypeId, reason: "Privilege assignment via membership class" }),
      }),
    onSuccess: () => {
      toast.success("Member class updated. Privileges now follow that class.");
      void queryClient.invalidateQueries({ queryKey: ["members"] });
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  const inviteMember = useMutation({
    mutationFn: (accountId: number) =>
      apiRequest<{ username: string; inviteUrl: string; emailSent: boolean }>(
        `/api/membership-accounts/${accountId}/portal-invite`,
        { method: "POST" },
      ),
    onSuccess: (result) => {
      setInvite(result);
      toast.success(
        result.emailSent
          ? "Portal invite sent."
          : "Invite created. Copy the link — SMTP is not configured yet.",
      );
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  const deactivate = useMutation({
    mutationFn: (accountId: number) =>
      apiRequest(`/api/membership-accounts/${accountId}/deactivate`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Member deactivated.");
      void queryClient.invalidateQueries({ queryKey: ["members"] });
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: (accountId: number) =>
      apiRequest(`/api/membership-accounts/${accountId}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Member deleted.");
      void queryClient.invalidateQueries({ queryKey: ["members"] });
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  const pageData = members.data ?? emptyPage<MemberRow>(page, pageSize);
  const rows = pageData.items;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          value={search}
          onChange={(event) => {
            setPage(1);
            setSearch(event.target.value);
          }}
          placeholder="Search name, membership no., or email"
          className="sm:max-w-sm"
        />
        <Button asChild>
          <Link to="/register-member">
            <UserPlus className="size-4" />
            Register member
          </Link>
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[920px] text-sm">
          <thead className="bg-secondary/60 text-left">
            <tr>
              {["Member", "Class", "Status", "Joined", "Arrears", "Actions"].map((heading) => (
                <th key={heading} className="px-4 py-3 font-medium">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members.isLoading ? (
              <tr>
                <td className="px-4 py-6 text-muted-foreground" colSpan={6}>
                  Loading members…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-muted-foreground" colSpan={6}>
                  No members yet. Register a legacy member or elect an applicant.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const mark = row.fullName
                  .split(/\s+/)
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((part) => part[0])
                  .join("")
                  .toUpperCase();
                const inactive = /inactive|removed|posted/i.test(row.status);
                return (
                  <tr key={row.accountId} className="border-t border-border">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold">
                          {mark || <UserRound className="size-4" />}
                        </div>
                        <div>
                          <p className="font-medium leading-tight">{row.fullName}</p>
                          <p className="text-xs text-muted-foreground">Membership No. {row.membershipNo}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">{row.membershipType}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium",
                          inactive
                            ? "border-red-200 bg-red-50 text-red-700"
                            : "border-emerald-200 bg-emerald-50 text-emerald-800",
                        )}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{formatMembershipDate(row.joinedDate)}</td>
                    <td className="px-4 py-3">{row.outstandingArrears.toLocaleString("en-KE")}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button asChild size="sm" variant="outline">
                          <Link
                            to="/existing-members/$accountId"
                            params={{ accountId: String(row.accountId) }}
                            search={{ mode: "view" }}
                          >
                            View details
                          </Link>
                        </Button>
                        <Button asChild size="icon" variant="outline" className="size-8" title="Edit / update">
                          <Link
                            to="/existing-members/$accountId"
                            params={{ accountId: String(row.accountId) }}
                            search={{ mode: "edit" }}
                          >
                            <Pencil className="size-4" />
                          </Link>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={inactive || deactivate.isPending}
                          onClick={() => deactivate.mutate(row.accountId)}
                        >
                          Deactivate
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8 text-destructive"
                          title="Delete"
                          disabled={remove.isPending}
                          onClick={() => {
                            if (window.confirm(`Delete ${row.fullName} (${row.membershipNo}) from the register?`)) {
                              remove.mutate(row.accountId);
                            }
                          }}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <ListPagination
        page={page}
        pageSize={pageSize}
        totalCount={pageData.totalCount}
        totalPages={pageData.totalPages}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />

      <RegisterMemberDialog
        open={registerOpen}
        onOpenChange={setRegisterOpen}
        types={types.data ?? []}
        onInvite={(result) => setInvite(result)}
      />
      <PortalInviteDialog invite={invite} onClose={() => setInvite(null)} />
    </div>
  );
}

function RegisterMemberDialog({
  open,
  onOpenChange,
  types,
  onInvite,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  types: MembershipTypeRow[];
  onInvite: (invite: { username: string; inviteUrl: string; emailSent: boolean }) => void;
}) {
  const queryClient = useQueryClient();
  const elections = useQuery({
    queryKey: ["lookups", "election-types"],
    queryFn: () => apiRequest<LookupRow[]>("/api/lookups/election-types"),
    enabled: open,
  });

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    mobile: "",
    membershipNo: "",
    membershipTypeId: 0,
    electionTypeId: 0,
    joinedDate: "2018-01-01",
  });

  const selectedTypeId = form.membershipTypeId || types[0]?.membershipTypeId || 0;
  const selectedElectionId = form.electionTypeId || elections.data?.[0]?.id || 1;
  const selectedType = types.find((type) => type.membershipTypeId === selectedTypeId);

  const save = useMutation({
    mutationFn: () =>
      apiRequest<{
        member: MemberRow;
        username: string;
        inviteUrl: string;
        emailSent: boolean;
      }>("/api/membership-accounts/register-existing", {
        method: "POST",
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          mobile: form.mobile || null,
          membershipNo: form.membershipNo,
          membershipTypeId: selectedTypeId,
          electionTypeId: selectedElectionId,
          joinedDate: form.joinedDate,
        }),
      }),
    onSuccess: (result) => {
      toast.success(
        result.emailSent
          ? `Member registered. Username ${result.username}. Invite emailed.`
          : `Member registered. Username ${result.username}. Copy the set-password link.`,
      );
      onInvite({ username: result.username, inviteUrl: result.inviteUrl, emailSent: result.emailSent });
      onOpenChange(false);
      setForm({
        firstName: "",
        lastName: "",
        email: "",
        mobile: "",
        membershipNo: "",
        membershipTypeId: 0,
        electionTypeId: 0,
        joinedDate: "2018-01-01",
      });
      void queryClient.invalidateQueries({ queryKey: ["members"] });
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Register existing member</DialogTitle>
          <DialogDescription>
            For members who joined before this system. Privileges come from the membership class you
            assign. Email is required — they receive a set-password link. Username is the membership
            number (AC-…).
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          {(
            [
              ["firstName", "First name"],
              ["lastName", "Last name"],
              ["email", "Email"],
              ["mobile", "Mobile"],
              ["membershipNo", "Membership no."],
              ["joinedDate", "Joined date"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="text-sm">
              {label}
              <Input
                className="mt-1"
                type={key === "joinedDate" ? "date" : key === "email" ? "email" : "text"}
                value={form[key]}
                required={key === "firstName" || key === "lastName" || key === "membershipNo" || key === "email"}
                onChange={(event) => setForm({ ...form, [key]: event.target.value })}
              />
            </label>
          ))}
          <label className="text-sm sm:col-span-2">
            Membership class
            <select
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={selectedTypeId}
              onChange={(event) => setForm({ ...form, membershipTypeId: Number(event.target.value) })}
            >
              {types.map((type) => (
                <option key={type.membershipTypeId} value={type.membershipTypeId}>
                  {type.name}
                </option>
              ))}
            </select>
            {selectedType ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Privileges: {privilegeLabels(selectedType).join(", ") || "none"}
              </p>
            ) : null}
          </label>
          <label className="text-sm sm:col-span-2">
            Election type
            <select
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={selectedElectionId}
              onChange={(event) => setForm({ ...form, electionTypeId: Number(event.target.value) })}
            >
              {(elections.data ?? []).map((row) => (
                <option key={row.code} value={row.id ?? 0}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Create member account
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PortalInviteDialog({
  invite,
  onClose,
}: {
  invite: { username: string; inviteUrl: string; emailSent: boolean } | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={Boolean(invite)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Member portal invite</DialogTitle>
          <DialogDescription>
            They sign in at the public login page with this username after setting a password.
          </DialogDescription>
        </DialogHeader>
        {invite ? (
          <div className="space-y-3 text-sm">
            <p>
              Username: <span className="font-medium">{invite.username}</span>
            </p>
            <p>
              {invite.emailSent
                ? "A set-password email was sent."
                : "Email was not sent (no SMTP host). Share this link with the member:"}
            </p>
            <p className="break-all rounded-md border border-border bg-muted/40 p-3 font-mono text-xs">
              {invite.inviteUrl}
            </p>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  void navigator.clipboard.writeText(invite.inviteUrl);
                  toast.success("Invite link copied.");
                }}
              >
                Copy link
              </Button>
              <Button type="button" onClick={onClose}>
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function PrivilegesPanel() {
  const queryClient = useQueryClient();
  const { data = [], isLoading } = useQuery({
    queryKey: ["membership-types"],
    queryFn: () => apiRequest<MembershipTypeRow[]>("/api/membership-types"),
  });
  const [draft, setDraft] = useState<Record<number, MembershipTypeRow>>({});
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<MembershipTypeRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MembershipTypeRow | null>(null);

  const rows = data.map((type) => draft[type.membershipTypeId] ?? type);

  const save = useMutation({
    mutationFn: (type: MembershipTypeRow) =>
      apiRequest(`/api/membership-types/${type.membershipTypeId}/privileges`, {
        method: "PUT",
        body: JSON.stringify({
          canVote: type.canVote,
          canRunForOffice: type.canRunForOffice,
          reciprocationAllowed: type.reciprocationAllowed,
          canIntroduceGuests: type.canIntroduceGuests,
          canAccessSubscriptions: type.canAccessSubscriptions,
          canAccessCommittee: type.canAccessCommittee,
          canAccessAccommodation: type.canAccessAccommodation,
          canAccessEndorsements: type.canAccessEndorsements,
          canAccessDocuments: type.canAccessDocuments,
          isPermanent: type.isPermanent,
          maxDurationDays: type.maxDurationDays,
        }),
      }),
    onSuccess: () => {
      toast.success("Privileges saved — member dashboard cards will follow these flags.");
      void queryClient.invalidateQueries({ queryKey: ["membership-types"] });
      void queryClient.invalidateQueries({ queryKey: ["members"] });
      void queryClient.invalidateQueries({ queryKey: ["member-me"] });
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  function patch(id: number, key: keyof MembershipTypeRow, value: boolean) {
    const current = rows.find((row) => row.membershipTypeId === id);
    if (!current) return;
    setDraft((prev) => ({ ...prev, [id]: { ...current, [key]: value } }));
  }

  const privilegeColumns = [
    { key: "canVote", label: "Election", hint: "Vote card" },
    { key: "canRunForOffice", label: "Office", hint: "Stand / nominate" },
    { key: "canIntroduceGuests", label: "Guests", hint: "Guest book" },
    { key: "reciprocationAllowed", label: "Reciproc.", hint: "Reciprocal visits" },
    { key: "canAccessSubscriptions", label: "Subs", hint: "Payments card" },
    { key: "canAccessCommittee", label: "Committee", hint: "Committee card" },
    { key: "canAccessAccommodation", label: "Rooms", hint: "Accommodation" },
    { key: "canAccessEndorsements", label: "Endorse", hint: "Proposer card" },
    { key: "canAccessDocuments", label: "Docs", hint: "Documents card" },
    { key: "isPermanent", label: "Perm.", hint: "Permanent class" },
  ] as const;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-3xl text-sm text-muted-foreground">
          Tick a privilege to enable the matching <strong>member dashboard</strong> card for that
          class. Untick to disable it. Profile stays available for all members. Guests card opens if
          Guests or Reciprocation is ticked. Election follows Vote.
        </p>
        <Button
          type="button"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus className="size-4" />
          Add
        </Button>
      </div>
      <MembershipTypeFormDialog
        open={formOpen}
        editing={editing}
        onOpenChange={(next) => {
          setFormOpen(next);
          if (!next) setEditing(null);
        }}
      />
      <DeleteMembershipTypeDialog target={deleteTarget} onClose={() => setDeleteTarget(null)} />
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="bg-secondary/60 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Class</th>
              {privilegeColumns.map((col) => (
                <th key={col.key} className="px-3 py-3 font-medium" title={col.hint}>
                  {col.label}
                </th>
              ))}
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td className="px-4 py-6 text-muted-foreground" colSpan={privilegeColumns.length + 2}>
                  Loading classes…
                </td>
              </tr>
            ) : (
              rows.map((type) => (
                <tr key={type.membershipTypeId} className="border-t border-border">
                  <td className="px-4 py-3">
                    <p className="font-medium">{type.name}</p>
                    <p className="text-xs text-muted-foreground">{type.code}</p>
                    {type.description ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">{type.description}</p>
                    ) : null}
                  </td>
                  {privilegeColumns.map((col) => (
                    <td key={col.key} className="px-3 py-3">
                      <input
                        type="checkbox"
                        className="size-4"
                        checked={Boolean(type[col.key])}
                        onChange={(event) =>
                          patch(type.membershipTypeId, col.key, event.target.checked)
                        }
                        aria-label={`${type.name} ${col.label}`}
                        title={col.hint}
                      />
                    </td>
                  ))}
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={save.isPending}
                        onClick={() => save.mutate(type)}
                      >
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditing(type);
                          setFormOpen(true);
                        }}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(type)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MembershipTypeFormDialog({
  open,
  editing,
  onOpenChange,
}: {
  open: boolean;
  editing: MembershipTypeRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ code: "", name: "", description: "" });
  const isEdit = Boolean(editing);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        code: editing.code,
        name: editing.name,
        description: editing.description ?? "",
      });
      return;
    }
    setForm({ code: "", name: "", description: "" });
  }, [open, editing]);

  const save = useMutation({
    mutationFn: () => {
      const body = JSON.stringify({
        code: form.code.trim(),
        name: form.name.trim(),
        description: form.description.trim() || null,
      });
      if (editing) {
        return apiRequest<MembershipTypeRow>(`/api/membership-types/${editing.membershipTypeId}`, {
          method: "PUT",
          body,
        });
      }
      return apiRequest<MembershipTypeRow>("/api/membership-types/create", {
        method: "POST",
        body,
      });
    },
    onSuccess: (created) => {
      toast.success(
        isEdit ? `${created.name} updated.` : `${created.name} added. Assign privileges on this table.`,
      );
      setForm({ code: "", name: "", description: "" });
      onOpenChange(false);
      void queryClient.invalidateQueries({ queryKey: ["membership-types"] });
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next && editing) {
          setForm({
            code: editing.code,
            name: editing.name,
            description: editing.description ?? "",
          });
        }
        if (!next) setForm({ code: "", name: "", description: "" });
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit membership type" : "Add membership type"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the class code, name, and description."
              : "Create another membership class."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
         <label className="text-sm">
            Membership type code
            <Input
              className="mt-1 uppercase"
              value={form.code}
              required
              maxLength={40}
              placeholder="e.g. ASSOCIATE"
              onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })}
            />
          </label>
          <label className="text-sm">
            Membership name
            <Input
              className="mt-1"
              value={form.name}
              required
              maxLength={120}
              placeholder="e.g. Associate"
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </label>
          <label className="text-sm">
            Description
            <Textarea
              className="mt-1"
              value={form.description}
              maxLength={500}
              rows={3}
              placeholder="Optional"
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              {isEdit ? "Save changes" : "Save type"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteMembershipTypeDialog({
  target,
  onClose,
}: {
  target: MembershipTypeRow | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: () =>
      apiRequest(`/api/membership-types/${target!.membershipTypeId}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success(`${target?.name ?? "Class"} deleted.`);
      onClose();
      void queryClient.invalidateQueries({ queryKey: ["membership-types"] });
      void queryClient.invalidateQueries({ queryKey: ["members"] });
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  return (
    <AlertDialog open={Boolean(target)} onOpenChange={(next) => { if (!next) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure you want to delete?</AlertDialogTitle>
          <AlertDialogDescription>
            {target
              ? `This will remove the ${target.name} membership class (${target.code}).`
              : "This will remove the membership class."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={remove.isPending}>No</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={remove.isPending}
            onClick={(event) => {
              event.preventDefault();
              remove.mutate();
            }}
          >
            {remove.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Yes
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
