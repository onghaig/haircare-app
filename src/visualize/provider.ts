import Constants from 'expo-constants';

/** One "future you" image request. The server builds the prompt from these two numbers. */
export interface PreviewRequest {
  /** Base64 JPEG of the user's own front photo, downscaled on the phone first. */
  imageBase64: string;
  /** The forecast's median Norwood stage for that year (never worse than the model predicts). */
  stage: number;
  years: number;
}

/** Swappable: the app only depends on this. */
export interface PreviewProvider {
  readonly name: string;
  /** Base64 image, or throws with a message that can be shown. */
  generate(req: PreviewRequest): Promise<{ imageBase64: string; mimeType: string }>;
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/** Calls our own preview service (server/visualize), which holds the model key. */
export class HttpPreviewProvider implements PreviewProvider {
  readonly name = 'preview service';
  constructor(
    private readonly endpoint: string,
    private readonly fetchImpl: Fetch = (u, i) => fetch(u, i),
    private readonly timeoutMs = 60_000,
  ) {}

  async generate(req: PreviewRequest) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ image: req.imageBase64, stage: req.stage, years: req.years }),
        signal: ctrl.signal,
      });
      const body = (await res.json().catch(() => ({}))) as { image?: string; mimeType?: string; error?: string };
      if (!res.ok || !body.image) throw new Error(body.error ?? `The preview service failed (${res.status})`);
      return { imageBase64: body.image, mimeType: body.mimeType ?? 'image/png' };
    } catch (e) {
      if (ctrl.signal.aborted) throw new Error('The preview took too long. Try again.');
      throw e;
    } finally {
      clearTimeout(t);
    }
  }
}

/** The configured service URL (app.json > expo.extra.visualizeEndpoint), if any. */
export function previewEndpoint(): string | null {
  const v = (Constants.expoConfig?.extra as { visualizeEndpoint?: unknown } | undefined)?.visualizeEndpoint;
  return typeof v === 'string' && /^https:\/\//.test(v) ? v : null;
}

/**
 * No endpoint configured (no backend deployed yet, Jest, Expo Go): no provider, and the app keeps
 * showing the drawn illustration.
 */
export function createPreviewProvider(endpoint = previewEndpoint()): PreviewProvider | null {
  return endpoint ? new HttpPreviewProvider(endpoint) : null;
}
