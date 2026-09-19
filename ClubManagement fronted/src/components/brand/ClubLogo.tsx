import { tenantDisplayName, useCurrentTenant } from "@/services/tenant";
import { cn } from "@/utils/cn";
import { clubLogoUrl } from "@/utils/clubLogo";

export function ClubLogo({
  className,
  alt,
}: {
  className?: string;
  alt?: string;
}) {
  const tenant = useCurrentTenant();
  const src = clubLogoUrl(tenant.data?.logoUrl);
  const name = alt ?? tenantDisplayName(tenant.data);
  return <img src={src} alt={name} className={cn("h-9 w-auto object-contain object-left", className)} />;
}
