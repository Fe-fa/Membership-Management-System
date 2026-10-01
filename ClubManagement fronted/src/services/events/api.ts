import { ApiError, apiRequest } from "@/services/membership/api";

export type EventStatus = "DRAFT" | "PUBLISHED" | "ONGOING" | "COMPLETED" | "CANCELLED";
export type RegistrationStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

export type EventSummary = {
  totalEvents: number;
  upcomingEvents: number;
  ongoingEvents: number;
  completedEvents: number;
  totalRegistrations: number;
  pendingRegistrations: number;
  todaysEvents: number;
};

export type MemberEventSummary = {
  upcomingEvents: number;
  myRegistrations: number;
  attendedEvents: number;
  pendingRegistrations: number;
};

export type EventCategory = {
  id: number;
  code: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  eventCount: number;
};

export type EventRegistration = {
  id: number;
  eventId: number;
  accountId: number;
  memberName: string;
  membershipNo?: string | null;
  email?: string | null;
  phone?: string | null;
  status: RegistrationStatus | string;
  paymentStatus: string;
  registeredAt: string;
  ticketCode?: string | null;
  guestCount: number;
  guestName?: string | null;
  attendanceStatus?: string | null;
  checkedInAt?: string | null;
};

export type ClubEvent = {
  id: number;
  title: string;
  description?: string | null;
  categoryCode?: string | null;
  categoryName?: string | null;
  imageUrl?: string | null;
  startsAt: string;
  endsAt?: string | null;
  venue?: string | null;
  capacity?: number | null;
  registrationDeadline?: string | null;
  fee?: number | null;
  requireRegistration: boolean;
  requireApproval: boolean;
  allowGuestRegistration: boolean;
  status: string;
  displayStatus: EventStatus | string;
  isPublished: boolean;
  registeredCount: number;
  approvedCount: number;
  pendingCount: number;
  availableSeats?: number | null;
  createdByName?: string | null;
  createdAt: string;
  registrationBlockReason?: string | null;
  myRegistration?: EventRegistration | null;
};

export type SaveEventInput = {
  title: string;
  description?: string | null;
  categoryCode?: string | null;
  imageUrl?: string | null;
  startsAt: string;
  endsAt?: string | null;
  venue?: string | null;
  capacity?: number | null;
  registrationDeadline?: string | null;
  fee?: number | null;
  requireRegistration: boolean;
  requireApproval: boolean;
  allowGuestRegistration: boolean;
  status?: string | null;
};

export type RegistrationBoard = {
  eventId?: number | null;
  eventTitle?: string | null;
  totalRegistered: number;
  approved: number;
  pending: number;
  rejected: number;
  cancelled: number;
  availableSeats?: number | null;
  rows: EventRegistration[];
};

export type AttendanceBoard = {
  eventId?: number | null;
  eventTitle?: string | null;
  expected: number;
  registered: number;
  checkedIn: number;
  absent: number;
  rows: EventRegistration[];
};

export type EventReport = {
  summary: EventSummary;
  events: {
    eventId: number;
    title: string;
    displayStatus: string;
    startsAt: string;
    registrations: number;
    present: number;
    absent: number;
    attendanceRate: number;
    noShowRate: number;
  }[];
  registrationTrend: { month: string; registrations: number }[];
};

