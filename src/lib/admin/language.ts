import type { Lang } from "./i18n";

export function isAdminLanguage(value: string | null): value is Lang {
  return value === "ar" || value === "en";
}

export function resolveInitialAdminLanguage(search: string, savedLang: string | null): Lang {
  const params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  const requestedLang = params.get("lang");

  if (isAdminLanguage(requestedLang)) {
    return requestedLang;
  }

  if (isAdminLanguage(savedLang)) {
    return savedLang;
  }

  return "ar";
}
