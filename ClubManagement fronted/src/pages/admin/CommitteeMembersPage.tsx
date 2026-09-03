import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Plus, Trash2, UserRound, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { PageBackLink, PageFrame, PageHeader } from "@/components/layout/PageFrame";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatKenyaDate, kenyaTodayISO, nextAnnualFrom } from "@/utils/kenyaDate";
import { cn } from "@/utils/cn";
import { formatMembershipDate, type MemberRow } from "@/services/admin/membershipDesk";
import { apiRequest, extractErrorMessage } from "@/services/membership/api";

import {
  type CommitteeMember,
  type ProfileHit,
  type RoleOption,
  useCurrentCommittee,
  useInvalidateCommittee,
} from "./committee/committeeDesk";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function statusBucket(status: string) {
  const s = status.toLowerCase();
  if (!s) return "unknown";
  if (s.includes("pending") || s.includes("temporary")) return "pending";
  if (s.includes("inactive") || s.includes("removed") || s.includes("posted") || s.includes("deceased")) {
    return "inactive";
  }
  return "active";
}

function statusTone(status: string) {
  const s = status.toLowerCase();
  if (!s || s === "—") {
    return "bg-muted text-muted-foreground";
  }
  if (s.includes("pending") || s.includes("temporary")) {
    return "bg-amber-50 text-amber-800";
  }
  if (s.includes("inactive") || s.includes("removed") || s.includes("posted") || s.includes("deceased")) {
    return "bg-slate-100 text-slate-600";
  }
  return "bg-sky-50 text-sky-800";
}

