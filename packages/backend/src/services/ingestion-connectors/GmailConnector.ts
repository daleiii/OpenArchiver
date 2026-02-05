import { google } from 'googleapis';
import type { gmail_v1, Common } from 'googleapis';
import type {
	GmailCredentials,
	EmailObject,
	EmailAddress,
	SyncState,
	MailboxUser,
} from '@open-archiver/types';
import type { IEmailConnector } from '../EmailProviderFactory';
import { logger } from '../../config/logger';
import { config } from '../../config';
import { simpleParser, ParsedMail, Attachment, AddressObject } from 'mailparser';
import { getThreadId } from './helpers/utils';

/**
 * A connector for personal Gmail accounts using OAuth 2.0 user consent flow.
 * Unlike GoogleWorkspaceConnector which uses service account with domain-wide delegation,
 * this connector authenticates a single user via OAuth.
 */
export class GmailConnector implements IEmailConnector {
	private credentials: GmailCredentials;
	private newHistoryId: string | undefined;
	private labelCache: Map<string, gmail_v1.Schema$Label> = new Map();

	constructor(credentials: GmailCredentials) {
		this.credentials = credentials;
		if (!credentials.refreshToken) {
			throw new Error('Gmail credentials must include a refresh token.');
		}
	}

	/**
	 * Creates an authenticated OAuth2 client for the user.
	 * @returns An authenticated OAuth2 client.
	 */
	private getAuthClient() {
		const oauth2Client = new google.auth.OAuth2(
			config.googleOAuth.clientId,
			config.googleOAuth.clientSecret
		);
		oauth2Client.setCredentials({ refresh_token: this.credentials.refreshToken });
		return oauth2Client;
	}

	/**
	 * Tests the connection by attempting to get the user's profile.
	 */
	public async testConnection(): Promise<boolean> {
		try {
			const authClient = this.getAuthClient();
			const gmail = google.gmail({ version: 'v1', auth: authClient });

			const profile = await gmail.users.getProfile({ userId: 'me' });

			if (profile.data.emailAddress) {
				logger.info(
					{ email: profile.data.emailAddress },
					'Gmail OAuth connection test successful.'
				);
				return true;
			}

			return false;
		} catch (error) {
			logger.error({ err: error }, 'Failed to verify Gmail OAuth connection');
			throw error;
		}
	}

	/**
	 * Lists the single authenticated user (Gmail OAuth only has access to one account).
	 * @returns An async generator that yields the single user.
	 */
	public async *listAllUsers(): AsyncGenerator<MailboxUser> {
		const authClient = this.getAuthClient();
		const gmail = google.gmail({ version: 'v1', auth: authClient });

		const profile = await gmail.users.getProfile({ userId: 'me' });

		if (profile.data.emailAddress) {
			yield {
				id: profile.data.emailAddress,
				primaryEmail: profile.data.emailAddress,
				displayName: profile.data.emailAddress,
			};
		}
	}

	/**
	 * Fetches emails for the authenticated user, starting from a specific history ID.
	 * @param userEmail The email of the user (should match the authenticated account).
	 * @param syncState Optional state containing the startHistoryId.
	 * @returns An async generator that yields each email object.
	 */
	public async *fetchEmails(
		userEmail: string,
		syncState?: SyncState | null
	): AsyncGenerator<EmailObject> {
		const authClient = this.getAuthClient();
		const gmail = google.gmail({ version: 'v1', auth: authClient });
		let pageToken: string | undefined = undefined;

		const startHistoryId = syncState?.gmail?.[userEmail]?.historyId;

		// If no sync state is provided for this user, this is an initial import. Get all messages.
		if (!startHistoryId) {
			yield* this.fetchAllMessagesForUser(gmail, userEmail);
			return;
		}

		this.newHistoryId = startHistoryId;

		do {
			const historyResponse: Common.GaxiosResponseWithHTTP2<gmail_v1.Schema$ListHistoryResponse> =
				await gmail.users.history.list({
					userId: 'me',
					startHistoryId: this.newHistoryId,
					pageToken: pageToken,
					historyTypes: ['messageAdded'],
				});

			const histories = historyResponse.data.history;
			if (!histories || histories.length === 0) {
				return;
			}

			for (const historyRecord of histories) {
				if (historyRecord.messagesAdded) {
					for (const messageAdded of historyRecord.messagesAdded) {
						if (messageAdded.message?.id) {
							try {
								const messageId = messageAdded.message.id;
								const email = await this.fetchSingleMessage(
									gmail,
									messageId,
									userEmail
								);
								if (email) {
									yield email;
								}
							} catch (error: any) {
								if (error.code === 404) {
									logger.warn(
										{ messageId: messageAdded.message.id, userEmail },
										'Message not found, skipping.'
									);
								} else {
									throw error;
								}
							}
						}
					}
				}
			}

			pageToken = historyResponse.data.nextPageToken ?? undefined;
			if (historyResponse.data.historyId) {
				this.newHistoryId = historyResponse.data.historyId;
			}
		} while (pageToken);
	}

