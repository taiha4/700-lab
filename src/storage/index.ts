/**
 * AsyncStorage ラッパ（docs/spec.md §3.2 / テスト UT-STORE）
 *
 * 壊れたデータで起動不能にならないよう、読み出しは必ず既定値へフォールバックする。
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Feedback, SessionRecord, Settings, WordProgress } from '@/types';
import { DEFAULT_SETTINGS } from '@/types';

export const SCHEMA_VERSION = 1;

export const KEYS = {
  schema: '@700lab/v1/schema',
  progress: '@700lab/v1/progress',
  sessions: '@700lab/v1/sessions',
  settings: '@700lab/v1/settings',
  aiCache: '@700lab/v1/aiCache',
} as const;

/** セッション履歴の保持上限（古いものから破棄） */
export const MAX_SESSIONS = 100;
/** AI 応答キャッシュの保持上限 */
export const MAX_AI_CACHE = 300;

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw == null) return fallback;
    const parsed = JSON.parse(raw);
    return (parsed ?? fallback) as T;
  } catch {
    // 破損データは無かったことにして初期状態から続行する
    return fallback;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 保存に失敗しても学習は継続させる（次回の保存で回復する）
  }
}

export const loadProgress = () => readJson<Record<number, WordProgress>>(KEYS.progress, {});
export const saveProgress = (v: Record<number, WordProgress>) => writeJson(KEYS.progress, v);

export const loadSessions = () => readJson<SessionRecord[]>(KEYS.sessions, []);
export const saveSessions = (v: SessionRecord[]) => writeJson(KEYS.sessions, v.slice(-MAX_SESSIONS));

export async function loadSettings(): Promise<Settings> {
  const stored = await readJson<Partial<Settings>>(KEYS.settings, {});
  const merged = { ...DEFAULT_SETTINGS, ...stored };
  // 対象レベルが空だと出題できなくなるため保険をかける
  if (!Array.isArray(merged.levels) || merged.levels.length === 0) merged.levels = DEFAULT_SETTINGS.levels;
  return merged;
}
export const saveSettings = (v: Settings) => writeJson(KEYS.settings, v);

/** 単語詳細やオフライン時の再表示に使う AI 応答キャッシュ */
export type AiCache = Record<string, Feedback>;

export const loadAiCache = () => readJson<AiCache>(KEYS.aiCache, {});

export async function putAiCache(cache: AiCache, wordId: number, feedback: Feedback): Promise<AiCache> {
  const next: AiCache = { ...cache, [String(wordId)]: feedback };
  const keys = Object.keys(next);
  if (keys.length > MAX_AI_CACHE) {
    // 単純な FIFO で古い方から捨てる
    for (const k of keys.slice(0, keys.length - MAX_AI_CACHE)) delete next[k];
  }
  await writeJson(KEYS.aiCache, next);
  return next;
}

export async function ensureSchema(): Promise<void> {
  const version = await readJson<number>(KEYS.schema, 0);
  if (version !== SCHEMA_VERSION) {
    // v1 では移行対象が無いので版数を記録するだけ
    await writeJson(KEYS.schema, SCHEMA_VERSION);
  }
}

export async function resetAll(): Promise<void> {
  await AsyncStorage.multiRemove([KEYS.progress, KEYS.sessions, KEYS.aiCache, KEYS.settings]);
}
