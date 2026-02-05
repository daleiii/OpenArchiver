import type { EmailDocument } from './email.types';

export type MatchingStrategy = 'last' | 'all' | 'frequency';
export type SearchSort = 'relevance' | 'date_desc' | 'date_asc';

export interface SearchQuery {
	query: string;
	filters?: Record<string, any>;
	page?: number;
	limit?: number;
	matchingStrategy?: MatchingStrategy;
	sort?: SearchSort;
}

export interface SearchHit extends EmailDocument {
	_matchesPosition?: {
		[key: string]: { start: number; length: number; indices?: number[] }[];
	};
	_formatted?: Partial<EmailDocument>;
	_rankingScore?: number;
}

export interface SearchResult {
	hits: SearchHit[];
	total: number;
	page: number;
	limit: number;
	totalPages: number;
	processingTimeMs: number;
}
