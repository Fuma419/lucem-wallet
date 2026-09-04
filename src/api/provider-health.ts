/**
 * Which chain provider is actually answering, and whether it is failing.
 *
 * Every chain read goes through `koiosRequest` and every submit through
 * `koiosSubmitTransaction`, and both prefer Blockfrost with Koios as fallback.
 * A Blockfrost outage is therefore invisible: the fallback succeeds and the
 * error is dropped. This module is the memory those two chokepoints write to,
 * so the UI can say which provider served the last call and what broke.
 *
 * State only, no requests — `probeChainProviders()` in `util.js` owns the
 * active check, which keeps this module free of import cycles.
 */

export type ProviderName = 'blockfrost' | 'koios';

/**
 * `unconfigured` is not a failure: builds without a Blockfrost project id run
 * on Koios by design, and must not be reported as an outage.
 */
export type ProviderState = 'ok' | 'failing' | 'unconfigured' | 'unknown';

export type ProviderHealth = {
  state: ProviderState;
  /** Round trip of the last attempt, milliseconds. */
  latencyMs: number | null;
  /** Epoch millis of the last attempt. */
  checkedAt: number | null;
  lastError: string | null;
  /** Endpoint of the last attempt, for a failure the user can report. */
  lastEndpoint: string | null;
};

/**
 * `degraded` means the wallet still works but one provider is failing — the
 * case that was previously silent.
 */
export type OverallState = 'ok' | 'degraded' | 'down' | 'unknown';

export type ProviderHealthSnapshot = {
  blockfrost: ProviderHealth;
  koios: ProviderHealth;
  overall: OverallState;
};

const PROVIDERS: ProviderName[] = ['blockfrost', 'koios'];

function blank(): ProviderHealth {
  return {
    state: 'unknown',
    latencyMs: null,
    checkedAt: null,
    lastError: null,
    lastEndpoint: null,
  };
}

const health: Record<ProviderName, ProviderHealth> = {
  blockfrost: blank(),
  koios: blank(),
};

function now(): number {
  return Date.now();
}

/** Keep stored errors short: they land in a popup, not a log file. */
function shortError(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : String((error as any)?.message || error || 'Request failed');
  return message.replace(/\s+/g, ' ').trim().slice(0, 200);
}

export function recordProviderSuccess(
  provider: ProviderName,
  latencyMs: number,
  endpoint?: string
): void {
  health[provider] = {
    state: 'ok',
    latencyMs: Math.max(0, Math.round(latencyMs)),
    checkedAt: now(),
    lastError: null,
    lastEndpoint: endpoint || null,
  };
}

export function recordProviderFailure(
  provider: ProviderName,
  error: unknown,
  endpoint?: string,
  latencyMs?: number
): void {
  health[provider] = {
    state: 'failing',
    latencyMs:
      typeof latencyMs === 'number' ? Math.max(0, Math.round(latencyMs)) : null,
    checkedAt: now(),
    lastError: shortError(error),
    lastEndpoint: endpoint || null,
  };
}

/** No usable project id/key, so this provider is intentionally unused. */
export function recordProviderUnconfigured(provider: ProviderName): void {
  const previous = health[provider];
  if (previous.state === 'unconfigured') return;
  health[provider] = { ...blank(), state: 'unconfigured', checkedAt: now() };
}

/**
 * Overall status, ignoring providers that are merely unconfigured:
 * every configured provider failing is `down`, some failing is `degraded`.
 */
export function overallProviderState(
  snapshot: Pick<ProviderHealthSnapshot, ProviderName>
): OverallState {
  const configured = PROVIDERS.map((name) => snapshot[name]).filter(
    (entry) => entry.state !== 'unconfigured'
  );
  if (!configured.length) return 'unknown';
  if (configured.every((entry) => entry.state === 'unknown')) return 'unknown';

  const failing = configured.filter((entry) => entry.state === 'failing');
  if (!failing.length) return 'ok';
  const working = configured.filter((entry) => entry.state === 'ok');
  return working.length ? 'degraded' : 'down';
}

export function getProviderHealth(): ProviderHealthSnapshot {
  const snapshot = {
    blockfrost: { ...health.blockfrost },
    koios: { ...health.koios },
  };
  return { ...snapshot, overall: overallProviderState(snapshot) };
}

/** Test seam: forget everything recorded so far. */
export function resetProviderHealth(): void {
  health.blockfrost = blank();
  health.koios = blank();
}

/** One-line summary for a status row. */
export function describeProviderHealth(entry: ProviderHealth): string {
  switch (entry.state) {
    case 'ok':
      return entry.latencyMs == null ? 'Connected' : `Connected · ${entry.latencyMs} ms`;
    case 'failing':
      return entry.lastError ? `Not responding · ${entry.lastError}` : 'Not responding';
    case 'unconfigured':
      return 'Not configured';
    default:
      return 'Not checked yet';
  }
}
