import { Router } from 'express';
import { GmailOAuthController } from '../controllers/gmail-oauth.controller';
import { requireAuth } from '../middleware/requireAuth';
import { requirePermission } from '../middleware/requirePermission';
import { AuthService } from '../../services/AuthService';

export const createGmailOAuthRouter = (authService: AuthService): Router => {
	const router = Router();
	const gmailOAuthController = new GmailOAuthController();

	/**
	 * @route GET /api/v1/auth/gmail/url
	 * @description Generates Google OAuth authorization URL
	 * @access Protected - requires authentication and ingestion create permission
	 */
	router.get(
		'/url',
		requireAuth(authService),
		requirePermission('create', 'ingestion'),
		gmailOAuthController.getAuthUrl
	);

	/**
	 * @route POST /api/v1/auth/gmail/exchange
	 * @description Exchanges authorization code for tokens
	 * @access Protected - requires authentication and ingestion create permission
	 */
	router.post(
		'/exchange',
		requireAuth(authService),
		requirePermission('create', 'ingestion'),
		gmailOAuthController.exchangeCode
	);

	return router;
};