function qs(params: Record<string, string | number | boolean | undefined | null>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

export function needsForceDelete(err: unknown) {
  return err instanceof ApiError && err.status === 409;
}

export const eventKeys = {
  adminSummary: ["admin-events", "summary"] as const,
  adminList: ["admin-events", "list"] as const,
  categories: ["events", "categories"] as const,
  memberSummary: ["member-events", "summary"] as const,
  memberList: ["member-events", "list"] as const,
};

export const eventsApi = {
  adminSummary: () => apiRequest<EventSummary>("/api/admin/events/summary"),
  adminList: (params: { search?: string; status?: string; category?: string } = {}) =>
    apiRequest<ClubEvent[]>(`/api/admin/events${qs(params)}`),
  adminGet: (id: number) => apiRequest<ClubEvent>(`/api/admin/events/${id}`),
  calendar: (from: string, to: string) =>
    apiRequest<ClubEvent[]>(`/api/admin/events/calendar${qs({ from, to })}`),
  create: (body: SaveEventInput) =>
    apiRequest<ClubEvent>("/api/admin/events", { method: "POST", body: JSON.stringify(body) }),
  update: (id: number, body: SaveEventInput) =>
    apiRequest<ClubEvent>(`/api/admin/events/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  publish: (id: number) => apiRequest<ClubEvent>(`/api/admin/events/${id}/publish`, { method: "POST" }),
  unpublish: (id: number) => apiRequest<ClubEvent>(`/api/admin/events/${id}/unpublish`, { method: "POST" }),
  cancel: (id: number) => apiRequest<ClubEvent>(`/api/admin/events/${id}/cancel`, { method: "POST" }),
  remove: (id: number, force = false) =>
    apiRequest<{ message: string }>(`/api/admin/events/${id}${qs({ force: force ? true : undefined })}`, { method: "DELETE" }),
  categories: () => apiRequest<EventCategory[]>("/api/admin/events/categories"),
  saveCategory: (body: { name: string; isActive: boolean }, id?: number) =>
    apiRequest<EventCategory>(id ? `/api/admin/events/categories/${id}` : "/api/admin/events/categories", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(body),
    }),
  registrations: (params: { eventId?: number; search?: string; status?: string } = {}) =>
    apiRequest<RegistrationBoard>(`/api/admin/events/registrations${qs(params)}`),
  registrationAction: (id: number, action: "approve" | "reject" | "cancel") =>
    apiRequest<EventRegistration>(`/api/admin/events/registrations/${id}/${action}`, { method: "POST" }),
  markPayment: (id: number, paymentStatus: string) =>
    apiRequest<EventRegistration>(`/api/admin/events/registrations/${id}/payment`, {
      method: "POST",
      body: JSON.stringify({ paymentStatus }),
    }),
  attendance: (params: { eventId?: number; search?: string; history?: boolean } = {}) =>
    apiRequest<AttendanceBoard>(`/api/admin/events/attendance${qs(params)}`),
  markAttendance: (eventId: number, body: { accountId?: number; ticketCode?: string; status: string }) =>
    apiRequest<EventRegistration>(`/api/admin/events/${eventId}/attendance`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  reports: () => apiRequest<EventReport>("/api/admin/events/reports"),
  announce: (id: number, message: string, audience: string) =>
    apiRequest<{ message: string }>(`/api/admin/events/${id}/announce`, {
      method: "POST",
      body: JSON.stringify({ message, audience }),
    }),
  memberSummary: () => apiRequest<MemberEventSummary>("/api/member/events/summary"),
  memberList: (params: { bucket?: string; category?: string; search?: string; from?: string; to?: string } = {}) =>
    apiRequest<ClubEvent[]>(`/api/member/events${qs(params)}`),
  memberMine: (bucket: string) => apiRequest<ClubEvent[]>(`/api/member/events/mine${qs({ bucket })}`),
  memberGet: (id: number) => apiRequest<ClubEvent>(`/api/member/events/${id}`),
  memberCategories: () => apiRequest<EventCategory[]>("/api/member/events/categories"),
  memberCalendar: (from: string, to: string) =>
    apiRequest<ClubEvent[]>(`/api/member/events/calendar${qs({ from, to })}`),
  register: (id: number, guestName?: string) =>
    apiRequest<ClubEvent>(`/api/member/events/${id}/register`, {
      method: "POST",
      body: JSON.stringify({ guestName: guestName || null }),
    }),
  cancelOwn: (id: number) => apiRequest<ClubEvent>(`/api/member/events/${id}/cancel`, { method: "POST" }),
};
