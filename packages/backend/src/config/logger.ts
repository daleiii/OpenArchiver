import pino from 'pino';

const usePrettyLogs = process.env.LOG_PRETTY === 'true';

export const logger = pino({
	level: process.env.LOG_LEVEL || 'info',
	redact: ['password'],
	...(usePrettyLogs && {
		transport: {
			target: 'pino-pretty',
			options: {
				colorize: true,
			},
		},
	}),
});
