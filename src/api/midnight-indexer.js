import provider from '../config/provider';

const MIDNIGHT_PREVIEW_GRAPHQL = 'https://midnight-preview.blockfrost.io/api/v0';

/**
 * Latest indexed block on Midnight Preview via Blockfrost hosted indexer.
 * @param {AbortSignal} [signal]
 * @returns {Promise<{ height: number, hash: string, timestamp: number } | null>}
 */
export async function fetchMidnightPreviewTip(signal) {
  const projectId = provider.api.midnightPreviewProjectId?.();
  if (typeof projectId !== 'string' || !projectId.trim()) {
    return null;
  }

  try {
    const response = await fetch(MIDNIGHT_PREVIEW_GRAPHQL, {
      method: 'POST',
      headers: {
        project_id: projectId.trim(),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        query: '{ block { height hash timestamp } }',
      }),
      signal,
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    const block = payload?.data?.block;
    if (!block || block.height == null) {
      return null;
    }

    return {
      height: block.height,
      hash: block.hash,
      timestamp: block.timestamp,
    };
  } catch {
    return null;
  }
}
