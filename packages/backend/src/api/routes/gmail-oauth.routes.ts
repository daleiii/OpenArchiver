import { Router } from 'express';
import { GmailOAuthController } from '../controllers/gmail-oauth.controller';
import { requireAuth } from '../middleware/requireAuth';
import { requirePermission } from '../middleware/requirePermission';
import { AuthService } from '../../services/AuthService';

export const createGmailOAuthRouter = (authService: AuthService): Router => {
	const router = Router();
	const gmailOAuthController = new GmailOAuthController();

	/**
	 * @route GET /api/v1/auth/gmail/device
	 * @description Starts the Device Authorization flow for Gmail
	 * @access Protected - requires authentication and ingestion create permission
	 */
	router.get(
		'/device',
		requireAuth(authService),
		requirePermission('create', 'ingestion'),
		gmailOAuthController.startDeviceAuth
	);

	/**
	 * @route GET /api/v1/auth/gmail/device/poll
	 * @description Polls for device authorization completion
	 * @access Protected - requires authentication and ingestion create permission
	 */
	router.get(
		'/device/poll',
		requireAuth(authService),
		requirePermission('create', 'ingestion'),
		gmailOAuthController.pollDeviceAuth
	);

	return router;
};
