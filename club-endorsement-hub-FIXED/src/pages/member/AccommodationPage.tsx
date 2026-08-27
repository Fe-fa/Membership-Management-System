
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { PageBackLink, PageFrame, PageHeader } from "@/components/layout/PageFrame";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { isStaff, readUser } from "@/lib/auth";
import { apiRequest, extractErrorMessage } from "@/services/membership/api";

type Booking = {
  accommodationBookingId: number;
  checkInDate: string;
  checkOutDate: string;
  roomType?: string | null;
  status: string;
  cancellationFee?: number | null;
};

export function AccommodationPage() {
  const user = readUser();
  const staff = isStaff(user);
  const queryClient = useQueryClient();
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [roomType, setRoomType] = useState("Standard");

  const bookings = useQuery({
    queryKey: ["member-accommodation"],
    queryFn: () => apiRequest<Booking[]>("/api/members/me/accommodation"),
    enabled: !staff,
  });

  const book = useMutation({
    mutationFn: () =>
      apiRequest("/api/members/me/accommodation", {
        method: "POST",
        body: JSON.stringify({ checkInDate: checkIn, checkOutDate: checkOut, roomType }),
      }),
    onSuccess: () => {
      toast.success("Room booked.");
      void queryClient.invalidateQueries({ queryKey: ["member-accommodation"] });
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  const cancel = useMutation({
    mutationFn: (id: number) =>
      apiRequest(`/api/members/me/accommodation/${id}/cancel`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Booking cancelled. A charge applies if within 24 hours of arrival.");
      void queryClient.invalidateQueries({ queryKey: ["member-accommodation"] });
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  return (
    <PageFrame>
      {staff ? <PageBackLink to="/admin" label="Back to admin dashboard" /> : null}
      <PageHeader
        title="Accommodation & Facilities"
        description="Occupancy is capped at three months in any 12. Cancellations inside 24 hours attract a charge."
      />

      {staff ? (
        <p className="text-sm text-muted-foreground">Staff occupancy desk — member self-service bookings appear on the member portal.</p>
      ) : (
        <>
          <form
            className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-4"
            onSubmit={(event) => {
              event.preventDefault();
              book.mutate();
            }}
          >
            <label className="text-sm">
              Check in
              <Input className="mt-1" type="date" required value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
            </label>
            <label className="text-sm">
              Check out
              <Input className="mt-1" type="date" required value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
            </label>
            <label className="text-sm">
              Room
              <Input className="mt-1" value={roomType} onChange={(e) => setRoomType(e.target.value)} />
            </label>
            <div className="flex items-end">
              <Button type="submit" disabled={book.isPending} className="w-full">
                Book
              </Button>
            </div>
          </form>
          <div className="rounded-xl border border-border bg-card">
            {(bookings.data ?? []).map((row) => (
              <div key={row.accommodationBookingId} className="flex items-center justify-between border-b border-border px-4 py-3 last:border-0">
                <div>
                  <p className="font-medium">
                    {row.roomType} Â· {row.checkInDate} â†’ {row.checkOutDate}
                  </p>
                  <p className="text-sm text-muted-foreground">{row.status}</p>
                </div>
                {row.status !== "CANCELLED" ? (
                  <Button size="sm" variant="outline" onClick={() => cancel.mutate(row.accommodationBookingId)}>
                    Cancel
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Facility rules</CardTitle>
          <CardDescription>Lounge / Reading Room, dress, smoking and mobile phones.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>Lounge and Reading Room hours are posted at the Clubhouse; members and introduced guests observe published closing times.</p>
          <p>Dress in the Lounge and dining rooms is smart casual unless a function notice states otherwise.</p>
          <p>Smoking is confined to designated outdoor areas.</p>
          <p>Mobile phones are silent in the Lounge and Reading Room; calls are taken outside those rooms.</p>
        </CardContent>
      </Card>
    </PageFrame>
  );
}
