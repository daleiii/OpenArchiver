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

// Localhost redirect URI for manual code exchange
const REDIRECT_URI = 'http://localhost:4000/api/v1/auth/gmail/callback';

export class GmailOAuthController {
	/**
	 * Generates the Google OAuth authorization URL.
	 * User will be redirected to localhost which won't work,
	 * but they can copy the code from the URL.
	 */
	public getAuthUrl = async (req: Request, res: Response): Promise<Response> => {
		try {
			const { sourceId } = req.query;

			if (!sourceId || typeof sourceId !== 'string') {
				return res.status(400).json({ message: 'Missing sourceId parameter' });
			}

			if (!config.googleOAuth.clientId || !config.googleOAuth.clientSecret) {
				return res.status(500).json({
					message:
						'Google OAuth is not configured. Please set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET environment variables.',
				});
			}

			// Verify the ingestion source exists
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
				REDIRECT_URI
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
	 * Exchanges an authorization code for tokens.
	 * The code is manually provided by the user after they copy it from the redirect URL.
	 */
	public exchangeCode = async (req: Request, res: Response): Promise<Response> => {
		try {
			const { sourceId, code } = req.body;

			if (!sourceId || typeof sourceId !== 'string') {
				return res.status(400).json({ message: 'Missing sourceId parameter' });
			}

			if (!code || typeof code !== 'string') {
				return res.status(400).json({ message: 'Missing code parameter' });
			}

			if (!config.googleOAuth.clientId || !config.googleOAuth.clientSecret) {
				return res.status(500).json({ message: 'Google OAuth is not configured' });
			}

			// Verify the ingestion source exists
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
				REDIRECT_URI
			);

			// Exchange code for tokens
			const { tokens } = await oauth2Client.getToken(code);

			if (!tokens.refresh_token) {
				logger.error({}, 'No refresh token received from Google');
				return res.status(400).json({
					message:
						'No refresh token received. Please revoke access at myaccount.google.com/permissions and try again.',
				});
			}

			oauth2Client.setCredentials(tokens);

			// Get user email from userinfo
			const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
			const userInfo = await oauth2.userinfo.get();
			const userEmail = userInfo.data.email;

			if (!userEmail) {
				return res.status(400).json({
					message: 'Could not get user email from Google',
				});
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

			return res.json({
				success: true,
				message: 'Gmail account connected successfully',
				userEmail,
			});
		} catch (error: any) {
			logger.error({ err: error }, 'Gmail code exchange error');

			// Handle specific Google OAuth errors
			if (error.message?.includes('invalid_grant')) {
				return res.status(400).json({
					message: 'Invalid or expired code. Please try again with a new authorization.',
				});
			}

			return res.status(500).json({
				message: error.message || 'Authorization failed',
			});
		}
	};
}
