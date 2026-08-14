/** 永続化（テスト仕様書 UT-STORE-01〜04） */
import AsyncStorage from '@react-native-async-storage/async-storage';
import rawWords from '@/data/toeic_wordlist.json';
import {
  KEYS,
  MAX_AI_CACHE,
  MAX_SESSIONS,
  loadAiCache,
  loadProgress,
  loadSessions,
  loadSettings,
  putAiCache,
  resetAll,
  saveProgress,
  saveSessions,
  saveSettings,
} from '@/storage';
import { createInitialProgress } from '@/domain/srs';
import { DEFAULT_SETTINGS } from '@/types';
import type { Feedback, SessionRecord, Word, WordProgress } from '@/types';

const words = rawWords as Word[];

const session = (i: number): SessionRecord => ({
  id: `s${i}`,
  startedAt: new Date(2026, 0, 1, 0, i).toISOString(),
  finishedAt: new Date(2026, 0, 1, 0, i).toISOString(),
  mode: 'commute',
  answers: [],
  accuracy: 1,
  scoreBefore: 450,
  scoreAfter: 451,
  summary: null,
  nextAdvice: null,
});

const feedback: Feedback = {
  errorType: 'confusion',
  why: 'w',
  howToTell: 'h',
  example: 'e',
  exampleJa: 'j',
  source: 'ai',
};

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('UT-STORE: 永続化', () => {
  test('UT-STORE-01: 初回は空で、300 語ぶんを new で初期化して保存できる', async () => {
    expect(await loadProgress()).toEqual({});

    const fresh: Record<number, WordProgress> = {};
    for (const w of words) fresh[w.id] = createInitialProgress(w.id);
    await saveProgress(fresh);

    const loaded = await loadProgress();
    expect(Object.keys(loaded)).toHaveLength(300);
    expect(Object.values(loaded).every((p) => p.stage === 'new')).toBe(true);
  });

  test('UT-STORE-02: 保存した内容がそのまま読み出せる', async () => {
    const p = { 1: { ...createInitialProgress(1), stage: 'using' as const, streak: 3 } };
    await saveProgress(p);
    expect(await loadProgress()).toEqual(p);

    await saveSettings({ ...DEFAULT_SETTINGS, questionCount: 12, apiKey: 'test-key' });
    const s = await loadSettings();
    expect(s.questionCount).toBe(12);
    expect(s.apiKey).toBe('test-key');
  });

  test('UT-STORE-03: 壊れた JSON でも例外を投げず初期状態に戻る', async () => {
    await AsyncStorage.setItem(KEYS.progress, '{壊れたデータ');
    await AsyncStorage.setItem(KEYS.sessions, 'not json at all');
    await AsyncStorage.setItem(KEYS.settings, '<<<');

    expect(await loadProgress()).toEqual({});
    expect(await loadSessions()).toEqual([]);
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  test('設定のレベルが空配列でも既定値で補完される', async () => {
    await AsyncStorage.setItem(KEYS.settings, JSON.stringify({ levels: [] }));
    expect((await loadSettings()).levels).toEqual(DEFAULT_SETTINGS.levels);
  });

  test('UT-STORE-04: セッションは 100 件に保たれ、古いものから捨てられる', async () => {
    await saveSessions(Array.from({ length: MAX_SESSIONS + 20 }, (_, i) => session(i)));
    const loaded = await loadSessions();
    expect(loaded).toHaveLength(MAX_SESSIONS);
    expect(loaded[0].id).toBe('s20');
    expect(loaded.at(-1)!.id).toBe(`s${MAX_SESSIONS + 19}`);
  });

  test('AI キャッシュは上限 300 件で頭から捨てられる', async () => {
    let cache = await loadAiCache();
    for (let i = 1; i <= MAX_AI_CACHE + 5; i++) cache = await putAiCache(cache, i, feedback);
    expect(Object.keys(cache)).toHaveLength(MAX_AI_CACHE);
    expect(cache['1']).toBeUndefined();
    expect(cache[String(MAX_AI_CACHE + 5)]).toBeDefined();
  });

  test('全データリセットで保存内容が消える', async () => {
    await saveProgress({ 1: createInitialProgress(1) });
    await saveSessions([session(1)]);
    await resetAll();

    expect(await loadProgress()).toEqual({});
    expect(await loadSessions()).toEqual([]);
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
});
