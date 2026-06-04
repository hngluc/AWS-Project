/**
 * Structured Logger
 * 
 * Outputs JSON-formatted logs compatible with CloudWatch Logs Insights.
 * In production, use AWS Lambda Powertools for advanced features.
 * This is a lightweight alternative for MVP.
 * 
 * Log format:
 * { "level": "INFO", "message": "...", "service": "...", "timestamp": "...", ...extra }
 */

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

const LOG_LEVELS: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

const currentLevel = (process.env.POWERTOOLS_LOG_LEVEL as LogLevel) || 'INFO';

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function formatLog(level: LogLevel, message: string, extra?: Record<string, unknown>) {
  if (!shouldLog(level)) return;

  const logEntry = {
    level,
    message,
    service: process.env.POWERTOOLS_SERVICE_NAME || 'SmartImage',
    timestamp: new Date().toISOString(),
    // Include Lambda request ID if available
    ...(process.env._X_AMZN_TRACE_ID && { xrayTraceId: process.env._X_AMZN_TRACE_ID }),
    ...extra,
  };

  // Use console methods that map to CloudWatch log levels
  switch (level) {
    case 'DEBUG':
      console.debug(JSON.stringify(logEntry));
      break;
    case 'INFO':
      console.info(JSON.stringify(logEntry));
      break;
    case 'WARN':
      console.warn(JSON.stringify(logEntry));
      break;
    case 'ERROR':
      console.error(JSON.stringify(logEntry));
      break;
  }
}

export const logger = {
  debug: (message: string, extra?: Record<string, unknown>) => formatLog('DEBUG', message, extra),
  info: (message: string, extra?: Record<string, unknown>) => formatLog('INFO', message, extra),
  warn: (message: string, extra?: Record<string, unknown>) => formatLog('WARN', message, extra),
  error: (message: string, extra?: Record<string, unknown>) => formatLog('ERROR', message, extra),

  /**
   * Log an error with full stack trace
   */
  logError: (message: string, error: unknown, extra?: Record<string, unknown>) => {
    const errorDetails: Record<string, unknown> = {
      ...extra,
    };

    if (error instanceof Error) {
      errorDetails.errorName = error.name;
      errorDetails.errorMessage = error.message;
      errorDetails.errorStack = error.stack;
    } else {
      errorDetails.errorRaw = String(error);
    }

    formatLog('ERROR', message, errorDetails);
  },
};
