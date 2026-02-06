import type { PageServerLoad, RequestEvent } from './$types';
import { api } from '$lib/server/api';
import type { SearchResult } from '@open-archiver/types';
import type { MatchingStrategy, SearchSort } from '@open-archiver/types';

interface SearchFilters {
	from?: string;
	to?: string;
	cc?: string;
	bcc?: string;
	dateFrom?: string;
	dateTo?: string;
	threadId?: string;
	tags?: string;
	hasAttachments?: string;
	includeTags?: string;
	excludeTags?: string;
}

interface TagFacet {
	tag: string;
	count: number;
}

async function performSearch(
	keywords: string,
	page: number,
	limit: number,
	matchingStrategy: MatchingStrategy,
	sort: SearchSort,
	filters: SearchFilters,
	event: RequestEvent
) {
	if (!keywords) {
		return {
			searchResult: null,
			keywords: '',
			page: 1,
			limit,
			matchingStrategy: 'last',
			sort: 'date_desc',
			filters: {},
		};
	}

	try {
		const params = new URLSearchParams();
		params.set('keywords', keywords);
		params.set('page', String(page));
		params.set('limit', String(limit));
		params.set('matchingStrategy', matchingStrategy);
		params.set('sort', sort);

		// Add filters
		if (filters.from) params.set('filters[from]', filters.from);
		if (filters.to) params.set('filters[to]', filters.to);
		if (filters.cc) params.set('filters[cc]', filters.cc);
		if (filters.bcc) params.set('filters[bcc]', filters.bcc);
		if (filters.threadId) params.set('filters[threadId]', filters.threadId);
		if (filters.tags) params.set('filters[tags]', filters.tags);
		if (filters.hasAttachments) params.set('filters[hasAttachments]', filters.hasAttachments);
		if (filters.includeTags) params.set('filters[includeTags]', filters.includeTags);
		if (filters.excludeTags) params.set('filters[excludeTags]', filters.excludeTags);

		// Date filters need to be converted to timestamp comparisons
		if (filters.dateFrom) {
			const timestamp = new Date(filters.dateFrom).getTime();
			params.set('filters[timestamp_gte]', String(timestamp));
		}
		if (filters.dateTo) {
			// Set to end of day
			const date = new Date(filters.dateTo);
			date.setHours(23, 59, 59, 999);
			params.set('filters[timestamp_lte]', String(date.getTime()));
		}

		const response = await api(`/search?${params.toString()}`, event, {
			method: 'GET',
		});

		if (!response.ok) {
			const error = await response.json();
			return {
				searchResult: null,
				keywords,
				page,
				limit,
				matchingStrategy,
				sort,
				filters,
				error: error.message,
			};
		}

		const searchResult = (await response.json()) as SearchResult;
		return { searchResult, keywords, page, limit, matchingStrategy, sort, filters };
	} catch (error) {
		return {
			searchResult: null,
			keywords,
			page,
			limit,
			matchingStrategy,
			sort,
			filters,
			error: error instanceof Error ? error.message : 'Unknown error',
		};
	}
}

export const load: PageServerLoad = async (event) => {
	const keywords = event.url.searchParams.get('keywords') || '';
	const page = parseInt(event.url.searchParams.get('page') || '1');
	const limit = parseInt(event.url.searchParams.get('limit') || '10');
	const matchingStrategy = (event.url.searchParams.get('matchingStrategy') ||
		'last') as MatchingStrategy;
	const sort = (event.url.searchParams.get('sort') || 'date_desc') as SearchSort;

	const filters: SearchFilters = {
		from: event.url.searchParams.get('from') || undefined,
		to: event.url.searchParams.get('to') || undefined,
		cc: event.url.searchParams.get('cc') || undefined,
		bcc: event.url.searchParams.get('bcc') || undefined,
		dateFrom: event.url.searchParams.get('dateFrom') || undefined,
		dateTo: event.url.searchParams.get('dateTo') || undefined,
		threadId: event.url.searchParams.get('threadId') || undefined,
		tags: event.url.searchParams.get('tags') || undefined,
		hasAttachments: event.url.searchParams.get('hasAttachments') || undefined,
		includeTags: event.url.searchParams.get('includeTags') || undefined,
		excludeTags: event.url.searchParams.get('excludeTags') || undefined,
	};

	// Fetch available tags for the filter dropdowns
	let availableTags: TagFacet[] = [];
	try {
		const tagsResponse = await api('/search/facets/tags', event, { method: 'GET' });
		if (tagsResponse.ok) {
			availableTags = await tagsResponse.json();
		}
	} catch {
		// Silently fail - tags will just be empty
	}

	const searchData = await performSearch(
		keywords,
		page,
		limit,
		matchingStrategy,
		sort,
		filters,
		event
	);
	return { ...searchData, availableTags };
};
