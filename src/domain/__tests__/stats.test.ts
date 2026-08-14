/** 統計・誤答カルテ（テスト仕様書 UT-STATS-01〜05） */
import rawWords from '@/data/toeic_wordlist.json';
import {
  buildOverview,
  dominantErrorType,
  errorBreakdown,
  last7Days,
  streakDays,
  toPercentages,
  weakWords,
} from '@/domain/stats';
import { createInitialProgress } from '@/domain/srs';
import type { AnswerRecord, SessionRecord, Word, WordProgress } from '@/types';

const words = rawWords as Word[];
const NOW = new Date('2026-08-14T09:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

const emptyProgress = (): Record<number, WordProgress> => {
  const out: Record<number, WordProgress> = {};
  for (const w of words) out[w.id] = createInitialProgress(w.id, NOW);
  return out;
};

const session = (dayOffset: number, answers: AnswerRecord[]): SessionRecord => {
  const at = new Date(NOW.getTime() + dayOffset * DAY).toISOString();
  return {
    id: `s${dayOffset}`,
    startedAt: at,
    finishedAt: at,
    mode: 'commute',
    answers,
    accuracy: answers.length ? answers.filter((a) => a.correct).length / answers.length : 0,
    scoreBefore: 450,
    scoreAfter: 452,
    summary: null,
    nextAdvice: null,
  };
};

const answer = (patch: Partial<AnswerRecord> = {}): AnswerRecord => ({
  wordId: 1,
  format: 'recognize',
  correct: true,
  chosen: 'x',
  ms: 4000,
  ...patch,
});

describe('UT-STATS: 集計', () => {
  test('UT-STATS-01: セッション 0 件でも NaN にならない', () => {
    const o = buildOverview(words, emptyProgress(), [], NOW);
    expect(o.accuracy).toBe(0);
    expect(o.recognizeAccuracy).toBe(0);
    expect(o.useAccuracy).toBe(0);
    expect(o.avgAnswerMs).toBe(0);
    expect(o.learned).toBe(0);
    expect(o.total).toBe(300);
    expect(Number.isNaN(o.accuracy)).toBe(false);
  });

  test('UT-STATS-02: 誤答タイプの合計 + 未分類 = 総不正解数', () => {
    const sessions = [
      session(0, [
        answer({ correct: false, errorType: 'confusion' }),
        answer({ correct: false, errorType: 'confusion' }),
        answer({ correct: false, errorType: 'pos' }),
        answer({ correct: false }), // AI 分析が取れなかったケース
        answer({ correct: true }),
      ]),
    ];
    const b = errorBreakdown(sessions);
    const sum = Object.values(b.counts).reduce((a, n) => a + n, 0);
    expect(sum + b.unclassified).toBe(b.totalWrong);
    expect(b.totalWrong).toBe(4);
    expect(b.unclassified).toBe(1);
    expect(b.dominant).toBe('confusion');
  });

  test('UT-STATS-03: 連続 3 日で 3、1 日空くと 1', () => {
    const threeDays = [session(-2, [answer()]), session(-1, [answer()]), session(0, [answer()])];
    expect(streakDays(threeDays, NOW)).toBe(3);

    const gap = [session(-2, [answer()]), session(0, [answer()])];
    expect(streakDays(gap, NOW)).toBe(1);

    expect(streakDays([], NOW)).toBe(0);
  });

  test('今日未学習でも昨日まで続いていれば連続は途切れない', () => {
    expect(streakDays([session(-2, [answer()]), session(-1, [answer()])], NOW)).toBe(2);
    expect(streakDays([session(-3, [answer()])], NOW)).toBe(0);
  });

  test('UT-STATS-04: 直近 7 日は学習のない日も 0 で返る', () => {
    const days = last7Days([session(0, [answer(), answer()])], NOW);
    expect(days).toHaveLength(7);
    expect(days.at(-1)!.count).toBe(2);
    expect(days.slice(0, 6).every((d) => d.count === 0)).toBe(true);
  });

  test('UT-STATS-05: 認識 / 運用の正解率が分けて算出される', () => {
    const sessions = [
      session(0, [
        answer({ format: 'recognize', correct: true }),
        answer({ format: 'recognize', correct: true }),
        answer({ format: 'use', correct: false }),
        answer({ format: 'use', correct: false }),
      ]),
    ];
    const o = buildOverview(words, emptyProgress(), sessions, NOW);
    expect(o.recognizeAccuracy).toBe(1);
    expect(o.useAccuracy).toBe(0);
    expect(o.accuracy).toBe(0.5);
  });

  test('「意味は分かるが使えない」語数が gapWords に出る', () => {
    const progress = emptyProgress();
    progress[1] = { ...progress[1], stage: 'recognized' };
    progress[2] = { ...progress[2], stage: 'recognized' };
    progress[3] = { ...progress[3], stage: 'mastered' };
    const o = buildOverview(words, progress, [], NOW);
    expect(o.gapWords).toBe(2);
    expect(o.stages.mastered).toBe(1);
    expect(o.learned).toBe(3);
  });

  test('最頻誤答タイプは直近の傾向を返す', () => {
    const sessions = [
      session(-1, [answer({ correct: false, errorType: 'memory' }), answer({ correct: false, errorType: 'memory' })]),
      session(0, [
        answer({ correct: false, errorType: 'confusion' }),
        answer({ correct: false, errorType: 'confusion' }),
        answer({ correct: false, errorType: 'confusion' }),
      ]),
    ];
    expect(dominantErrorType(sessions)).toBe('confusion');
    expect(dominantErrorType([])).toBe(null);
  });

  test('誤答カルテの百分率は合計がちょうど 100% になる', () => {
    // 5/8 と 3/8 は素直に四捨五入すると 63% + 38% = 101% になる
    expect(toPercentages([5, 0, 0, 3])).toEqual([63, 0, 0, 37]);
    expect(toPercentages([1, 1, 1, 0]).reduce((a, b) => a + b, 0)).toBe(100);
    expect(toPercentages([0, 0, 0, 0])).toEqual([0, 0, 0, 0]);

    for (const values of [[7, 2, 1], [1, 1, 1, 1, 1, 1, 1], [10, 10, 10], [2, 3, 5, 7, 11]]) {
      expect(toPercentages(values).reduce((a, b) => a + b, 0)).toBe(100);
    }
  });

  test('要注意語は誤答数の多い順に返る', () => {
    const progress = emptyProgress();
    progress[1] = { ...progress[1], recognizeWrong: 1, lastAnsweredAt: NOW.toISOString() };
    progress[2] = { ...progress[2], recognizeWrong: 3, useWrong: 1, lastAnsweredAt: NOW.toISOString() };
    const weak = weakWords(words, progress, 5);
    expect(weak[0].word.id).toBe(2);
    expect(weak[0].wrong).toBe(4);
    expect(weak).toHaveLength(2);
  });
});
