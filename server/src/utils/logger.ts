import pino from 'pino';

function buildTransport(): pino.TransportMultiOptions | undefined {
  const targets: pino.TransportTargetOptions[] = [];

  // Always log to stdout
  if (process.env.NODE_ENV !== 'production') {
    targets.push({ target: 'pino/file', options: { destination: 1 }, level: 'debug' });
  }

  // Forward error+ logs to Sentry when DSN is configured
  if (process.env.SENTRY_DSN) {
    targets.push({
      target: 'pino-sentry-transport',
      options: { sentry: { dsn: process.env.SENTRY_DSN } },
      level: 'error',
    });
  }

  return targets.length > 0 ? { targets } : undefined;
}

const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  transport: buildTransport(),
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export default logger;
