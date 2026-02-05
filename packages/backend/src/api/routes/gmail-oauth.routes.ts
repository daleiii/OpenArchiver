import { Router } from 'express';
import { GmailOAuthController } from '../controllers/gmail-oauth.controller';
import { requireAuth } from '../middleware/requireAuth';
import { requirePermission } from '../middleware/requirePermission';
import { AuthService } from '../../services/AuthService';

export const createGmailOAuthRouter = (authService: AuthService): Router => {
	const router = Router();
	const gmailOAuthController = new GmailOAuthController();

	/**
	 * @route GET /api/v1/auth/gmail/authorize
	 * @description Generates Google OAuth authorization URL for Gmail
	 * @access Protected - requires authentication and ingestion create permission
	 */
	router.get(
		'/authorize',
		requireAuth(authService),
		requirePermission('create', 'ingestion'),
		gmailOAuthController.authorize
	);

	/**
	 * @route GET /api/v1/auth/gmail/callback
	 * @description Handles OAuth callback from Google
	 * @access Public - callback from Google
	 */
	router.get('/callback', gmailOAuthController.callback);

	return router;
};
