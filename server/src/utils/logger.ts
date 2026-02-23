import pino from 'pino';

function buildTransport(): pino.TransportMultiOptions | undefined {
  const targets: pino.TransportTargetOptions[] = [];

  // Always log to stdout (info in production, debug in dev)
  targets.push({
    target: 'pino/file',
    options: { destination: 1 },
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  });

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

const transport = buildTransport();

// Pino does not allow custom formatters with transport.targets —
// only apply formatters when no multi-target transport is active
const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  transport,
  ...(!transport && {
    formatters: {
      level: (label) => ({ level: label }),
    },
  }),
  timestamp: pino.stdTimeFunctions.isoTime,
});

export default logger;
