import type { Request, Response } from 'express';
import { SettingsService } from '../../services/SettingsService';
import { UserService } from '../../services/UserService';
import { SearchService } from '../../services/SearchService';

const settingsService = new SettingsService();
const userService = new UserService();
const searchService = new SearchService();

export const getSystemSettings = async (req: Request, res: Response) => {
	try {
		const settings = await settingsService.getSystemSettings();
		res.status(200).json(settings);
	} catch (error) {
		// A more specific error could be logged here
		res.status(500).json({ message: req.t('settings.failedToRetrieve') });
	}
};

export const updateSystemSettings = async (req: Request, res: Response) => {
	try {
		// Basic validation can be performed here if necessary
		if (!req.user || !req.user.sub) {
			return res.status(401).json({ message: 'Unauthorized' });
		}
		const actor = await userService.findById(req.user.sub);
		if (!actor) {
			return res.status(401).json({ message: 'Unauthorized' });
		}

		// Check if searchMaxTotalHits is being changed
		const currentSettings = await settingsService.getSystemSettings();
		const searchMaxTotalHitsChanged =
			req.body.searchMaxTotalHits !== undefined &&
			req.body.searchMaxTotalHits !== currentSettings.searchMaxTotalHits;

		const updatedSettings = await settingsService.updateSystemSettings(
			req.body,
			actor,
			req.ip || 'unknown'
		);

		// Reconfigure search index if maxTotalHits changed
		if (searchMaxTotalHitsChanged) {
			await searchService.configureEmailIndex(updatedSettings);
		}

		res.status(200).json(updatedSettings);
	} catch (error) {
		// A more specific error could be logged here
		res.status(500).json({ message: req.t('settings.failedToUpdate') });
	}
};
