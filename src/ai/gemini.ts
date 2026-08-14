/**
 * Gemini API クライアント（docs/spec.md §5.1 / テスト UT-AI-03〜06）
 *
 * 方針: AI が落ちても学習フローは絶対に止めない。
 *       タイムアウト 12 秒 → 1 回だけ再試行 → それでも駄目ならフォールバック。
 */
export const MODEL = 'gemini-2.5-flash';
export const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
export const TIMEOUT_MS = 12_000;
export const MAX_ATTEMPTS = 2;

export type GeminiErrorKind = 'no-key' | 'timeout' | 'http' | 'parse' | 'blocked' | 'rate-limit' | 'quota-daily';

export class GeminiError extends Error {
  constructor(
    message: string,
    readonly kind: GeminiErrorKind,
    /** 429 応答が指定してきた待機時間（ミリ秒）。無ければ 0 */
    readonly retryAfterMs = 0
  ) {
    super(message);
    this.name = 'GeminiError';
  }
}

type ErrorBody = {
  error?: {
    details?: {
      '@type'?: string;
      retryDelay?: string;
      violations?: { quotaId?: string; quotaValue?: string }[];
    }[];
  };
};

/** 429 応答の RetryInfo（"29s" 形式）をミリ秒に変換する */
export function parseRetryDelay(body: string): number {
  try {
    const json = JSON.parse(body) as ErrorBody;
    const delay = json.error?.details?.find((d) => d['@type']?.includes('RetryInfo'))?.retryDelay;
    const seconds = delay ? Number(delay.replace('s', '')) : NaN;
    return Number.isFinite(seconds) ? Math.round(seconds * 1000) : DEFAULT_RETRY_AFTER_MS;
  } catch {
    return DEFAULT_RETRY_AFTER_MS;
  }
}

/**
 * 超過したのが「1 日あたり」の上限かどうか。
 * 日次上限は待っても回復しないため、RetryInfo が数十秒を返してきても待ってはいけない。
 * （無料枠の gemini-2.5-flash は 1 日 20 リクエスト）
 */
export function isDailyQuota(body: string): boolean {
  try {
    const json = JSON.parse(body) as ErrorBody;
    const violations = json.error?.details?.find((d) => d['@type']?.includes('QuotaFailure'))?.violations ?? [];
    return violations.some((v) => v.quotaId?.includes('PerDay'));
  } catch {
    return false;
  }
}

const DEFAULT_RETRY_AFTER_MS = 8_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type GenerateParams = {
  apiKey: string | null;
  system: string;
  prompt: string;
  schema: unknown;
  maxOutputTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
  /**
   * 利用制限（429）に当たったとき、待ってから再試行してよい最大時間（ミリ秒）。
   * 既定は 0 = 待たずに即フォールバック。出題中は待たせられないので 0 のまま使い、
   * ユーザーが結果を読んでいる間に取りにいける総括だけ待機を許す。
   */
  maxRetryWaitMs?: number;
};

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
};

async function callOnce(params: GenerateParams): Promise<string> {
  const { apiKey, system, prompt, schema, maxOutputTokens = 512, temperature = 0.7 } = params;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  // 呼び出し側の中断（画面離脱など）にも追従する
  const onAbort = () => controller.abort();
  params.signal?.addEventListener('abort', onAbort);

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey as string },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature,
          maxOutputTokens,
          responseMimeType: 'application/json',
          responseSchema: schema,
          // スキマ時間アプリなので思考時間よりレスポンス速度を優先する
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      if (res.status === 429) {
        // 日次上限は待っても回復しないので、待機せず即フォールバックさせる
        if (isDailyQuota(body)) {
          throw new GeminiError('本日の Gemini API 利用上限に達しました', 'quota-daily');
        }
        throw new GeminiError('Gemini API の利用制限に達しました', 'rate-limit', parseRetryDelay(body));
      }
      throw new GeminiError(`Gemini API エラー (${res.status}): ${body.slice(0, 200)}`, 'http');
    }

    const json = (await res.json()) as GeminiResponse;
    if (json.promptFeedback?.blockReason) {
      throw new GeminiError(`応答がブロックされました: ${json.promptFeedback.blockReason}`, 'blocked');
    }

    const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    if (!text.trim()) throw new GeminiError('Gemini から空の応答が返りました', 'parse');
    return text;
  } catch (e) {
    if (e instanceof GeminiError) throw e;
    if ((e as Error)?.name === 'AbortError') throw new GeminiError('Gemini API がタイムアウトしました', 'timeout');
    throw new GeminiError(`Gemini API 呼び出しに失敗しました: ${(e as Error).message}`, 'http');
  } finally {
    clearTimeout(timer);
    params.signal?.removeEventListener('abort', onAbort);
  }
}

/** JSON 以外の装飾（```json フェンス等）が混ざっても拾えるようにする */
export function parseJson<T>(text: string): T {
  const trimmed = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const start = trimmed.search(/[{[]/);
    const end = Math.max(trimmed.lastIndexOf('}'), trimmed.lastIndexOf(']'));
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1)) as T;
      } catch {
        /* 下の throw に落とす */
      }
    }
    throw new GeminiError('Gemini の応答を JSON として解釈できませんでした', 'parse');
  }
}

/**
 * 構造化 JSON を 1 件取得する。失敗時は GeminiError を投げるので、
 * 呼び出し側（features/ai.ts）が必ずフォールバックに変換すること。
 */
export async function generateJson<T>(params: GenerateParams): Promise<T> {
  if (!params.apiKey) throw new GeminiError('Gemini API キーが設定されていません', 'no-key');

  const maxRetryWaitMs = params.maxRetryWaitMs ?? 0;
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return parseJson<T>(await callOnce(params));
    } catch (e) {
      lastError = e;
      if (params.signal?.aborted) break;

      if (e instanceof GeminiError) {
        // キー未設定・ブロック・日次上限は、再試行しても結果が変わらない
        if (e.kind === 'no-key' || e.kind === 'blocked' || e.kind === 'quota-daily') break;

        // 利用制限は待たなければ回復しない。待機を許されていなければ諦める
        if (e.kind === 'rate-limit') {
          const wait = Math.min(e.retryAfterMs || DEFAULT_RETRY_AFTER_MS, maxRetryWaitMs);
          if (wait <= 0) break;
          await sleep(wait);
        }
      }
    }
  }
  throw lastError;
}
