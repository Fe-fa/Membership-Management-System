import clubLogo from "@/assets/acea-logo.png";

export function clubLogoUrl(override?: string | null) {
  const chosen = override?.trim() || String(clubLogo);
  if (/^(data:|blob:|https?:)/i.test(chosen)) return chosen;
  if (typeof window === "undefined") return chosen;
  return new URL(chosen, window.location.origin).href;
}

let cachedLogoDataUri: string | null = null;

/** Embed the club logo as a data URI so emailed invoices match the dashboard document. */
export async function embeddedClubLogoUrl(override?: string | null) {
  const src = clubLogoUrl(override);
  if (src.startsWith("data:")) return src;
  const cacheKey = override?.trim() ? src : "__default__";
  if (!override?.trim() && cachedLogoDataUri) return cachedLogoDataUri;
  try {
    const res = await fetch(src);
    if (!res.ok) return src;
    const blob = await res.blob();
    const uri = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? src));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    if (cacheKey === "__default__") cachedLogoDataUri = uri;
    return uri;
  } catch {
    return src;
  }
}
