/** 間隔反復と段階遷移（テスト仕様書 UT-SRS-01〜08） */
import { EASE_MAX, EASE_MIN, applyAnswer, createInitialProgress, intervalForStreak, isDue } from '@/domain/srs';
import type { WordProgress } from '@/types';

const NOW = new Date('2026-08-14T09:00:00.000Z');
const daysBetween = (from: Date, iso: string) =>
  Math.round((new Date(iso).getTime() - from.getTime()) / (24 * 60 * 60 * 1000));

const make = (patch: Partial<WordProgress> = {}): WordProgress => ({
  ...createInitialProgress(1, NOW),
  ...patch,
});

describe('UT-SRS: 間隔反復', () => {
  test('UT-SRS-01: new + 認識正解 → recognized / streak 1 / interval 1', () => {
    const p = applyAnswer(make(), { format: 'recognize', correct: true, now: NOW });
    expect(p.stage).toBe('recognized');
    expect(p.streak).toBe(1);
    expect(p.intervalDays).toBe(1);
    expect(p.recognizeCorrect).toBe(1);
  });

  test('UT-SRS-02: recognized + 運用正解 → using', () => {
    const p = applyAnswer(make({ stage: 'recognized' }), { format: 'use', correct: true, now: NOW });
    expect(p.stage).toBe('using');
    expect(p.useCorrect).toBe(1);
  });

  test('UT-SRS-03: using(streak 1) + 運用正解 → mastered', () => {
    const p = applyAnswer(make({ stage: 'using', streak: 1 }), { format: 'use', correct: true, now: NOW });
    expect(p.stage).toBe('mastered');
  });

  test('UT-SRS-04: using + 運用不正解 → recognized に降格・streak 0・interval 0', () => {
    const p = applyAnswer(make({ stage: 'using', streak: 3 }), {
      format: 'use',
      correct: false,
      errorType: 'confusion',
      chosen: 'request',
      now: NOW,
    });
    expect(p.stage).toBe('recognized');
    expect(p.streak).toBe(0);
    expect(p.intervalDays).toBe(0);
    expect(p.useWrong).toBe(1);
    expect(p.errorTypes).toEqual(['confusion']);
    expect(p.lastChoiceWrong).toBe('request');
  });

  test('UT-SRS-05: ease は上限 2.8 を超えない', () => {
    const p = applyAnswer(make({ ease: EASE_MAX }), { format: 'recognize', correct: true, now: NOW });
    expect(p.ease).toBe(EASE_MAX);
  });

  test('UT-SRS-06: ease は下限 1.3 を下回らない', () => {
    const p = applyAnswer(make({ ease: EASE_MIN }), { format: 'recognize', correct: false, now: NOW });
    expect(p.ease).toBe(EASE_MIN);
  });

  test('UT-SRS-07: 連続正解で interval が 1→3→7→14→30 と遷移', () => {
    let p = make();
    const seen: number[] = [];
    for (let i = 0; i < 6; i++) {
      p = applyAnswer(p, { format: 'recognize', correct: true, now: NOW });
      seen.push(p.intervalDays);
    }
    expect(seen).toEqual([1, 3, 7, 14, 30, 30]);
    expect(intervalForStreak(0)).toBe(0);
  });

  test('UT-SRS-08: dueAt = 基準日 + round(interval × ease / 2.5) 日', () => {
    const p = applyAnswer(make({ streak: 2, ease: 2.5 }), { format: 'recognize', correct: true, now: NOW });
    // streak 3 → interval 7、ease 2.6 → round(7 × 2.6 / 2.5) = 7 日
    expect(p.intervalDays).toBe(7);
    expect(p.ease).toBe(2.6);
    expect(daysBetween(NOW, p.dueAt)).toBe(7);
  });

  test('不正解時は当日中に再出題対象になる', () => {
    const p = applyAnswer(make({ stage: 'recognized' }), { format: 'recognize', correct: false, now: NOW });
    expect(daysBetween(NOW, p.dueAt)).toBe(0);
    expect(isDue(p, NOW)).toBe(true);
  });

  test('new の語は復習対象に含めない', () => {
    expect(isDue(make(), NOW)).toBe(false);
  });

  test('errorTypes は直近 5 件だけ保持する', () => {
    let p = make({ stage: 'recognized' });
    for (let i = 0; i < 7; i++) {
      p = applyAnswer(p, { format: 'recognize', correct: false, errorType: 'memory', now: NOW });
    }
    expect(p.errorTypes).toHaveLength(5);
  });

  test('mastered から運用を落とすと using に降格する', () => {
    const p = applyAnswer(make({ stage: 'mastered', streak: 4 }), { format: 'use', correct: false, now: NOW });
    expect(p.stage).toBe('using');
  });
});
