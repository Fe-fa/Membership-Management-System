import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { PageBackLink, PageFrame, PageHeader } from "@/components/layout/PageFrame";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isStaff, readUser } from "@/lib/auth";
import { apiRequest, extractErrorMessage } from "@/services/membership/api";
import { cn } from "@/utils/cn";
import { formatKes } from "@/utils/format";

const ROOM_TYPES = ["Standard", "Single", "Twin", "Family"] as const;

type BillingBooking = {
  id: number;
  roomNumber?: string | null;
  checkInDate: string;
  checkOutDate: string;
  numberOfNights: number;
  nightlyRate: number;
  extraCharges: number;
  totalAmount: number;
  status: string;
  receiptNo?: string | null;
  accommodationBookingId?: number | null;
  stayStatus?: string | null;
  roomType?: string | null;
};

type Paged<T> = { items: T[]; totalCount: number };

const fieldClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

function paymentLabel(status: string) {
  if (status === "PENDING_ADVANCE_PAYMENT") return "Awaiting payment";
  if (status === "PAID") return "Paid";
  if (status === "CANCELLED") return "Cancelled";
  if (status === "REFUNDED") return "Refunded";
  return status.replaceAll("_", " ");
}

function StatusChip({
  children,
  tone,
}: {
  children: string;
  tone: "stay" | "pending" | "paid" | "muted";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        tone === "stay" && "border-primary/30 bg-primary/10 text-primary",
        tone === "pending" && "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200",
        tone === "paid" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
        tone === "muted" && "border-border text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

export function AccommodationPage() {
  const user = readUser();
  const staff = isStaff(user);
  const queryClient = useQueryClient();
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [roomType, setRoomType] = useState<string>(ROOM_TYPES[0]);
  const [roomNumber, setRoomNumber] = useState("");
  const [nightlyRate, setNightlyRate] = useState("5000");
  const [extraCharges, setExtraCharges] = useState("0");
  const [phone, setPhone] = useState("");

  const nights = useMemo(() => {
    if (!checkIn || !checkOut) return 0;
    const a = new Date(`${checkIn}T00:00:00`);
    const b = new Date(`${checkOut}T00:00:00`);
    const diff = Math.round((b.getTime() - a.getTime()) / 86400000);
    return diff > 0 ? diff : 0;
  }, [checkIn, checkOut]);

  const rate = Number(nightlyRate) || 0;
  const extras = Number(extraCharges) || 0;
  const totalPreview = nights * rate + extras;
  const canBook = Boolean(checkIn && checkOut && nights > 0 && roomType);

  const bookings = useQuery({
    queryKey: ["member-billing-accommodation"],
    queryFn: () =>
      apiRequest<Paged<BillingBooking>>("/api/members/me/billing/accommodation?page=1&pageSize=50"),
    enabled: !staff,
  });

  const book = useMutation({
    mutationFn: () =>
      apiRequest("/api/members/me/billing/accommodation", {
        method: "POST",
        body: JSON.stringify({
          checkInDate: checkIn,
          checkOutDate: checkOut,
          roomType,
          roomNumber: roomNumber || null,
          nightlyRate: rate,
          extraCharges: extras,
          phone: phone || null,
        }),
      }),
    onSuccess: () => {
      toast.success("Stay saved. Pay the advance to confirm the room.");
      setCheckIn("");
      setCheckOut("");
      setRoomNumber("");
      void queryClient.invalidateQueries({ queryKey: ["member-billing-accommodation"] });
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  const stays = bookings.data?.items ?? [];

  return (
    <PageFrame>
      {staff ? <PageBackLink to="/admin" label="Back to admin dashboard" /> : null}
      <PageHeader
        eyebrow="Facilities"
        title="Accommodation"
        description="Book a stay on your membership account. Finance collects the advance and issues the receipt."
      />

      {staff ? (
        <Card>
          <CardHeader>
            <CardTitle>Staff view</CardTitle>
            <CardDescription>
              Members save the stay here. Collect the advance under Finance → Accommodation.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.4fr)_320px]">
            <Card>
              <CardHeader>
                <CardTitle>Book a stay</CardTitle>
                <CardDescription>
                  Dates, room type, and nightly rate are saved on your accommodation booking.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  className="grid gap-4 sm:grid-cols-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!canBook) {
                      toast.error("Check-out must be after check-in.");
                      return;
                    }
                    book.mutate();
                  }}
                >
                  <label className="grid gap-1.5 text-sm">
                    <Label>Check in</Label>
                    <Input type="date" required value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
                  </label>
                  <label className="grid gap-1.5 text-sm">
                    <Label>Check out</Label>
                    <Input
                      type="date"
                      required
                      min={checkIn || undefined}
                      value={checkOut}
                      onChange={(e) => setCheckOut(e.target.value)}
                    />
                  </label>
                  <label className="grid gap-1.5 text-sm">
                    <Label>Room type</Label>
                    <select
                      className={fieldClass}
                      value={roomType}
                      onChange={(e) => setRoomType(e.target.value)}
                    >
                      {ROOM_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1.5 text-sm">
                    <Label>Room number</Label>
                    <Input
                      value={roomNumber}
                      onChange={(e) => setRoomNumber(e.target.value)}
                      placeholder="e.g. 204"
                    />
                  </label>
                  <label className="grid gap-1.5 text-sm">
                    <Label>Nightly rate (Ksh)</Label>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      value={nightlyRate}
                      onChange={(e) => setNightlyRate(e.target.value)}
                    />
                  </label>
                  <label className="grid gap-1.5 text-sm">
                    <Label>Extra charges</Label>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      value={extraCharges}
                      onChange={(e) => setExtraCharges(e.target.value)}
                    />
                  </label>
                  <label className="grid gap-1.5 text-sm sm:col-span-2">
                    <Label>Phone</Label>
                    <Input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="Used if Finance needs to reach you"
                    />
                  </label>
                  <div className="flex justify-end sm:col-span-2">
                    <Button type="submit" disabled={book.isPending || !canBook}>
                      {book.isPending ? "Saving stay…" : "Book stay"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>This stay</CardTitle>
                <CardDescription>Saved as booked. The room is confirmed after payment.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Total due</p>
                  <p className="text-3xl font-semibold">{formatKes(totalPreview)}</p>
                </div>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Nights</dt>
                    <dd>{nights || "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Room</dt>
                    <dd className="text-right">{roomNumber ? `${roomType} ${roomNumber}` : roomType}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Rate</dt>
                    <dd>{formatKes(rate)} / night</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Extras</dt>
                    <dd>{formatKes(extras)}</dd>
                  </div>
                </dl>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Occupancy is capped at 90 nights in any 12 months. Cancel inside 24 hours of check-in
                  and a fee may apply.
                </p>
              </CardContent>
            </Card>
          </div>

          <section className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold">Your stays</h2>
              <p className="text-sm text-muted-foreground">
                Each booking is stored on your membership account. Pay the advance to confirm it.
              </p>
            </div>
            {bookings.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading stays…</p>
            ) : stays.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-sm text-muted-foreground">
                  No stays yet. Choose dates and book a room to save one.
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3">
                {stays.map((row) => {
                  const pending = row.status === "PENDING_ADVANCE_PAYMENT";
                  const room = row.roomType || row.roomNumber || "Room";
                  return (
                    <Card key={row.id}>
                      <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
                        <div className="min-w-0 space-y-1">
                          <p className="font-medium">
                            {room}
                            <span className="font-normal text-muted-foreground">
                              {" "}
                              · {row.checkInDate.slice(0, 10)} → {row.checkOutDate.slice(0, 10)}
                            </span>
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {row.numberOfNights} night{row.numberOfNights === 1 ? "" : "s"} ·{" "}
                            {formatKes(row.totalAmount)}
                            {row.accommodationBookingId ? ` · Stay #${row.accommodationBookingId}` : ""}
                            {row.receiptNo ? ` · ${row.receiptNo}` : ""}
                          </p>
                          <div className="flex flex-wrap gap-2 pt-1">
                            <StatusChip tone="stay">{row.stayStatus || "Booked"}</StatusChip>
                            <StatusChip tone={pending ? "pending" : row.status === "PAID" ? "paid" : "muted"}>
                              {paymentLabel(row.status)}
                            </StatusChip>
                          </div>
                        </div>
                        {pending ? (
                          <Button asChild size="sm">
                            <Link
                              to="/payment"
                              search={{
                                purpose: "accommodation",
                                amount: row.totalAmount,
                                nmId: row.id,
                                desc: `Room ${row.roomNumber || "—"} · ${row.numberOfNights} night(s)`,
                              }}
                            >
                              Pay advance
                            </Link>
                          </Button>
                        ) : null}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </PageFrame>
  );
}
