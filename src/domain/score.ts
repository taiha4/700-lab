/**
 * 700 点メーター（推定到達スコア）— docs/spec.md §6 / テスト UT-SCORE
 *
 * 「続けても前進の実感がない」への回答。学習状態から推定スコアを算出し、
 * セット終了時に差分（+2.4 pt など）で提示する。式はアプリ内でも公開する。
 */
import type { AnswerRecord, WordProgress, Stage, Word } from '@/types';

export const BASE_SCORE = 450;
export const SCORE_MIN = 400;
export const SCORE_MAX = 990;

/** レベル重み。全 300 語を mastered にすると合計がおよそ 700 になるよう調整してある */
export const LEVEL_WEIGHT: Record<1 | 2 | 3, number> = { 1: 0.45, 2: 0.7, 3: 0.89 };

/** 段階係数。「意味が分かる」だけでは満点にならない点がこのアプリの主張 */
export const STAGE_COEF: Record<Stage, number> = {
  new: 0,
  recognized: 0.4,
  using: 0.8,
  mastered: 1,
};

/** 正解率補正の対象にする直近の回答数 */
export const RECENT_WINDOW = 50;

/** 直近 RECENT_WINDOW 問の正解率（0–1）。回答が無ければ 0 */
export function recentAccuracy(answers: AnswerRecord[]): number {
  const recent = answers.slice(-RECENT_WINDOW);
  if (recent.length === 0) return 0;
  return recent.filter((a) => a.correct).length / recent.length;
}

/** 正解率補正 0.9〜1.1 */
export function accuracyAdjustment(accuracy: number): number {
  return 0.9 + Math.min(1, Math.max(0, accuracy)) * 0.2;
}

/**
 * 推定スコア = 450 + Σ(レベル重み × 段階係数) × 正解率補正
 * @param answers 通算の回答履歴（新しいものが末尾）
 */
export function estimateScore(
  words: Word[],
  progress: Record<number, WordProgress>,
  answers: AnswerRecord[]
): number {
  let sum = 0;
  for (const w of words) {
    const stage = progress[w.id]?.stage ?? 'new';
    sum += LEVEL_WEIGHT[w.level] * STAGE_COEF[stage];
  }
  const raw = BASE_SCORE + sum * accuracyAdjustment(recentAccuracy(answers));
  return Math.min(SCORE_MAX, Math.max(SCORE_MIN, raw));
}

/** 表示用に小数第 1 位へ丸める（例: 614.4） */
export const formatScore = (score: number): string => score.toFixed(1);

/** 差分表示用（例: +2.4 / -0.8） */
export function formatDelta(before: number, after: number): string {
  const d = after - before;
  const sign = d > 0 ? '+' : d < 0 ? '' : '±';
  return `${sign}${d.toFixed(1)}`;
}

/** 目標 700 点までの到達率（0–1）。ゲージ描画に使う */
export function progressTo700(score: number): number {
  const ratio = (score - BASE_SCORE) / (700 - BASE_SCORE);
  return Math.min(1, Math.max(0, ratio));
}
