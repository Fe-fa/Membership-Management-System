import {
  BedDouble,
  Bell,
  CalendarDays,
  ClipboardList,
  CreditCard,
  FileText,
  Landmark,
  LifeBuoy,
  Receipt,
  Settings,
  Users,
  Vote,
  Wine,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import heroImage from "@/assets/acea-hero.jpg";
import { AdminPortalCard } from "@/components/card/AdminPortalCard";
import { Button } from "@/components/ui/button";
import type { MemberDashboard } from "@/services/member/dashboard";
import { apiRequest, extractErrorMessage } from "@/services/membership/api";
import { formatMembershipDate } from "@/services/admin/membershipDesk";
import { printHtmlDocument } from "@/utils/financeExport";
import { formatKes } from "@/utils/format";

type LifeLetter = {
  membershipTransitionId: number;
  kind: string;
  at: string;
  emailed: boolean;
  html: string;
};

export function MemberHomePage({ me }: { me: MemberDashboard }) {
  const cards = [
    {
      id: "subscriptions",
      title: "Subscriptions & Payments",
      description: "Annual dues, M-Pesa / card / bank receipts and standing.",
      to: "/payment",
      icon: CreditCard,
      tone: "sky" as const,
      locked: !me.cards.subscriptions,
    },
    {
      id: "guests",
      title: "Guests & Reciprocation",
      description: "Guest book and reciprocal-club visits.",
      to: "/guests",
      icon: Users,
      tone: "rose" as const,
      locked: !me.cards.guests,
    },
    {
      id: "committee",
      title: "Committee",
      description: "Sitting committee, officers and next meeting.",
      to: "/governance",
      icon: Landmark,
      tone: "violet" as const,
      locked: !me.cards.committee,
    },
    {
      id: "election",
      title: "Election",
      description:
        me.pendingProxies > 0
          ? `${me.pendingProxies} member${me.pendingProxies === 1 ? " has" : "s have"} appointed you as proxy.`
          : "AGM notices, votes, proxies and nominations.",
      to: "/election",
      icon: Vote,
      tone: "violet" as const,
      locked: !me.cards.election && !(me.pendingProxies > 0),
      badgeCount: me.pendingProxies,
    },
    {
      id: "committee-ballot",
      title: "Committee Ballot",
      description: "Membership admission ballot per candidate (Article 6).",
      to: "/election/committee-vote",
      icon: ClipboardList,
      tone: "violet" as const,
      locked: !me.cards.committeeBallot,
    },
    {
      id: "accommodation",
      title: "Accommodation",
      description: "Book rooms — Finance collects advance payment and issues receipts.",
      to: "/accommodation",
      icon: BedDouble,
      tone: "emerald" as const,
      locked: !me.cards.accommodation,
    },
    // {
    //   id: "corkage",
    //   title: "Corkage",
    //   description: "Log outside F&B corkage — pay at the Finance corkage desk.",
    //   to: "/corkage",
    //   icon: Wine,
    //   tone: "rose" as const,
    //   locked: !me.cards.accommodation,
    // },
    // {
    //   id: "custom-charges",
    //   title: "Custom charges",
    //   description: "Facility hire, deposits, damage fees — collect at Finance.",
    //   to: "/custom-charges",
    //   icon: Receipt,
    //   tone: "amber" as const,
    //   locked: !me.cards.accommodation,
    // },
    {
      id: "endorsements",
      title: "Endorsements",
      description:
        me.pendingEndorsements > 0
          ? `${me.pendingEndorsements} endorsement request${me.pendingEndorsements === 1 ? "" : "s"} waiting for you.`
          : "Complete endorsements named against you.",
      to: "/endorsements",
      icon: Bell,
      tone: "rose" as const,
      locked: !me.cards.endorsements,
      badgeCount: me.pendingEndorsements,
    },
    {
      id: "documents",
      title: "Notifications & Documents",
      description: "Circulars, receipts, privacy policy and consent.",
      to: "/documents",
      icon: FileText,
      tone: "slate" as const,
      locked: !me.cards.documents,
    },
    {
      id: "events",
      title: "Events",
      description: "Discover upcoming club events, register, and stay connected with the club community.",
      to: "/events",
      icon: CalendarDays,
      tone: "emerald" as const,
    },
    {
      id: "support",
      title: "Support",
      description: "Help desk, tickets and queries to Chairman, Treasurer or other offices.",
      to: "/support",
      icon: LifeBuoy,
      tone: "violet" as const,
    },
    {
      id: "settings",
      title: "Settings",
      description: "Account, privacy, appearance, and scheduled actions.",
      to: "/settings/account",
      icon: Settings,
      tone: "slate" as const,
    },
  ];

  const letter = useQuery({
    queryKey: ["member-life-letter", me.profileId],
    enabled: me.profileId > 0,
    queryFn: async () => (await apiRequest<LifeLetter | null>("/api/members/me/life-letter")) ?? null,
  });
  const advanceLeft = Math.max(0, Number(me.availableCredit || 0));
  const amountDue = Math.max(0, Number(me.outstandingBalance || 0));
  const accountFinancialStatus = (me.accountFinancialStatus || "").toUpperCase();
  const accountFinancialLabel =
    accountFinancialStatus === "ADVANCE_CREDIT"
      ? "Advance credit"
      : accountFinancialStatus === "PARTIALLY_PAID"
        ? "Partially paid"
        : accountFinancialStatus === "PAID"
          ? "Paid"
          : accountFinancialStatus === "UNPAID"
            ? "Unpaid"
            : "";

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <section className="relative overflow-hidden rounded-2xl">
        <img
          src={heroImage}
          alt=""
          width={1600}
          height={900}
          className="h-48 w-full object-cover sm:h-56 lg:h-64"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-primary/80 via-primary/40 to-transparent" />
        <h1 className="absolute inset-0 flex items-center px-6 font-sans text-2xl font-semibold tracking-tight text-white sm:px-8 sm:text-3xl">
          Member dashboard
        </h1>
      </section>
      {/* <section className="rounded-xl border bg-card px-4 py-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Account position</p>
            <p className="mt-1 text-sm text-muted-foreground">{accountFinancialLabel || me.standingDetail}</p>
          </div>
        </div>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <dt className="text-xs text-muted-foreground">Annual subscription</dt>
            <dd className="text-lg font-semibold tabular-nums">{formatKes(Number(me.annualSubscription || 0))}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Amount paid</dt>
            <dd className="text-lg font-semibold tabular-nums">{formatKes(Number(me.annualPaid || 0))}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Balance due</dt>
            <dd className="text-lg font-semibold tabular-nums">{formatKes(amountDue)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Advance credit</dt>
            <dd className="text-lg font-semibold tabular-nums">
              {advanceLeft > 0.009 ? `${formatKes(advanceLeft)} CR` : formatKes(0)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Account status</dt>
            <dd className="text-lg font-semibold">{accountFinancialLabel || "—"}</dd>
          </div>
        </dl>
      </section> */}
      {me.childrenRequiringOwnMembership > 0 ? (
        <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {me.childrenRequiringOwnMembership} child record(s) are 21 or over and should take out their own
          membership (Bye-Laws).
        </p>
      ) : null}
      {letter.data ? (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-4">
          <div>
            <h2 className="text-base font-semibold">Congratulations</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              You were promoted to {letter.data.kind} on {formatMembershipDate(letter.data.at)}.
              {letter.data.emailed ? " A copy was sent to your email." : ""}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              const html = letter.data?.html;
              if (!html || !printHtmlDocument(html)) toast.error("Allow pop-ups to open your letter.");
            }}
          >
            Open letter
          </Button>
        </section>
      ) : null}
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {cards
          .filter((card) => !(card.id === "committee-ballot" && card.locked))
          .map((card) => (
            <AdminPortalCard
              key={card.id}
              title={card.title}
              description={card.description}
              icon={card.icon}
              to={card.to}
              tone={card.tone}
              {...(card.locked !== undefined ? { locked: card.locked } : {})}
              {...("badgeCount" in card && card.badgeCount !== undefined
                ? { badgeCount: card.badgeCount }
                : {})}
            />
          ))}
      </section>
    </div>
  );
}
