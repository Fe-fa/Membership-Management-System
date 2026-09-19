import { apiRequest } from "@/services/membership/api";

export type SupportContact = {
  name: string;
  email: string;
  companyName?: string | null;
};

export type SupportCategory = {
  roleCode: string;
  roleName: string;
  contacts: SupportContact[];
};

export type SupportTicketListItem = {
  ticketId: number;
  ticketNo: string;
  subject: string;
  categoryRoleCode: string;
  categoryRoleName: string;
  categoryEmail?: string | null;
  categoryAssigneeName?: string | null;
  priority: string;
  status: string;
  createdByName: string;
  createdAt: string;
  updatedAt?: string | null;
};

export type SupportTicketMessage = {
  messageId: number;
  authorName: string;
  isStaff: boolean;
  body: string;
  createdAt: string;
};

export type SupportTicketDetail = SupportTicketListItem & {
  description?: string | null;
  createdByUserId: number;
  attachmentFileName?: string | null;
  attachmentUrl?: string | null;
  messages: SupportTicketMessage[];
};

export type SupportDashboard = {
  open: number;
  inProgress: number;
  resolved: number;
  closed: number;
  submittedToday: number;
  total: number;
  byCategory: { name: string; count: number }[];
  byPriority: { name: string; count: number }[];
};

export function listSupportCategories() {
  return apiRequest<SupportCategory[]>("/api/support/categories");
}

export function supportDashboard() {
  return apiRequest<SupportDashboard>("/api/support/dashboard");
}

export function listSupportTickets(params?: { scope?: string; status?: string; search?: string }) {
  const query = new URLSearchParams();
  if (params?.scope) query.set("scope", params.scope);
  if (params?.status) query.set("status", params.status);
  if (params?.search) query.set("search", params.search);
  const suffix = query.toString() ? `?${query}` : "";
  return apiRequest<SupportTicketListItem[]>(`/api/support/tickets${suffix}`);
}

export function getSupportTicket(ticketId: number) {
  return apiRequest<SupportTicketDetail>(`/api/support/tickets/${ticketId}`);
}

export function createSupportTicket(body: {
  subject: string;
  description?: string;
  categoryRoleCode: string;
  priority?: string;
}) {
  return apiRequest<SupportTicketDetail>("/api/support/tickets", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function attachSupportTicket(ticketId: number, file: File) {
  const body = new FormData();
  body.append("file", file);
  return apiRequest<SupportTicketDetail>(`/api/support/tickets/${ticketId}/attachment`, {
    method: "POST",
    body,
  });
}

export function replySupportTicket(ticketId: number, body: string) {
  return apiRequest<SupportTicketDetail>(`/api/support/tickets/${ticketId}/replies`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

export function changeSupportTicketStatus(ticketId: number, status: string) {
  return apiRequest<SupportTicketDetail>(`/api/support/tickets/${ticketId}/status`, {
    method: "PUT",
    body: JSON.stringify({ status }),
  });
}

export function statusLabel(status: string) {
  switch (status) {
    case "IN_PROGRESS":
      return "In progress";
    case "RESOLVED":
      return "Resolved";
    case "CLOSED":
      return "Closed";
    default:
      return "Open";
  }
}

export function priorityLabel(priority: string) {
  return priority.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export function statusClass(status: string) {
  switch (status) {
    case "IN_PROGRESS":
      return "border-sky-200 bg-sky-50 text-sky-800";
    case "RESOLVED":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "CLOSED":
      return "border-zinc-200 bg-zinc-100 text-zinc-700";
    default:
      return "border-amber-200 bg-amber-50 text-amber-900";
  }
}
