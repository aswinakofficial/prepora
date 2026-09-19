import { i18n } from "@lingui/core";
export { i18n };

export const locales = {
  en: "English",
  fr: "Français",
  es: "Español"
};

export const defaultLocale = "en";

export async function dynamicActivate(locale: string) {
  try {
    const { messages } = await import(`../locales/${locale}/messages.po`);
    i18n.load(locale, messages);
    i18n.activate(locale);
  } catch (error) {
    console.error(`Failed to load messages for locale: ${locale}`, error);
  }
}

// Initial activation for SSR or default
i18n.load(defaultLocale, {});
i18n.activate(defaultLocale);
