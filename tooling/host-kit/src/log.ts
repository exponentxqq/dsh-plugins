/**
 * Logging seam for the host halves.
 *
 * `LogSink` is the only diagnostics shape the kernel needs; `createLog` adapts
 * the host logger to it. The dual-channel discipline is migrated verbatim from
 * `plugins/user-commands/src/host/host-io.ts:80-89`.
 * @module @dsh-plugins/host-kit/log
 */

/** Logging seam: host diagnostics without a hard dependency on any logger. */
export interface LogSink {
  /**
   * Record a state change worth seeing in the process log.
   * @param message - the diagnostic text.
   */
  info(message: string): void
  /**
   * Record a degraded-but-continuing condition.
   * @param message - the diagnostic text.
   */
  warn(message: string): void
  /**
   * Record a skipped configuration or a failed operation.
   * @param message - the diagnostic text.
   */
  error(message: string): void
}

/**
 * Adapt the host logger to the logging seam.
 *
 * Every line goes to BOTH channels on purpose. The web profile registers no
 * logger exporter once boot has finished (app-boot keeps one only to collect
 * startup diagnostics), so a `ctx.logger` call by itself is invisible in the
 * process log a human reads (`docker logs dsh`) — which is exactly where a
 * conflict or a failed restriction has to show up. The console copy is that
 * surface; the logger copy keeps the message in the in-app buffer for any
 * deployment that does wire an exporter.
 * @param ctx - the host context carrying the logger.
 * @param prefix - the plugin name prefixed to every line.
 * @returns the logging seam.
 */
export function createLog(ctx: { logger: LogSink }, prefix: string): LogSink {
  const line = (message: string): string => `${prefix}: ${message}`
  return {
    info: (message) => {
      ctx.logger.info(line(message))
      console.info(line(message))
    },
    warn: (message) => {
      ctx.logger.warn(line(message))
      console.warn(line(message))
    },
    error: (message) => {
      ctx.logger.error(line(message))
      console.error(line(message))
    },
  }
}