export function CommitteeMembersPage() {
  const current = useCurrentCommittee();
  const invalidate = useInvalidateCommittee();
  const committee = current.data;
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [joinedFrom, setJoinedFrom] = useState("");
  const [joinedTo, setJoinedTo] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const removeMember = useMutation({
    mutationFn: (committeeMemberId: number) => {
      if (!committee) throw new Error("No active committee.");
      return apiRequest(`/api/committees/${committee.committeeId}/members/${committeeMemberId}`, {
        method: "DELETE",
      });
    },
    onSuccess: (_data, committeeMemberId) => {
      toast.success("Member removed from this term.");
      if (selectedId === committeeMemberId) setSelectedId(null);
      invalidate();
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  const accounts = useQuery({
    queryKey: ["members", "register"],
    queryFn: () =>
      apiRequest<{ items: MemberRow[] }>("/api/membership-accounts?page=1&pageSize=100").then(
        (result) => result.items,
      ),
    enabled: Boolean(committee),
  });

  const members = useMemo(() => {
    const rows = committee?.members ?? [];
    const register = accounts.data ?? [];
    const byProfile = new Map(register.filter((r) => r.profileId).map((r) => [r.profileId!, r]));
    const byNo = new Map(
      register
        .filter((r) => r.membershipNo)
        .map((r) => [r.membershipNo.trim().toUpperCase(), r]),
    );
    return rows.map((m) => {
      const hit =
        (m.membershipNo ? byNo.get(m.membershipNo.trim().toUpperCase()) : undefined) ??
        byProfile.get(m.profileId);
      if (!hit) return m;
      return {
        ...m,
        accountId: hit.accountId ?? m.accountId,
        membershipNo: hit.membershipNo || m.membershipNo,
        membershipType: hit.membershipType || m.membershipType,
        membershipStatus: hit.status || m.membershipStatus,
        joinedDate: hit.joinedDate || m.joinedDate,
      };
    });
  }, [committee?.members, accounts.data]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members.filter((m) => {
      if (q) {
        const hay = `${m.profileName} ${m.membershipNo ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (statusFilter !== "all" && statusBucket(m.membershipStatus ?? "") !== statusFilter) {
        return false;
      }
      if (joinedFrom && (m.joinedDate ?? "") < joinedFrom) return false;
      if (joinedTo && (m.joinedDate ?? "") > joinedTo) return false;
      return true;
    });
  }, [members, search, statusFilter, joinedFrom, joinedTo]);

  const selected = filtered.find((m) => m.committeeMemberId === selectedId) ?? null;

  return (
    <PageFrame width="lg" className="max-w-[1280px]">
      <PageBackLink to="/admin" label="Back to admin dashboard" />
      <PageHeader
        title="Committee members"
        description="Sitting members for the current term. Search, filter, and open a quick profile."
      />
      {!committee ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            {current.isLoading ? "Loading…" : "Create a committee term first to appoint members."}
          </CardContent>
        </Card>
      ) : (
        <div className={cn("grid gap-4", selected ? "xl:grid-cols-[1fr_280px]" : "")}>
          <div className="space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
              <label className="grid min-w-[180px] flex-1 gap-1 text-sm">
                <span className="text-xs font-medium text-muted-foreground">Search</span>
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Name or membership no."
                />
              </label>
              <label className="grid w-full gap-1 text-sm sm:w-[180px]">
                <span className="text-xs font-medium text-muted-foreground">Status</span>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label className="grid w-full gap-1 text-sm sm:w-[150px]">
                <span className="text-xs font-medium text-muted-foreground">Join from</span>
                <Input type="date" value={joinedFrom} onChange={(e) => setJoinedFrom(e.target.value)} />
              </label>
              <label className="grid w-full gap-1 text-sm sm:w-[150px]">
                <span className="text-xs font-medium text-muted-foreground">Join to</span>
                <Input type="date" value={joinedTo} onChange={(e) => setJoinedTo(e.target.value)} />
              </label>
              <Button type="button" className="lg:ml-auto" onClick={() => setAddOpen(true)}>
                <Plus className="size-4" />
                Add New Member
              </Button>
            </div>

            <div className="overflow-x-auto rounded-xl border bg-card">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Member</th>
                    <th className="px-4 py-3">Membership type</th>
                    <th className="px-4 py-3">Join date</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {current.isLoading ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                        Loading members…
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                        No committee members match these filters.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((m) => {
                      const status = m.membershipStatus?.trim() || "—";
                      const activeRow = selectedId === m.committeeMemberId;
                      return (
                        <tr
                          key={m.committeeMemberId}
                          className={cn("border-t", activeRow ? "bg-sky-50/70" : "hover:bg-muted/30")}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              {m.photoUrl ? (
                                <img
                                  src={m.photoUrl}
                                  alt=""
                                  className="size-10 shrink-0 rounded-full object-cover"
                                />
                              ) : (
                                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold">
                                  {initials(m.profileName) || <UserRound className="size-4" />}
                                </div>
                              )}
                              <div>
                                <p className="font-medium leading-tight">{m.profileName}</p>
                                <p className="text-xs text-muted-foreground">{m.membershipNo ?? "—"}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">{m.membershipType ?? "—"}</td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {formatMembershipDate(m.joinedDate)}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={cn(
                                "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                                statusTone(status),
                              )}
                            >
                              {status}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => setSelectedId(m.committeeMemberId)}
                              >
                                View Profile
                              </Button>
                              {m.accountId ? (
                                <Button asChild size="sm" variant="secondary">
                                  <Link
                                    to="/existing-members/$accountId"
                                    params={{ accountId: String(m.accountId) }}
                                    search={{ mode: "edit" }}
                                  >
                                    Edit
                                  </Link>
                                </Button>
                              ) : (
                                <Button type="button" size="sm" variant="secondary" disabled>
                                  Edit
                                </Button>
                              )}
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="size-8 text-destructive"
                                disabled={removeMember.isPending}
                                title="Remove from committee"
                                onClick={() => {
                                  if (window.confirm(`Remove ${m.profileName} from this term?`)) {
                                    removeMember.mutate(m.committeeMemberId);
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
          </div>

          {selected ? (
            <QuickProfile
              member={selected}
              committeeId={committee.committeeId}
              onClose={() => setSelectedId(null)}
              onSaved={invalidate}
            />
          ) : null}
        </div>
      )}

      {committee ? (
        <AddCommitteeMemberDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          committeeId={committee.committeeId}
          busy={removeMember.isPending}
          onAdded={invalidate}
        />
      ) : null}
    </PageFrame>
  );
}

function QuickProfile({
  member,
  committeeId,
  onClose,
  onSaved,
}: {
  member: CommitteeMember;
  committeeId: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [phone, setPhone] = useState(member.phone ?? "");

  useEffect(() => {
    setPhone(member.phone ?? "");
  }, [member.committeeMemberId, member.phone]);

  const profile = useQuery({
    queryKey: ["profile", member.profileId],
    queryFn: () => apiRequest<{ mobile?: string | null }>(`/api/profiles/${member.profileId}`),
    enabled: !member.phone,
  });

  useEffect(() => {
    if (member.phone) return;
    const fromProfile = profile.data?.mobile?.trim();
    if (fromProfile) setPhone(fromProfile);
  }, [member.phone, profile.data?.mobile]);

  const savePhone = useMutation({
    mutationFn: () =>
      apiRequest(`/api/committees/${committeeId}/members/${member.committeeMemberId}`, {
        method: "PATCH",
        body: JSON.stringify({ phone: phone.trim() }),
      }),
    onSuccess: () => {
      toast.success("Phone number updated.");
      onSaved();
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  const renewal = nextAnnualFrom(member.appointedDate);

  return (
    <aside className="rounded-xl border bg-card p-4">
      <div className="mb-4 flex items-start justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-wide text-muted-foreground">Quick profile</h2>
        <Button type="button" size="icon" variant="ghost" className="size-8" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>
      <div className="flex flex-col items-center text-center">
        {member.photoUrl ? (
          <img src={member.photoUrl} alt="" className="size-24 rounded-full object-cover" />
        ) : (
          <div className="flex size-24 items-center justify-center rounded-full bg-secondary text-lg font-semibold">
            {initials(member.profileName)}
          </div>
        )}
        <p className="mt-3 font-semibold leading-tight">{member.profileName}</p>
        <p className="text-xs text-muted-foreground">{member.roleName}</p>
      </div>
      <div className="mt-5 space-y-3 text-sm">
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">Phone</span>
          <div className="flex gap-2">
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Update phone number"
            />
            <Button
              type="button"
              size="sm"
              disabled={savePhone.isPending || phone.trim() === (member.phone ?? "").trim()}
              onClick={() => savePhone.mutate()}
            >
              {savePhone.isPending ? <Loader2 className="size-4 animate-spin" /> : "Save"}
            </Button>
          </div>
        </label>
        <div>
          <p className="text-xs text-muted-foreground">Membership no.</p>
          <p>{member.membershipNo ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Appointed date</p>
          <p>{formatKenyaDate(member.appointedDate)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Next renewal date</p>
          <p>{formatKenyaDate(renewal)}</p>
          {member.appointedDate ? (
            <p className="mt-0.5 text-[11px] text-muted-foreground">One year after appointment, then every year.</p>
          ) : null}
        </div>
      </div>
    </aside>
  );
}

function AddCommitteeMemberDialog({
  open,
  onOpenChange,
  committeeId,
  busy,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  committeeId: number;
  busy: boolean;
  onAdded: () => void;
}) {
  const [memberSearch, setMemberSearch] = useState("");
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");
  const [appointedDate, setAppointedDate] = useState(kenyaTodayISO());

  const roles = useQuery({
    queryKey: ["committee", "roles"],
    queryFn: () => apiRequest<RoleOption[]>("/api/committees/meta/roles"),
    enabled: open,
  });

  const profileHits = useQuery({
    queryKey: ["committee", "profiles", memberSearch],
    queryFn: () =>
      apiRequest<ProfileHit[]>(
        `/api/committees/meta/profiles?search=${encodeURIComponent(memberSearch.trim())}`,
      ),
    enabled: open && memberSearch.trim().length >= 2,
  });

  const addMember = useMutation({
    mutationFn: () => {
      if (!selectedProfileId || !selectedRoleId) throw new Error("Select a member and role.");
      return apiRequest(`/api/committees/${committeeId}/members`, {
        method: "POST",
        body: JSON.stringify({
          profileId: selectedProfileId,
          committeeRoleId: Number(selectedRoleId),
          appointedDate,
        }),
      });
    },
    onSuccess: () => {
      toast.success("Member appointed.");
      setSelectedProfileId(null);
      setMemberSearch("");
      onAdded();
      onOpenChange(false);
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add committee member</DialogTitle>
          <DialogDescription>Appoint a club member to this term with a committee role.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <label className="grid gap-1 text-sm">
            <Label>Search member</Label>
            <Input
              value={memberSearch}
              onChange={(e) => {
                setMemberSearch(e.target.value);
                setSelectedProfileId(null);
              }}
              placeholder="Name or membership no."
            />
            {profileHits.data && profileHits.data.length > 0 ? (
              <div className="max-h-40 overflow-auto rounded-md border bg-background">
                {profileHits.data.map((hit) => (
                  <button
                    key={hit.profileId}
                    type="button"
                    className={cn(
                      "flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted",
                      selectedProfileId === hit.profileId ? "bg-muted" : "",
                    )}
                    onClick={() => {
                      setSelectedProfileId(hit.profileId);
                      setMemberSearch(`${hit.name}${hit.membershipNo ? ` (${hit.membershipNo})` : ""}`);
                    }}
                  >
                    <span>{hit.name}</span>
                    <span className="text-xs text-muted-foreground">{hit.membershipNo ?? "—"}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </label>
          <label className="grid gap-1 text-sm">
            <Label>Role</Label>
            <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
              <SelectTrigger>
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                {(roles.data ?? []).map((role) => (
                  <SelectItem key={role.committeeRoleId} value={String(role.committeeRoleId)}>
                    {role.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="grid gap-1 text-sm">
            <Label>Appointed</Label>
            <Input type="date" value={appointedDate} onChange={(e) => setAppointedDate(e.target.value)} />
          </label>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={busy || addMember.isPending || !selectedProfileId || !selectedRoleId}
            onClick={() => addMember.mutate()}
          >
            {addMember.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Add New Member
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
