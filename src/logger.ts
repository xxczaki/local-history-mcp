import pino from 'pino';

// Create logger with proper configuration for MCP servers
const logger = pino({
	level: process.env.LOG_LEVEL || 'info',
	...(process.env.NODE_ENV === 'development' && {
		transport: {
			target: 'pino-pretty',
			options: {
				colorize: true,
				translateTime: true,
				ignore: 'pid,hostname',
			},
		},
	}),
});

export default logger;
