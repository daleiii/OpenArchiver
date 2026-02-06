export type SupportedLanguage =
	| 'en' // English
	| 'es' // Spanish
	| 'fr' // French
	| 'de' // German
	| 'it' // Italian
	| 'pt' // Portuguese
	| 'nl' // Dutch
	| 'ja' // Japanese
	| 'et' // Estonian
	| 'el'; // Greek

export type Theme = 'light' | 'dark' | 'system';

export interface SystemSettings {
	/** The default display language for the application UI. */
	language: SupportedLanguage;

	/** The default color theme for the application. */
	theme: Theme;

	/** A public-facing email address for user support inquiries. */
	supportEmail: string | null;

	/**
	 * Maximum number of search results that can be paginated through.
	 * Set to null for unlimited (Meilisearch maximum).
	 * Default is 1000 if not configured.
	 */
	searchMaxTotalHits: number | null;
}
