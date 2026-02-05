import { Request, Response } from 'express';
import { google } from 'googleapis';
import { config } from '../../config';
import { logger } from '../../config/logger';
import { IngestionService } from '../../services/IngestionService';
import { CryptoService } from '../../services/CryptoService';
import { db } from '../../database';
import { ingestionSources } from '../../database/schema';
import { eq } from 'drizzle-orm';
import type { GmailCredentials } from '@open-archiver/types';

export class GmailOAuthController {
	/**
	 * Generates the Google OAuth authorization URL and redirects the user.
	 * The sourceId is passed in the state parameter for CSRF protection and to identify
	 * which ingestion source to update after authorization.
	 */
	public authorize = async (req: Request, res: Response): Promise<Response | void> => {
		try {
			const { sourceId } = req.query;

			if (!sourceId || typeof sourceId !== 'string') {
				return res.status(400).json({ message: 'Missing sourceId parameter' });
			}

			if (!config.googleOAuth.clientId || !config.googleOAuth.clientSecret) {
				return res.status(500).json({
					message: 'Google OAuth is not configured. Please set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET environment variables.',
				});
			}

			if (!config.googleOAuth.redirectUri) {
				return res.status(500).json({
					message: 'Google OAuth redirect URI is not configured. Please set GOOGLE_OAUTH_REDIRECT_URI environment variable.',
				});
			}

			// Verify the ingestion source exists and is in pending_auth status
			const source = await IngestionService.findById(sourceId);
			if (!source) {
				return res.status(404).json({ message: 'Ingestion source not found' });
			}

			if (source.provider !== 'gmail') {
				return res.status(400).json({ message: 'Ingestion source is not a Gmail provider' });
			}

			const oauth2Client = new google.auth.OAuth2(
				config.googleOAuth.clientId,
				config.googleOAuth.clientSecret,
				config.googleOAuth.redirectUri
			);

			const scopes = [
				'https://www.googleapis.com/auth/gmail.readonly',
				'https://www.googleapis.com/auth/userinfo.email',
			];

			const authUrl = oauth2Client.generateAuthUrl({
				access_type: 'offline',
				scope: scopes,
				state: sourceId,
				prompt: 'consent', // Force consent to always get refresh token
			});

			return res.json({ authUrl });
		} catch (error) {
			logger.error({ err: error }, 'Failed to generate Gmail OAuth URL');
			return res.status(500).json({ message: 'Failed to generate authorization URL' });
		}
	};

	/**
	 * Handles the OAuth callback from Google.
	 * Exchanges the authorization code for tokens and updates the ingestion source.
	 */
	public callback = async (req: Request, res: Response): Promise<Response | void> => {
		try {
			const { code, state: sourceId, error } = req.query;

			const frontendUrl = process.env.APP_URL || 'http://localhost:3000';

			if (error) {
				logger.warn({ error }, 'Gmail OAuth authorization denied');
				return res.redirect(
					`${frontendUrl}/dashboard/ingestions?gmail_auth=error&message=${encodeURIComponent(String(error))}`
				);
			}

			if (!code || typeof code !== 'string') {
				return res.redirect(
					`${frontendUrl}/dashboard/ingestions?gmail_auth=error&message=${encodeURIComponent('Missing authorization code')}`
				);
			}

			if (!sourceId || typeof sourceId !== 'string') {
				return res.redirect(
					`${frontendUrl}/dashboard/ingestions?gmail_auth=error&message=${encodeURIComponent('Missing source ID')}`
				);
			}

			if (!config.googleOAuth.clientId || !config.googleOAuth.clientSecret) {
				return res.redirect(
					`${frontendUrl}/dashboard/ingestions?gmail_auth=error&message=${encodeURIComponent('Google OAuth not configured')}`
				);
			}

			const oauth2Client = new google.auth.OAuth2(
				config.googleOAuth.clientId,
				config.googleOAuth.clientSecret,
				config.googleOAuth.redirectUri
			);

			// Exchange code for tokens
			const { tokens } = await oauth2Client.getToken(code);

			if (!tokens.refresh_token) {
				logger.error({}, 'No refresh token received from Google');
				return res.redirect(
					`${frontendUrl}/dashboard/ingestions?gmail_auth=error&message=${encodeURIComponent('No refresh token received. Please revoke access and try again.')}`
				);
			}

			oauth2Client.setCredentials(tokens);

			// Get user email from userinfo
			const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
			const userInfo = await oauth2.userinfo.get();
			const userEmail = userInfo.data.email;

			if (!userEmail) {
				return res.redirect(
					`${frontendUrl}/dashboard/ingestions?gmail_auth=error&message=${encodeURIComponent('Could not get user email from Google')}`
				);
			}

			// Update the ingestion source with the credentials
			const credentials: GmailCredentials = {
				type: 'gmail',
				refreshToken: tokens.refresh_token,
				userEmail: userEmail,
			};

			const encryptedCredentials = CryptoService.encryptObject(credentials);

			await db
				.update(ingestionSources)
				.set({
					credentials: encryptedCredentials,
					status: 'auth_success',
				})
				.where(eq(ingestionSources.id, sourceId));

			logger.info({ sourceId, userEmail }, 'Gmail OAuth authorization successful');

			// Trigger initial import
			await IngestionService.triggerInitialImport(sourceId);

			return res.redirect(
				`${frontendUrl}/dashboard/ingestions?gmail_auth=success&sourceId=${sourceId}`
			);
		} catch (error: any) {
			logger.error({ err: error }, 'Gmail OAuth callback error');
			const frontendUrl = process.env.APP_URL || 'http://localhost:3000';
			const message = error.message || 'Authorization failed';
			return res.redirect(
				`${frontendUrl}/dashboard/ingestions?gmail_auth=error&message=${encodeURIComponent(message)}`
			);
		}
	};
}
