import type {
	JMAPCredentials,
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
import axios, { AxiosInstance, AxiosError } from 'axios';

/**
 * JMAP Session response structure (RFC 8620)
 */
interface JMAPSession {
	capabilities: Record<string, unknown>;
	accounts: Record<
		string,
		{
			name: string;
			isPersonal: boolean;
			isReadOnly: boolean;
			accountCapabilities: Record<string, unknown>;
		}
	>;
	primaryAccounts: Record<string, string>;
	username: string;
	apiUrl: string;
	downloadUrl: string;
	uploadUrl: string;
	eventSourceUrl: string;
	state: string;
}

/**
 * JMAP method call structure
 */
type JMAPMethodCall = [string, Record<string, unknown>, string];

/**
 * JMAP response structure
 */
interface JMAPResponse {
	methodResponses: [string, Record<string, unknown>, string][];
	sessionState: string;
}

/**
 * JMAP Email object (subset of properties we need)
 */
interface JMAPEmail {
	id: string;
	blobId: string;
	threadId: string;
	mailboxIds: Record<string, boolean>;
	receivedAt: string;
	subject: string;
}

/**
 * JMAP Mailbox object
 */
interface JMAPMailbox {
	id: string;
	name: string;
	parentId: string | null;
	role: string | null;
}

/**
 * A connector for JMAP email servers (RFC 8620/8621).
 * Supports providers like Fastmail, Stalwart, Cyrus IMAP, and others.
 */
export class JMAPConnector implements IEmailConnector {
	private credentials: JMAPCredentials;
	private session: JMAPSession | null = null;
	private accountId: string | null = null;
	private httpClient: AxiosInstance;
	private newEmailState: string | null = null;
	private mailboxCache: Map<string, JMAPMailbox> = new Map();
	private statusMessage: string | undefined;

	constructor(credentials: JMAPCredentials) {
		this.credentials = credentials;
		this.httpClient = this.createHttpClient();
	}

	private createHttpClient(): AxiosInstance {
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
		};

		if (this.credentials.authMethod === 'bearer') {
			if (!this.credentials.bearerToken) {
				throw new Error('JMAP bearer authentication requires a token.');
			}
			headers['Authorization'] = `Bearer ${this.credentials.bearerToken}`;
		} else if (this.credentials.authMethod === 'basic') {
			if (!this.credentials.username || !this.credentials.password) {
				throw new Error('JMAP basic authentication requires username and password.');
			}
		}

		const client = axios.create({
			headers,
			timeout: 60000,
			...(this.credentials.authMethod === 'basic' && {
				auth: {
					username: this.credentials.username!,
					password: this.credentials.password!,
				},
			}),
		});

		return client;
	}

	/**
	 * Fetches the JMAP session document, either from the provided URL
	 * or via .well-known discovery.
	 */
	private async fetchSession(): Promise<JMAPSession> {
		if (this.session) {
			return this.session;
		}

		let sessionUrl = this.credentials.sessionUrl;

		// If the URL doesn't look like a session endpoint, try .well-known discovery
		if (!sessionUrl.includes('/session') && !sessionUrl.includes('/.well-known/jmap')) {
			const wellKnownUrl = sessionUrl.replace(/\/$/, '') + '/.well-known/jmap';
			try {
				const response = await this.httpClient.get<JMAPSession>(wellKnownUrl);
				this.session = response.data;
				return this.session;
			} catch (error) {
				// Fall back to using the URL directly
				logger.debug(
					{ wellKnownUrl },
					'Well-known discovery failed, using session URL directly'
				);
			}
		}

		const response = await this.httpClient.get<JMAPSession>(sessionUrl);
		this.session = response.data;
		return this.session;
	}

	/**
	 * Gets the primary account ID for mail capabilities.
	 */
	private async getAccountId(): Promise<string> {
		if (this.accountId) {
			return this.accountId;
		}

		const session = await this.fetchSession();

		// Try to find the primary account for mail
		const mailCapability = 'urn:ietf:params:jmap:mail';
		if (session.primaryAccounts && session.primaryAccounts[mailCapability]) {
			this.accountId = session.primaryAccounts[mailCapability];
			return this.accountId;
		}

		// Fall back to first account with mail capability
		for (const [accountId, account] of Object.entries(session.accounts)) {
			if (account.accountCapabilities && mailCapability in account.accountCapabilities) {
				this.accountId = accountId;
				return this.accountId;
			}
		}

		throw new Error('No JMAP account with mail capability found');
	}

	/**
	 * Makes a JMAP API request with the given method calls.
	 */
	private async jmapRequest(methodCalls: JMAPMethodCall[]): Promise<JMAPResponse> {
		const session = await this.fetchSession();

		const request = {
			using: ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:mail'],
			methodCalls,
		};

		const response = await this.httpClient.post<JMAPResponse>(session.apiUrl, request);
		return response.data;
	}

	/**
	 * Wraps a JMAP operation with retry logic for transient errors.
	 */
	private async withRetry<T>(action: () => Promise<T>, maxRetries = 5): Promise<T> {
		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			try {
				return await action();
			} catch (err: any) {
				const isRetryable =
					err instanceof AxiosError &&
					(err.code === 'ECONNRESET' ||
						err.code === 'ETIMEDOUT' ||
						(err.response?.status && err.response.status >= 500));

				if (!isRetryable || attempt === maxRetries) {
					logger.error({ err, attempt }, 'JMAP operation failed');
					throw err;
				}

				const delay = Math.pow(2, attempt) * 1000;
				const jitter = Math.random() * 1000;
				logger.info(
					`JMAP request failed, retrying in ${Math.round((delay + jitter) / 1000)}s`
				);
				await new Promise((resolve) => setTimeout(resolve, delay + jitter));
			}
		}
		throw new Error('JMAP operation failed after all retries.');
	}

	/**
	 * Downloads the raw email blob.
	 */
	private async downloadBlob(blobId: string, accountId: string): Promise<Buffer> {
		const session = await this.fetchSession();

		// The download URL template contains placeholders
		let downloadUrl = session.downloadUrl
			.replace('{accountId}', encodeURIComponent(accountId))
			.replace('{blobId}', encodeURIComponent(blobId))
			.replace('{type}', 'application/octet-stream')
			.replace('{name}', 'email.eml');

		const response = await this.httpClient.get(downloadUrl, {
			responseType: 'arraybuffer',
		});

		return Buffer.from(response.data);
	}

	/**
	 * Fetches and caches all mailboxes for path resolution.
	 */
	private async fetchMailboxes(accountId: string): Promise<void> {
		if (this.mailboxCache.size > 0) {
			return;
		}

		const response = await this.jmapRequest([
			[
				'Mailbox/get',
				{
					accountId,
					properties: ['id', 'name', 'parentId', 'role'],
				},
				'mailboxes',
			],
		]);

		const [, result] = response.methodResponses[0];
		const mailboxes = (result as any).list as JMAPMailbox[];

		for (const mailbox of mailboxes) {
			this.mailboxCache.set(mailbox.id, mailbox);
		}
	}

	/**
	 * Builds the full path for a mailbox by traversing parent hierarchy.
	 */
	private getMailboxPath(mailboxId: string): string {
		const mailbox = this.mailboxCache.get(mailboxId);
		if (!mailbox) {
			return '';
		}

		const parts: string[] = [mailbox.name];
		let current = mailbox;

		while (current.parentId) {
			const parent = this.mailboxCache.get(current.parentId);
			if (!parent) break;
			parts.unshift(parent.name);
			current = parent;
		}

		return parts.join('/');
	}

	/**
	 * Tests the connection by fetching the JMAP session.
	 */
	public async testConnection(): Promise<boolean> {
		try {
			const session = await this.fetchSession();
			const accountId = await this.getAccountId();

			logger.info(
				{ username: session.username, accountId },
				'JMAP connection test successful.'
			);
			return true;
		} catch (error) {
			logger.error({ err: error }, 'Failed to verify JMAP connection');
			throw error;
		}
	}

	/**
	 * Lists the JMAP accounts available (typically one for personal accounts).
	 */
	public async *listAllUsers(): AsyncGenerator<MailboxUser> {
		const session = await this.fetchSession();
		const accountId = await this.getAccountId();

		const account = session.accounts[accountId];

		yield {
			id: accountId,
			primaryEmail: session.username,
			displayName: account?.name || session.username,
		};
	}

	/**
	 * Returns the JMAP username as the user email for compatibility.
	 */
	public returnImapUserEmail(): string {
		return this.session?.username || '';
	}

	/**
	 * Fetches emails using JMAP Email/query and Email/get methods.
	 * Uses Email/changes for incremental sync when state is available.
	 */
	public async *fetchEmails(
		userEmail: string,
		syncState?: SyncState | null
	): AsyncGenerator<EmailObject | null> {
		const accountId = await this.getAccountId();
		await this.fetchMailboxes(accountId);

		const existingState = syncState?.jmap?.[accountId]?.emailState;

		if (existingState) {
			yield* this.fetchEmailChanges(accountId, existingState);
		} else {
			yield* this.fetchAllEmails(accountId);
		}
	}

	/**
	 * Fetches all emails for initial import using Email/query pagination.
	 */
	private async *fetchAllEmails(accountId: string): AsyncGenerator<EmailObject | null> {
		const BATCH_SIZE = 50;
		let position = 0;
		let hasMore = true;

		while (hasMore) {
			const response = await this.withRetry(async () =>
				this.jmapRequest([
					[
						'Email/query',
						{
							accountId,
							sort: [{ property: 'receivedAt', isAscending: false }],
							position,
							limit: BATCH_SIZE,
							...(config.app.allInclusiveArchive
								? {}
								: {
										filter: {
											inMailboxOtherThan:
												await this.getExcludedMailboxIds(accountId),
										},
									}),
						},
						'query',
					],
					[
						'Email/get',
						{
							accountId,
							'#ids': {
								resultOf: 'query',
								name: 'Email/query',
								path: '/ids',
							},
							properties: [
								'id',
								'blobId',
								'threadId',
								'mailboxIds',
								'receivedAt',
								'subject',
							],
						},
						'emails',
					],
				])
			);

			const queryResult = response.methodResponses[0][1] as any;
			const emailsResult = response.methodResponses[1][1] as any;

			const emails = emailsResult.list as JMAPEmail[];
			const state = emailsResult.state as string;

			if (state) {
				this.newEmailState = state;
			}

			for (const email of emails) {
				try {
					const emailObject = await this.fetchAndParseEmail(email, accountId);
					if (emailObject) {
						yield emailObject;
					}
				} catch (err) {
					logger.error({ err, emailId: email.id }, 'Failed to fetch/parse JMAP email');
				}
			}

			position += emails.length;
			hasMore = queryResult.ids.length === BATCH_SIZE;
		}
	}

	/**
	 * Fetches changed emails using Email/changes for incremental sync.
	 */
	private async *fetchEmailChanges(
		accountId: string,
		sinceState: string
	): AsyncGenerator<EmailObject | null> {
		try {
			const response = await this.withRetry(async () =>
				this.jmapRequest([
					[
						'Email/changes',
						{
							accountId,
							sinceState,
						},
						'changes',
					],
				])
			);

			const changesResult = response.methodResponses[0][1] as any;

			// Handle cannotCalculateChanges error - fall back to full sync
			if (response.methodResponses[0][0] === 'error') {
				const errorType = (changesResult as any).type;
				if (errorType === 'cannotCalculateChanges') {
					logger.info('JMAP state too old, performing full re-sync');
					yield* this.fetchAllEmails(accountId);
					return;
				}
				throw new Error(`JMAP error: ${errorType}`);
			}

			const newState = changesResult.newState as string;
			const created = changesResult.created as string[];
			const updated = changesResult.updated as string[];

			if (newState) {
				this.newEmailState = newState;
			}

			// Fetch newly created and updated emails
			const idsToFetch = [...(created || []), ...(updated || [])];

			if (idsToFetch.length > 0) {
				// Fetch in batches
				const BATCH_SIZE = 50;
				for (let i = 0; i < idsToFetch.length; i += BATCH_SIZE) {
					const batch = idsToFetch.slice(i, i + BATCH_SIZE);

					const emailResponse = await this.withRetry(async () =>
						this.jmapRequest([
							[
								'Email/get',
								{
									accountId,
									ids: batch,
									properties: [
										'id',
										'blobId',
										'threadId',
										'mailboxIds',
										'receivedAt',
										'subject',
									],
								},
								'emails',
							],
						])
					);

					const emailsResult = emailResponse.methodResponses[0][1] as any;
					const emails = emailsResult.list as JMAPEmail[];

					for (const email of emails) {
						try {
							const emailObject = await this.fetchAndParseEmail(email, accountId);
							if (emailObject) {
								yield emailObject;
							}
						} catch (err) {
							logger.error(
								{ err, emailId: email.id },
								'Failed to fetch/parse JMAP email'
							);
						}
					}
				}
			}
		} catch (err: any) {
			// If changes request fails, fall back to full sync
			if (err.message?.includes('cannotCalculateChanges')) {
				logger.info('JMAP state invalid, performing full re-sync');
				yield* this.fetchAllEmails(accountId);
			} else {
				throw err;
			}
		}
	}

	/**
	 * Gets mailbox IDs to exclude (Trash, Junk) for non-inclusive archives.
	 */
	private async getExcludedMailboxIds(accountId: string): Promise<string[]> {
		const excludedIds: string[] = [];

		for (const [id, mailbox] of this.mailboxCache) {
			if (mailbox.role === 'trash' || mailbox.role === 'junk') {
				excludedIds.push(id);
			}
		}

		return excludedIds;
	}

	/**
	 * Fetches the raw email blob and parses it.
	 */
	private async fetchAndParseEmail(
		email: JMAPEmail,
		accountId: string
	): Promise<EmailObject | null> {
		const rawEmail = await this.withRetry(async () =>
			this.downloadBlob(email.blobId, accountId)
		);

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

		// Get mailbox paths
		const mailboxIds = Object.keys(email.mailboxIds || {});
		const paths = mailboxIds.map((id) => this.getMailboxPath(id)).filter(Boolean);
		const path = paths[0] || '';
		const tags = paths;

		const threadId = getThreadId(parsedEmail.headers);

		return {
			id: email.id,
			threadId: threadId || email.threadId,
			userEmail: this.session?.username,
			eml: rawEmail,
			from: mapAddresses(parsedEmail.from),
			to: mapAddresses(parsedEmail.to),
			cc: mapAddresses(parsedEmail.cc),
			bcc: mapAddresses(parsedEmail.bcc),
			subject: parsedEmail.subject || email.subject || '',
			body: parsedEmail.text || '',
			html: parsedEmail.html || '',
			headers: parsedEmail.headers,
			attachments,
			receivedAt: parsedEmail.date || new Date(email.receivedAt),
			path,
			tags,
		};
	}

	/**
	 * Returns the updated sync state with the latest email state.
	 */
	public getUpdatedSyncState(userEmail?: string): SyncState {
		if (!this.accountId || !this.newEmailState) {
			return {};
		}

		const syncState: SyncState = {
			jmap: {
				[this.accountId]: {
					emailState: this.newEmailState,
				},
			},
		};

		if (this.statusMessage) {
			syncState.statusMessage = this.statusMessage;
		}

		return syncState;
	}
}
