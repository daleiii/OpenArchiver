import { Job, FlowChildJob } from 'bullmq';
import { IngestionService } from '../../services/IngestionService';
import { IInitialImportJob, IngestionProvider } from '@open-archiver/types';
import { EmailProviderFactory } from '../../services/EmailProviderFactory';
import { flowProducer } from '../queues';
import { logger } from '../../config/logger';

export default async (job: Job<IInitialImportJob>) => {
	const { ingestionSourceId } = job.data;
	logger.info({ ingestionSourceId }, 'Starting initial import master job');

	try {
		const source = await IngestionService.findById(ingestionSourceId);
		if (!source) {
			throw new Error(`Ingestion source with ID ${ingestionSourceId} not found`);
		}

		const isReconnect = source.syncState !== null;
		await IngestionService.update(ingestionSourceId, {
			status: 'importing',
			lastSyncStatusMessage: isReconnect ? 'Reconnecting...' : 'Starting initial import...',
		});

		const connector = EmailProviderFactory.createConnector(source);

		// if (connector instanceof GoogleWorkspaceConnector || connector instanceof MicrosoftConnector) {
		const jobs: FlowChildJob[] = [];
		let userCount = 0;
		for await (const user of connector.listAllUsers()) {
			if (user.primaryEmail) {
				jobs.push({
					name: 'process-mailbox',
					queueName: 'ingestion',
					data: {
						ingestionSourceId,
						userEmail: user.primaryEmail,
					},
					opts: {
						removeOnComplete: {
							age: 60 * 10, // 10 minutes
						},
						removeOnFail: {
							age: 60 * 30, // 30 minutes
						},
						attempts: 1,
						// failParentOnFailure: true
					},
				});
				userCount++;
			}
		}

		if (jobs.length > 0) {
			logger.info(
				{ ingestionSourceId, userCount },
				'Adding sync-cycle-finished job to the queue'
			);
			await flowProducer.add({
				name: 'sync-cycle-finished',
				queueName: 'ingestion',
				data: {
					ingestionSourceId,
					userCount,
					isInitialImport: true,
				},
				children: jobs,
				opts: {
					removeOnComplete: true,
					removeOnFail: true,
				},
			});
		} else {
			const fileBasedIngestions = IngestionService.returnFileBasedIngestions();
			const finalStatus = fileBasedIngestions.includes(source.provider)
				? 'imported'
				: 'active';
			// If there are no users, we can consider the import finished and set to active
			await IngestionService.update(ingestionSourceId, {
				status: finalStatus,
				lastSyncFinishedAt: new Date(),
				lastSyncStatusMessage: 'Initial import complete. No users found.',
			});
		}

		logger.info({ ingestionSourceId }, 'Finished initial import master job');
	} catch (error) {
		logger.error({ err: error, ingestionSourceId }, 'Error in initial import master job');
		await IngestionService.update(ingestionSourceId, {
			status: 'error',
			lastSyncStatusMessage: `Initial import failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
		});
		throw error;
	}
};
