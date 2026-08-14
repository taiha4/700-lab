/**
 * 進捗集計と誤答カルテ（docs/spec.md §4.6 / §6.1 / テスト UT-STATS）
 */
import type { AnswerRecord, ErrorType, SessionRecord, Stage, Word, WordProgress } from '@/types';

/** 誤答タイプの並び順（表示順・同数時の優先順） */
export const ERROR_TYPES: ErrorType[] = ['confusion', 'pos', 'context', 'memory'];

/** 全セッションの回答を時系列（古い→新しい）で平坦化する */
export function allAnswers(sessions: SessionRecord[]): AnswerRecord[] {
  return [...sessions]
    .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime())
    .flatMap((s) => s.answers);
}

const ratio = (hit: number, total: number) => (total === 0 ? 0 : hit / total);

export type StageCounts = Record<Stage, number>;

export function stageCounts(words: Word[], progress: Record<number, WordProgress>): StageCounts {
  const counts: StageCounts = { new: 0, recognized: 0, using: 0, mastered: 0 };
  for (const w of words) counts[progress[w.id]?.stage ?? 'new']++;
  return counts;
}

export type Overview = {
  /** 一度でも出題した語 */
  learned: number;
  total: number;
  stages: StageCounts;
  /** 「意味は分かるが使えない」層。このアプリが最も重視する数字 */
  gapWords: number;
  accuracy: number;
  recognizeAccuracy: number;
  useAccuracy: number;
  totalAnswers: number;
  totalSessions: number;
  streakDays: number;
  totalStudyMs: number;
  avgAnswerMs: number;
};

export function buildOverview(
  words: Word[],
  progress: Record<number, WordProgress>,
  sessions: SessionRecord[],
  now: Date = new Date()
): Overview {
  const stages = stageCounts(words, progress);
  const answers = allAnswers(sessions);
  const recognizeAnswers = answers.filter((a) => a.format === 'recognize');
  const useAnswers = answers.filter((a) => a.format === 'use');

  return {
    learned: words.length - stages.new,
    total: words.length,
    stages,
    gapWords: stages.recognized,
    accuracy: ratio(answers.filter((a) => a.correct).length, answers.length),
    recognizeAccuracy: ratio(recognizeAnswers.filter((a) => a.correct).length, recognizeAnswers.length),
    useAccuracy: ratio(useAnswers.filter((a) => a.correct).length, useAnswers.length),
    totalAnswers: answers.length,
    totalSessions: sessions.length,
    streakDays: streakDays(sessions, now),
    totalStudyMs: answers.reduce((sum, a) => sum + a.ms, 0),
    avgAnswerMs: answers.length === 0 ? 0 : answers.reduce((sum, a) => sum + a.ms, 0) / answers.length,
  };
}

// ---- 日付ユーティリティ（端末のローカル日付で扱う） ----

export const dateKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const addDays = (d: Date, n: number): Date => {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
};

/**
 * 連続学習日数。今日の学習がまだでも、昨日まで続いていれば連続は途切れていない扱いにする
 * （通勤前に開いた時点で 0 に見えると継続の動機を折るため）。
 */
export function streakDays(sessions: SessionRecord[], now: Date = new Date()): number {
  if (sessions.length === 0) return 0;
  const days = new Set(sessions.map((s) => dateKey(new Date(s.startedAt))));

  let cursor: Date;
  if (days.has(dateKey(now))) cursor = now;
  else if (days.has(dateKey(addDays(now, -1)))) cursor = addDays(now, -1);
  else return 0;

  let streak = 0;
  while (days.has(dateKey(cursor))) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export type DailyCount = { date: string; label: string; count: number };

/** 直近 7 日の日別回答数。学習のない日も 0 で埋める */
export function last7Days(sessions: SessionRecord[], now: Date = new Date()): DailyCount[] {
  const perDay = new Map<string, number>();
  for (const s of sessions) {
    const key = dateKey(new Date(s.startedAt));
    perDay.set(key, (perDay.get(key) ?? 0) + s.answers.length);
  }
  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays(now, i - 6);
    return { date: dateKey(d), label: String(d.getDate()), count: perDay.get(dateKey(d)) ?? 0 };
  });
}

// ---- 誤答カルテ ----

export type ErrorBreakdown = {
  counts: Record<ErrorType, number>;
  /** AI 分析が取得できなかった不正解 */
  unclassified: number;
  /** 総不正解数（counts の合計 + unclassified と一致する） */
  totalWrong: number;
  dominant: ErrorType | null;
};

export function errorBreakdown(sessions: SessionRecord[]): ErrorBreakdown {
  const counts: Record<ErrorType, number> = { confusion: 0, pos: 0, memory: 0, context: 0 };
  let unclassified = 0;
  let totalWrong = 0;

  for (const a of allAnswers(sessions)) {
    if (a.correct) continue;
    totalWrong++;
    if (a.errorType) counts[a.errorType]++;
    else unclassified++;
  }

  let dominant: ErrorType | null = null;
  let best = 0;
  for (const t of ERROR_TYPES) {
    if (counts[t] > best) {
      best = counts[t];
      dominant = t;
    }
  }
  return { counts, unclassified, totalWrong, dominant };
}

/**
 * 出題ロジックに渡す最頻誤答タイプ。
 * 直近の傾向を優先するため、新しい方から最大 30 件の誤答を見る。
 */
export function dominantErrorType(sessions: SessionRecord[], window = 30): ErrorType | null {
  const wrong = allAnswers(sessions)
    .filter((a) => !a.correct && a.errorType)
    .slice(-window);
  if (wrong.length === 0) return null;

  const counts: Record<ErrorType, number> = { confusion: 0, pos: 0, memory: 0, context: 0 };
  for (const a of wrong) counts[a.errorType!]++;

  let dominant: ErrorType | null = null;
  let best = 0;
  for (const t of ERROR_TYPES) {
    if (counts[t] > best) {
      best = counts[t];
      dominant = t;
    }
  }
  return dominant;
}

/**
 * 内訳の百分率。単純な四捨五入だと合計が 101% になり数字の信頼を損なうため、
 * 最大剰余法で合計をちょうど 100% にそろえる（合計が 0 のときは全て 0）。
 */
export function toPercentages(values: number[]): number[] {
  const total = values.reduce((a, b) => a + b, 0);
  if (total === 0) return values.map(() => 0);

  const exact = values.map((v) => (v / total) * 100);
  const floors = exact.map(Math.floor);
  let remainder = 100 - floors.reduce((a, b) => a + b, 0);

  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);

  const out = [...floors];
  for (const { i } of order) {
    if (remainder <= 0) break;
    out[i]++;
    remainder--;
  }
  return out;
}

/** 要注意語（間違えた回数が多い順）。同数なら直近に間違えた語を優先 */
export function weakWords(
  words: Word[],
  progress: Record<number, WordProgress>,
  limit = 5
): { word: Word; wrong: number; progress: WordProgress }[] {
  return words
    .map((word) => ({ word, p: progress[word.id] }))
    .filter((x): x is { word: Word; p: WordProgress } => !!x.p)
    .map(({ word, p }) => ({ word, progress: p, wrong: p.recognizeWrong + p.useWrong }))
    .filter((x) => x.wrong > 0)
    .sort(
      (a, b) =>
        b.wrong - a.wrong ||
        new Date(b.progress.lastAnsweredAt ?? 0).getTime() - new Date(a.progress.lastAnsweredAt ?? 0).getTime()
    )
    .slice(0, limit);
}
