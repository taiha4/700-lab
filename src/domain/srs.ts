/**
 * 間隔反復と学習段階の遷移（docs/spec.md §4.7 / テスト UT-SRS）
 *
 * 「覚えた」と「使える」を分けるため、stage は認識（recognize）と運用（use）の
 * どちらに正解したかで遷移先が変わる。運用で落とすと 1 段階降格する。
 */
import type { ErrorType, QuestionFormat, Stage, WordProgress } from '@/types';

export const EASE_MIN = 1.3;
export const EASE_MAX = 2.8;
export const EASE_DEFAULT = 2.5;
export const EASE_UP = 0.1;
export const EASE_DOWN = 0.2;

/** streak（連続正解数）に対応する基準インターバル（日） */
export const INTERVALS = [1, 3, 7, 14, 30] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

export function createInitialProgress(wordId: number, now: Date = new Date()): WordProgress {
  return {
    wordId,
    stage: 'new',
    recognizeCorrect: 0,
    recognizeWrong: 0,
    useCorrect: 0,
    useWrong: 0,
    streak: 0,
    ease: EASE_DEFAULT,
    intervalDays: 0,
    dueAt: now.toISOString(),
    lastAnsweredAt: null,
    errorTypes: [],
    lastChoiceWrong: null,
  };
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** 浮動小数の誤差が ease に蓄積しないよう小数第 2 位に丸める */
const round2 = (v: number) => Math.round(v * 100) / 100;

/** streak に対応するインターバルを返す。streak が 0 なら 0 日（当日再出題） */
export function intervalForStreak(streak: number): number {
  if (streak <= 0) return 0;
  return INTERVALS[Math.min(streak - 1, INTERVALS.length - 1)];
}

const STAGE_ORDER: Stage[] = ['new', 'recognized', 'using', 'mastered'];

/** 運用問題を落としたときに 1 段階降格させる（new より下には落とさない） */
function demote(stage: Stage): Stage {
  const i = STAGE_ORDER.indexOf(stage);
  return STAGE_ORDER[Math.max(0, i - 1)];
}

/**
 * 学習段階の遷移。
 * - 認識で正解: new → recognized（それ以外は据え置き）
 * - 運用で正解: recognized → using / using は連続 2 回目で mastered
 * - 運用で不正解: 1 段階降格（mastered → using → recognized）
 * - 認識で不正解: 段階は据え置き（streak のリセットのみ）
 */
export function nextStage(params: {
  stage: Stage;
  format: QuestionFormat;
  correct: boolean;
  /** 回答前の連続正解数 */
  streakBefore: number;
}): Stage {
  const { stage, format, correct, streakBefore } = params;

  if (format === 'recognize') {
    if (!correct) return stage;
    return stage === 'new' ? 'recognized' : stage;
  }

  // format === 'use'
  if (!correct) return demote(stage);
  if (stage === 'new' || stage === 'recognized') return 'using';
  if (stage === 'using') return streakBefore >= 1 ? 'mastered' : 'using';
  return 'mastered';
}

export type AnswerInput = {
  format: QuestionFormat;
  correct: boolean;
  errorType?: ErrorType;
  chosen?: string;
  now?: Date;
};

/** 1 問の回答を学習状態に反映した新しい WordProgress を返す（元の値は変更しない） */
export function applyAnswer(progress: WordProgress, input: AnswerInput): WordProgress {
  const { format, correct, errorType, chosen } = input;
  const now = input.now ?? new Date();

  const ease = correct
    ? round2(clamp(progress.ease + EASE_UP, EASE_MIN, EASE_MAX))
    : round2(clamp(progress.ease - EASE_DOWN, EASE_MIN, EASE_MAX));

  const streak = correct ? progress.streak + 1 : 0;
  const intervalDays = intervalForStreak(streak);

  // 不正解なら interval 0 → dueAt は現在時刻（当日中の再出題対象になる）
  const dueDays = Math.round((intervalDays * ease) / 2.5);
  const dueAt = new Date(now.getTime() + dueDays * DAY_MS).toISOString();

  const errorTypes = !correct && errorType ? [...progress.errorTypes, errorType].slice(-5) : progress.errorTypes;

  return {
    ...progress,
    stage: nextStage({ stage: progress.stage, format, correct, streakBefore: progress.streak }),
    recognizeCorrect: progress.recognizeCorrect + (format === 'recognize' && correct ? 1 : 0),
    recognizeWrong: progress.recognizeWrong + (format === 'recognize' && !correct ? 1 : 0),
    useCorrect: progress.useCorrect + (format === 'use' && correct ? 1 : 0),
    useWrong: progress.useWrong + (format === 'use' && !correct ? 1 : 0),
    streak,
    ease,
    intervalDays,
    dueAt,
    lastAnsweredAt: now.toISOString(),
    errorTypes,
    lastChoiceWrong: correct ? progress.lastChoiceWrong : (chosen ?? progress.lastChoiceWrong),
  };
}

/** 復習期限が到来しているか */
export function isDue(progress: WordProgress, now: Date = new Date()): boolean {
  return progress.stage !== 'new' && new Date(progress.dueAt).getTime() <= now.getTime();
}
