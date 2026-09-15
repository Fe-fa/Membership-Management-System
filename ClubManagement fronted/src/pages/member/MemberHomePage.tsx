import {
  BedDouble,
  Bell,
  ClipboardList,
  CreditCard,
  FileText,
  Landmark,
  Receipt,
  Settings,
  Users,
  Vote,
  Wine,
} from "lucide-react";

import heroImage from "@/assets/acea-hero.jpg";
import { AdminPortalCard } from "@/components/card/AdminPortalCard";
import type { MemberDashboard } from "@/services/member/dashboard";

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
      to: "/committee-ballot/attendance",
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
      id: "settings",
      title: "Settings",
      description: "Account, privacy, appearance, and scheduled actions.",
      to: "/settings/account",
      icon: Settings,
      tone: "slate" as const,
    },
  ];

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
      {me.childrenRequiringOwnMembership > 0 ? (
        <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {me.childrenRequiringOwnMembership} child record(s) are 21 or over and should take out their own
          membership (Bye-Laws).
        </p>
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
              locked={card.locked}
              badgeCount={"badgeCount" in card ? card.badgeCount : undefined}
            />
          ))}
      </section>
    </div>
  );
}
