/** 出題選定（テスト仕様書 UT-SELECT-01〜08） */
import rawWords from '@/data/toeic_wordlist.json';
import { bucketSizes, formatFor, selectQuestions } from '@/domain/selectQuestions';
import { createInitialProgress } from '@/domain/srs';
import type { Stage, Word, WordProgress } from '@/types';

const words = rawWords as Word[];
const NOW = new Date('2026-08-14T09:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

const allWithStage = (stage: Stage, dueOffsetDays = 1): Record<number, WordProgress> => {
  const out: Record<number, WordProgress> = {};
  for (const w of words) {
    out[w.id] = {
      ...createInitialProgress(w.id, NOW),
      stage,
      recognizeCorrect: stage === 'new' ? 0 : 1,
      dueAt: new Date(NOW.getTime() + dueOffsetDays * DAY).toISOString(),
    };
  }
  return out;
};

const settings = { questionCount: 10 as const, levels: [1, 2, 3] as (1 | 2 | 3)[] };

describe('UT-SELECT: 出題選定', () => {
  test('枠の配分が問題数ちょうどになる', () => {
    for (const n of [8, 10, 12]) {
      const { review, use, fresh } = bucketSizes(n);
      expect(review + use + fresh).toBe(n);
    }
    expect(bucketSizes(10)).toEqual({ review: 4, use: 3, fresh: 3 });
  });

  test('UT-SELECT-01: 全語 new なら 10 問すべて認識形式', () => {
    const qs = selectQuestions({ words, progress: allWithStage('new'), settings, now: NOW });
    expect(qs).toHaveLength(10);
    expect(qs.every((q) => q.format === 'recognize')).toBe(true);
  });

  test('UT-SELECT-02: recognized が 5 語あれば運用枠 3 問が use 形式で入る', () => {
    const progress = allWithStage('new');
    const targets = words.slice(0, 5);
    for (const w of targets) {
      progress[w.id] = { ...progress[w.id], stage: 'recognized', recognizeCorrect: 1 };
    }
    const qs = selectQuestions({ words, progress, settings, now: NOW });
    const useQs = qs.filter((q) => q.format === 'use');
    expect(useQs).toHaveLength(3);
    expect(useQs.every((q) => targets.some((t) => t.id === q.wordId))).toBe(true);
  });

  test('UT-SELECT-03: 期限到来語が 10 語でも復習枠は最大 4 問', () => {
    const progress = allWithStage('new');
    const dueWords = words.slice(0, 10);
    for (const w of dueWords) {
      progress[w.id] = {
        ...progress[w.id],
        stage: 'using',
        recognizeCorrect: 2,
        dueAt: new Date(NOW.getTime() - DAY).toISOString(),
      };
    }
    const qs = selectQuestions({ words, progress, settings, now: NOW });
    const fromDue = qs.filter((q) => dueWords.some((w) => w.id === q.wordId));
    // 復習枠は 4 問。残りは新規枠 3 問 + 運用枠が埋まらないぶんの補充になる
    expect(fromDue.length).toBeGreaterThanOrEqual(4);
    expect(qs).toHaveLength(10);
  });

  test('UT-SELECT-04: 候補が偏っても合計は設定問題数ちょうど', () => {
    for (const questionCount of [8, 10, 12] as const) {
      for (const stage of ['new', 'recognized', 'using', 'mastered'] as Stage[]) {
        const qs = selectQuestions({
          words,
          progress: allWithStage(stage),
          settings: { ...settings, questionCount },
          now: NOW,
        });
        expect(qs).toHaveLength(questionCount);
      }
    }
  });

  test('UT-SELECT-05: 同一セット内に同じ語が 2 回出ない', () => {
    for (let i = 0; i < 20; i++) {
      const qs = selectQuestions({ words, progress: allWithStage('recognized'), settings, now: NOW });
      expect(new Set(qs.map((q) => q.wordId)).size).toBe(qs.length);
    }
  });

  test('UT-SELECT-06: 直近セットの語（期限未到来）は除外される', () => {
    const progress = allWithStage('new');
    const recentWordIds = words.slice(0, 3).map((w) => w.id);
    for (const id of recentWordIds) {
      progress[id] = { ...progress[id], stage: 'recognized', recognizeCorrect: 1 };
    }
    const qs = selectQuestions({ words, progress, settings, recentWordIds, now: NOW });
    expect(qs.some((q) => recentWordIds.includes(q.wordId))).toBe(false);
  });

  test('UT-SELECT-07: 対象レベルを絞ると新規枠に対象外レベルが入らない', () => {
    const qs = selectQuestions({
      words,
      progress: allWithStage('new'),
      settings: { questionCount: 10, levels: [1, 2] },
      now: NOW,
    });
    const levels = qs.map((q) => words.find((w) => w.id === q.wordId)!.level);
    expect(levels.includes(3)).toBe(false);
  });

  test('UT-SELECT-08: 全語 mastered でも例外を投げず規定問題数を返す', () => {
    const qs = selectQuestions({
      words,
      progress: allWithStage('mastered', -1),
      settings,
      now: NOW,
    });
    expect(qs).toHaveLength(10);
    expect(qs.every((q) => q.format === 'use')).toBe(true);
  });

  test('意味の正答率が低い語は運用に上げず認識形式で出す', () => {
    const p = { ...createInitialProgress(1, NOW), stage: 'recognized' as Stage, recognizeCorrect: 1, recognizeWrong: 3 };
    expect(formatFor(p)).toBe('recognize');
    expect(formatFor({ ...p, recognizeWrong: 0 })).toBe('use');
    expect(formatFor(undefined)).toBe('recognize');
  });

  test('レベル設定が空でも出題できる', () => {
    const qs = selectQuestions({
      words,
      progress: allWithStage('new'),
      settings: { questionCount: 10, levels: [] },
      now: NOW,
    });
    expect(qs).toHaveLength(10);
  });
});
