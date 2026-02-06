import 'dotenv/config';

export const searchConfig = {
	host: process.env.MEILI_HOST || 'http://127.0.0.1:7700',
	apiKey: process.env.MEILI_MASTER_KEY || '',
};

export const meiliConfig = {
	indexingBatchSize: process.env.MEILI_INDEXING_BATCH
		? parseInt(process.env.MEILI_INDEXING_BATCH)
		: 500,
	/**
	 * Default max total hits for search pagination.
	 * Set to 0 or negative for unlimited (uses Meilisearch maximum).
	 * Can be overridden via System Settings UI.
	 */
	defaultMaxTotalHits: process.env.MEILI_MAX_TOTAL_HITS
		? parseInt(process.env.MEILI_MAX_TOTAL_HITS)
		: 1000,
};
