import clubLogo from "@/assets/acea-logo.png";

export function clubLogoUrl(override?: string | null) {
  const chosen = override?.trim() || String(clubLogo);
  if (/^(data:|blob:|https?:)/i.test(chosen)) return chosen;
  if (typeof window === "undefined") return chosen;
  return new URL(chosen, window.location.origin).href;
}
