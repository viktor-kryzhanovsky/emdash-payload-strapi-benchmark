export const LOCALES = ["en", "uk"] as const;
export type Locale = (typeof LOCALES)[number];

export const isLocale = (value: string | undefined): value is Locale =>
	(LOCALES as readonly (string | undefined)[]).includes(value);

const dictionaries = {
	en: {
		languageName: "English",
		search: "Search",
		searchPlaceholder: "Search…",
		searchResults: (q: string) => `Search results for “${q}”`,
		nothingFound: "Nothing found",
		allIn: (category: string) => `All in ${category}`,
		minutes: "min",
		previous: "Previous",
		next: "Next",
		by: "By",
		rights: "All rights reserved.",
	},
	uk: {
		languageName: "Українська",
		search: "Пошук",
		searchPlaceholder: "Пошук…",
		searchResults: (q: string) => `Результати пошуку «${q}»`,
		nothingFound: "Нічого не знайдено",
		allIn: (category: string) => `Усі матеріали: ${category}`,
		minutes: "хв",
		previous: "Назад",
		next: "Далі",
		by: "Автор:",
		rights: "Усі права захищені.",
	},
} satisfies Record<Locale, unknown>;

export const t = (locale: Locale) => dictionaries[locale];

export const formatDate = (locale: Locale, iso: string) =>
	new Intl.DateTimeFormat(locale === "uk" ? "uk-UA" : "en-US", {
		day: "numeric",
		month: "long",
		year: "numeric",
	}).format(new Date(iso));

export const parsePage = (value: string | null | undefined) => {
	const n = Number(value);
	return Number.isInteger(n) && n > 0 ? n : 1;
};
