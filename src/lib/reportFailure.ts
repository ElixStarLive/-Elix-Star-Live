export function reportFailure(source: string, err: unknown, context?: Record<string, unknown>): void {
  const error = err instanceof Error ? err : new Error(String(err || source));
  void import('./crashReporting').then(({ crashReporting }) => {
    void crashReporting.logError(error, { source, ...context });
  }).catch(() => {});
}
