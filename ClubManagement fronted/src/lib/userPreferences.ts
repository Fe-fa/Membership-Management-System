const THEME_KEY = "acea.settings.theme";
const LANG_KEY = "acea.settings.language";
const INSTRUCTIONS_KEY = "acea.settings.instructions";
const PRIVACY_KEY = "acea.settings.privacy";
const AUTOMATIONS_KEY = "acea.settings.automations";

export type ThemePreference = "light" | "dark" | "system";

export type PrivacySettings = {
  retentionDays: number;
  allowSearch: boolean;
  personalContext: boolean;
};

export type ScheduledAction = {
  id: string;
  name: string;
  cadence: string;
  enabled: boolean;
};

export function readTheme(): ThemePreference {
  if (typeof window === "undefined") return "system";
  const raw = window.localStorage.getItem(THEME_KEY);
  if (raw === "light" || raw === "dark" || raw === "system") return raw;
  return "system";
}

export function applyTheme(theme: ThemePreference = readTheme()) {
  if (typeof document === "undefined") return;
  const dark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export function saveTheme(theme: ThemePreference) {
  window.localStorage.setItem(THEME_KEY, theme);
  applyTheme(theme);
}

export function readLanguage() {
  return window.localStorage.getItem(LANG_KEY) || "en";
}

export function saveLanguage(code: string) {
  window.localStorage.setItem(LANG_KEY, code);
}

export function readInstructions() {
  return window.localStorage.getItem(INSTRUCTIONS_KEY) || "";
}

export function saveInstructions(value: string) {
  window.localStorage.setItem(INSTRUCTIONS_KEY, value);
}

export function readPrivacy(): PrivacySettings {
  try {
    const raw = window.localStorage.getItem(PRIVACY_KEY);
    if (raw) return { retentionDays: 90, allowSearch: true, personalContext: true, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { retentionDays: 90, allowSearch: true, personalContext: true };
}

export function savePrivacy(value: PrivacySettings) {
  window.localStorage.setItem(PRIVACY_KEY, JSON.stringify(value));
}

export function exportLocalData() {
  const bag: Record<string, string> = {};
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (!key) continue;
    if (key.startsWith("acea.")) bag[key] = window.localStorage.getItem(key) ?? "";
  }
  return bag;
}

export function clearChatAndLocalContext() {
  const remove: string[] = [];
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (!key) continue;
    if (key.startsWith("acea.application.") || key.startsWith("acea.payment.") || key.startsWith("acea.settings.")) {
      remove.push(key);
    }
  }
  for (const key of remove) window.localStorage.removeItem(key);
}

export function readAutomations(): ScheduledAction[] {
  try {
    const raw = window.localStorage.getItem(AUTOMATIONS_KEY);
    if (raw) return JSON.parse(raw) as ScheduledAction[];
  } catch {
    /* ignore */
  }
  return [];
}

export function saveAutomations(rows: ScheduledAction[]) {
  window.localStorage.setItem(AUTOMATIONS_KEY, JSON.stringify(rows));
}
