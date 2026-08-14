/** 700 点メーター（テスト仕様書 UT-SCORE-01〜06） */
import rawWords from '@/data/toeic_wordlist.json';
import {
  BASE_SCORE,
  SCORE_MAX,
  SCORE_MIN,
  accuracyAdjustment,
  estimateScore,
  formatDelta,
  progressTo700,
} from '@/domain/score';
import { createInitialProgress } from '@/domain/srs';
import type { AnswerRecord, Stage, Word, WordProgress } from '@/types';

const words = rawWords as Word[];

const progressWithStage = (stage: Stage): Record<number, WordProgress> => {
  const out: Record<number, WordProgress> = {};
  for (const w of words) out[w.id] = { ...createInitialProgress(w.id), stage };
  return out;
};

const answers = (n: number, correct: boolean): AnswerRecord[] =>
  Array.from({ length: n }, () => ({ wordId: 1, format: 'recognize' as const, correct, chosen: 'x', ms: 3000 }));

describe('UT-SCORE: 推定スコア', () => {
  test('UT-SCORE-01: 全語 new なら 450', () => {
    expect(estimateScore(words, progressWithStage('new'), [])).toBe(BASE_SCORE);
  });

  test('UT-SCORE-02: 全語 mastered かつ正解率 100% で ≒700（695〜705）', () => {
    const score = estimateScore(words, progressWithStage('mastered'), answers(50, true));
    expect(score).toBeGreaterThanOrEqual(695);
    expect(score).toBeLessThanOrEqual(705);
  });

  test('UT-SCORE-03: 常に 400〜990 に収まる', () => {
    for (const stage of ['new', 'recognized', 'using', 'mastered'] as Stage[]) {
      for (const acc of [true, false]) {
        const s = estimateScore(words, progressWithStage(stage), answers(50, acc));
        expect(s).toBeGreaterThanOrEqual(SCORE_MIN);
        expect(s).toBeLessThanOrEqual(SCORE_MAX);
      }
    }
  });

  test('UT-SCORE-04: recognized → using に昇格するとスコアが増える', () => {
    const base = progressWithStage('recognized');
    const before = estimateScore(words, base, answers(10, true));
    const after = estimateScore(words, { ...base, [1]: { ...base[1], stage: 'using' } }, answers(10, true));
    expect(after).toBeGreaterThan(before);
  });

  test('UT-SCORE-05: 同じ昇格でも L3 の方が増分が大きい', () => {
    const base = progressWithStage('new');
    const l1 = words.find((w) => w.level === 1)!;
    const l3 = words.find((w) => w.level === 3)!;
    const start = estimateScore(words, base, answers(10, true));
    const upL1 = estimateScore(words, { ...base, [l1.id]: { ...base[l1.id], stage: 'mastered' } }, answers(10, true));
    const upL3 = estimateScore(words, { ...base, [l3.id]: { ...base[l3.id], stage: 'mastered' } }, answers(10, true));
    expect(upL3 - start).toBeGreaterThan(upL1 - start);
  });

  test('UT-SCORE-06: 正解率 0% / 100% で補正が 0.9 / 1.1', () => {
    expect(accuracyAdjustment(0)).toBeCloseTo(0.9);
    expect(accuracyAdjustment(1)).toBeCloseTo(1.1);
  });

  test('直近 50 問だけを補正に使う', () => {
    const base = progressWithStage('using');
    const old = [...answers(50, false), ...answers(50, true)];
    // 直近 50 問がすべて正解なので補正は 1.1 側に寄る
    expect(estimateScore(words, base, old)).toBeGreaterThan(estimateScore(words, base, answers(50, false)));
  });

  test('差分表示のフォーマット', () => {
    expect(formatDelta(612, 614.4)).toBe('+2.4');
    expect(formatDelta(614.4, 612)).toBe('-2.4');
    expect(formatDelta(600, 600)).toBe('±0.0');
  });

  test('700 点までの到達率は 0〜1 に収まる', () => {
    expect(progressTo700(450)).toBe(0);
    expect(progressTo700(700)).toBe(1);
    expect(progressTo700(800)).toBe(1);
    expect(progressTo700(575)).toBeCloseTo(0.5);
  });
});