	private async *fetchAllMessagesForUser(
		gmail: gmail_v1.Gmail,
		userEmail: string
	): AsyncGenerator<EmailObject> {
		let pageToken: string | undefined = undefined;
		do {
			const listResponse: Common.GaxiosResponseWithHTTP2<gmail_v1.Schema$ListMessagesResponse> =
				await gmail.users.messages.list({
					userId: 'me',
					pageToken: pageToken,
				});

			const messages = listResponse.data.messages;
			if (!messages || messages.length === 0) {
				return;
			}

			for (const message of messages) {
				if (message.id) {
					try {
						const email = await this.fetchSingleMessage(gmail, message.id, userEmail);
						if (email) {
							yield email;
						}
					} catch (error: any) {
						if (error.code === 404) {
							logger.warn(
								{ messageId: message.id, userEmail },
								'Message not found during initial import, skipping.'
							);
						} else {
							throw error;
						}
					}
				}
			}
			pageToken = listResponse.data.nextPageToken ?? undefined;
		} while (pageToken);

		// After fetching all messages, get the latest history ID for incremental sync.
		const profileResponse = await gmail.users.getProfile({ userId: 'me' });
		if (profileResponse.data.historyId) {
			this.newHistoryId = profileResponse.data.historyId;
		}
	}

	private async fetchSingleMessage(
		gmail: gmail_v1.Gmail,
		messageId: string,
		userEmail: string
	): Promise<EmailObject | null> {
		const metadataResponse = await gmail.users.messages.get({
			userId: 'me',
			id: messageId,
			format: 'METADATA',
			fields: 'labelIds',
		});
		const labels = await this.getLabelDetails(
			gmail,
			metadataResponse.data.labelIds || []
		);

		const msgResponse = await gmail.users.messages.get({
			userId: 'me',
			id: messageId,
			format: 'RAW',
		});

		if (!msgResponse.data.raw) {
			return null;
		}

		const rawEmail = Buffer.from(msgResponse.data.raw, 'base64url');
		const parsedEmail: ParsedMail = await simpleParser(rawEmail);
		const attachments = parsedEmail.attachments.map((attachment: Attachment) => ({
			filename: attachment.filename || 'untitled',
			contentType: attachment.contentType,
			size: attachment.size,
			content: attachment.content as Buffer,
		}));

		const mapAddresses = (
			addresses: AddressObject | AddressObject[] | undefined
		): EmailAddress[] => {
			if (!addresses) return [];
			const addressArray = Array.isArray(addresses) ? addresses : [addresses];
			return addressArray.flatMap((a) =>
				a.value.map((v) => ({ name: v.name, address: v.address || '' }))
			);
		};

		const threadId = getThreadId(parsedEmail.headers);

		return {
			id: msgResponse.data.id!,
			threadId,
			userEmail: userEmail,
			eml: rawEmail,
			from: mapAddresses(parsedEmail.from),
			to: mapAddresses(parsedEmail.to),
			cc: mapAddresses(parsedEmail.cc),
			bcc: mapAddresses(parsedEmail.bcc),
			subject: parsedEmail.subject || '',
			body: parsedEmail.text || '',
			html: parsedEmail.html || '',
			headers: parsedEmail.headers,
			attachments,
			receivedAt: parsedEmail.date || new Date(),
			path: labels.path,
			tags: labels.tags,
		};
	}

	public getUpdatedSyncState(userEmail: string): SyncState {
		if (!this.newHistoryId) {
			return {};
		}
		return {
			gmail: {
				[userEmail]: {
					historyId: this.newHistoryId,
				},
			},
		};
	}

	private async getLabelDetails(
		gmail: gmail_v1.Gmail,
		labelIds: string[]
	): Promise<{ path: string; tags: string[] }> {
		const tags: string[] = [];
		let path = '';

		for (const labelId of labelIds) {
			let label = this.labelCache.get(labelId);
			if (!label) {
				const res = await gmail.users.labels.get({ userId: 'me', id: labelId });
				label = res.data;
				this.labelCache.set(labelId, label);
			}

			if (label.name) {
				tags.push(label.name);
				if (label.type === 'user') {
					path = path ? `${path}/${label.name}` : label.name;
				}
			}
		}

		return { path, tags };
	}
}
