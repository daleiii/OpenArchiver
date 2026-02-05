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

// Google's Device Authorization endpoints
const DEVICE_AUTH_ENDPOINT = 'https://oauth2.googleapis.com/device/code';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

export class GmailOAuthController {
	/**
	 * Initiates the Device Authorization flow.
	 * Returns a user code that the user must enter at google.com/device
	 */
	public startDeviceAuth = async (req: Request, res: Response): Promise<Response> => {
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

			// Request device and user codes from Google
			const response = await fetch(DEVICE_AUTH_ENDPOINT, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
				},
				body: new URLSearchParams({
					client_id: config.googleOAuth.clientId,
					scope: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/userinfo.email',
				}),
			});

			if (!response.ok) {
				const errorData = await response.json();
				logger.error({ error: errorData }, 'Failed to start device authorization');
				return res.status(500).json({
					message: 'Failed to start device authorization',
					error: errorData,
				});
			}

			const data = await response.json();

			return res.json({
				userCode: data.user_code,
				verificationUrl: data.verification_url,
				deviceCode: data.device_code,
				expiresIn: data.expires_in,
				interval: data.interval,
			});
		} catch (error) {
			logger.error({ err: error }, 'Failed to start Gmail device authorization');
			return res.status(500).json({ message: 'Failed to start device authorization' });
		}
	};

	/**
	 * Polls Google to check if the user has completed authorization.
	 * Should be called repeatedly by the frontend until success or expiration.
	 */
	public pollDeviceAuth = async (req: Request, res: Response): Promise<Response> => {
		try {
			const { sourceId, deviceCode } = req.query;

			if (!sourceId || typeof sourceId !== 'string') {
				return res.status(400).json({ message: 'Missing sourceId parameter' });
			}

			if (!deviceCode || typeof deviceCode !== 'string') {
				return res.status(400).json({ message: 'Missing deviceCode parameter' });
			}

			if (!config.googleOAuth.clientId || !config.googleOAuth.clientSecret) {
				return res.status(500).json({ message: 'Google OAuth is not configured' });
			}

			// Poll Google's token endpoint
			const response = await fetch(TOKEN_ENDPOINT, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
				},
				body: new URLSearchParams({
					client_id: config.googleOAuth.clientId,
					client_secret: config.googleOAuth.clientSecret,
					device_code: deviceCode,
					grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
				}),
			});

			const data = await response.json();

			// Check for pending authorization
			if (data.error === 'authorization_pending') {
				return res.json({ status: 'pending', message: 'Waiting for user authorization' });
			}

			// Check for slow down request
			if (data.error === 'slow_down') {
				return res.json({ status: 'slow_down', message: 'Please slow down polling' });
			}

			// Check for other errors
			if (data.error) {
				logger.error({ error: data }, 'Device authorization error');
				return res.json({
					status: 'error',
					message: data.error_description || data.error,
				});
			}

			// Success - we have tokens
			if (!data.refresh_token) {
				logger.error({}, 'No refresh token received from Google');
				return res.json({
					status: 'error',
					message: 'No refresh token received. Please try again.',
				});
			}

			// Get user email using the access token
			const oauth2Client = new google.auth.OAuth2(
				config.googleOAuth.clientId,
				config.googleOAuth.clientSecret
			);
			oauth2Client.setCredentials({
				access_token: data.access_token,
				refresh_token: data.refresh_token,
			});

			const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
			const userInfo = await oauth2.userinfo.get();
			const userEmail = userInfo.data.email;

			if (!userEmail) {
				return res.json({
					status: 'error',
					message: 'Could not get user email from Google',
				});
			}

			// Update the ingestion source with the credentials
			const credentials: GmailCredentials = {
				type: 'gmail',
				refreshToken: data.refresh_token,
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

			logger.info({ sourceId, userEmail }, 'Gmail device authorization successful');

			// Trigger initial import
			await IngestionService.triggerInitialImport(sourceId);

			return res.json({
				status: 'success',
				message: 'Gmail account connected successfully',
				userEmail,
			});
		} catch (error: any) {
			logger.error({ err: error }, 'Gmail device authorization poll error');
			return res.json({
				status: 'error',
				message: error.message || 'Authorization failed',
			});
		}
	};
}
