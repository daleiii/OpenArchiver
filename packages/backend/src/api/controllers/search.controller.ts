import { Request, Response } from 'express';
import { SearchService } from '../../services/SearchService';
import { MatchingStrategies } from 'meilisearch';
import type { SearchSort } from '@open-archiver/types';

export class SearchController {
	private searchService: SearchService;

	constructor() {
		this.searchService = new SearchService();
	}

	public search = async (req: Request, res: Response): Promise<void> => {
		try {
			const { keywords, page, limit, matchingStrategy, sort } = req.query;
			const userId = req.user?.sub;

			if (!userId) {
				res.status(401).json({ message: req.t('errors.unauthorized') });
				return;
			}

			if (!keywords) {
				res.status(400).json({ message: req.t('search.keywordsRequired') });
				return;
			}

			// Extract filters from query params (filters[from], filters[to], etc.)
			const filters: Record<string, any> = {};
			for (const [key, value] of Object.entries(req.query)) {
				if (key.startsWith('filters[') && key.endsWith(']')) {
					const filterKey = key.slice(8, -1); // Extract key from "filters[key]"
					filters[filterKey] = value;
				}
			}

			const results = await this.searchService.searchEmails(
				{
					query: keywords as string,
					page: page ? parseInt(page as string) : 1,
					limit: limit ? parseInt(limit as string) : 10,
					matchingStrategy: matchingStrategy as MatchingStrategies,
					sort: (sort as SearchSort) || 'date_desc',
					filters: Object.keys(filters).length > 0 ? filters : undefined,
				},
				userId,
				req.ip || 'unknown'
			);

			res.status(200).json(results);
		} catch (error) {
			const message = error instanceof Error ? error.message : req.t('errors.unknown');
			res.status(500).json({ message });
		}
	};
}
