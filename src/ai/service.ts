/**
 * AI サービス層（docs/spec.md §5）
 * ここから外へは例外を投げない。失敗はすべてフォールバックに変換する。
 */
import type {
  AnswerRecord,
  Diagnosis,
  ErrorType,
  FallbackReason,
  QuestionFormat,
  SessionRecord,
  Summary,
  Word,
  WordBrief,
  WordProgress,
} from '@/types';
import { GeminiError, generateJson } from './gemini';
import { briefsSchema, diagnosisSchema, summarySchema } from './schemas';
import {
  SYSTEM_INSTRUCTION,
  buildBriefPrompt,
  buildDiagnosisPrompt,
  buildSummaryPrompt,
  describeLearner,
} from './prompts';
import { fallbackBrief, fallbackDiagnosis, fallbackSummary } from './fallback';

const ERROR_TYPES: ErrorType[] = ['confusion', 'pos', 'memory', 'context'];

/** "none" や未知の値を安全に ErrorType | null へ落とす */
function toErrorType(raw: unknown): ErrorType | null {
  return typeof raw === 'string' && (ERROR_TYPES as string[]).includes(raw) ? (raw as ErrorType) : null;
}

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' && v.trim() ? v.trim() : fallback);

/** 失敗の理由をユーザー向けの区分に落とす */
function toReason(e: unknown): FallbackReason {
  if (e instanceof GeminiError) {
    if (e.kind === 'no-key') return 'no-key';
    if (e.kind === 'rate-limit') return 'rate-limit';
    if (e.kind === 'quota-daily') return 'quota-daily';
  }
  return 'offline';
}

export type LearnerContext = {
  recentErrorTypes: ErrorType[];
  learnedCount: number;
  overallAccuracy: number;
  estimatedScore: number;
};

/**
 * セット開始時の一括生成（1 セットにつき 1 回）。
 * 返らなかった語はテンプレートで埋めるので、部分的に失敗しても学習は成立する。
 */
export async function fetchWordBriefs(params: {
  apiKey: string | null;
  words: Word[];
  /** 文脈穴埋め形式で出す語の id */
  useWordIds: number[];
  dominant: ErrorType | null;
  learner: LearnerContext;
  signal?: AbortSignal;
}): Promise<WordBrief[]> {
  const { apiKey, words, useWordIds, dominant, learner, signal } = params;
  if (words.length === 0) return [];

  const useSet = new Set(useWordIds);
  const fallbackAll = () => words.map((w) => fallbackBrief(w, useSet.has(w.id)));

  try {
    const raw = await generateJson<{ items?: Record<string, unknown>[] }>({
      apiKey,
      system: SYSTEM_INSTRUCTION,
      prompt: buildBriefPrompt({
        words,
        useWordIds,
        dominant,
        learner: describeLearner({ ...learner }),
      }),
      schema: briefsSchema,
      // 全語ぶんをまとめて受け取るので出力枠を大きく取る
      maxOutputTokens: Math.min(8_192, 420 * words.length),
      signal,
    });

    const byId = new Map<number, WordBrief>();
    for (const item of raw.items ?? []) {
      const wordId = Number(item.wordId);
      const word = words.find((w) => w.id === wordId);
      if (!word) continue;

      const base = fallbackBrief(word, useSet.has(wordId));
      const needsSentence = useSet.has(wordId);
      const sentence = str(item.sentence);
      // 空欄のない文は穴埋め問題として成立しないので採用しない
      const sentenceOk = !needsSentence || sentence.includes('____');

      const distractors = Array.isArray(item.distractors)
        ? item.distractors.map((d) => str(d)).filter(Boolean)
        : [];

      byId.set(wordId, {
        wordId,
        nuance: str(item.nuance, base.nuance),
        howToTell: str(item.howToTell, base.howToTell),
        example: str(item.example, base.example),
        exampleJa: str(item.exampleJa, base.exampleJa),
        ...(needsSentence
          ? {
              sentence: sentenceOk ? sentence : base.sentence,
              translation: str(item.translation, base.translation),
              distractors:
                distractors.length >= 3 ? distractors.slice(0, 3) : [...distractors, ...word.similar].slice(0, 3),
            }
          : {}),
        // 穴埋め文が使えなかった語はテンプレート扱いにして、UI 側で分かるようにする
        source: sentenceOk ? 'ai' : 'fallback',
      });
    }
    return words.map((w) => byId.get(w.id) ?? fallbackBrief(w, useSet.has(w.id)));
  } catch {
    return fallbackAll();
  }
}

/**
 * 誤答分析（不正解のときだけ呼ぶ）。
 * 正解時に呼ばないことで、1 セットの API 消費を「1 + 誤答数 + 1」に抑える。
 */
export async function fetchDiagnosis(params: {
  apiKey: string | null;
  word: Word;
  format: QuestionFormat;
  chosen: string;
  correctLabel: string;
  sentence?: string;
  progress?: WordProgress;
  learner: LearnerContext;
  allWords?: Word[];
  signal?: AbortSignal;
}): Promise<Diagnosis> {
  const { apiKey, word, format, chosen, correctLabel, sentence, progress, learner, allWords, signal } = params;

  try {
    const raw = await generateJson<Record<string, unknown>>({
      apiKey,
      system: SYSTEM_INSTRUCTION,
      prompt: buildDiagnosisPrompt({
        word,
        format,
        chosen,
        correctLabel,
        sentence,
        learner: describeLearner({ progress, ...learner }),
      }),
      schema: diagnosisSchema,
      maxOutputTokens: 400,
      signal,
    });

    const base = fallbackDiagnosis({ word, chosen, words: allWords });
    return {
      errorType: toErrorType(raw.errorType) ?? base.errorType,
      why: str(raw.why, base.why),
      howToTell: str(raw.howToTell, base.howToTell),
      source: 'ai',
    };
  } catch (e) {
    return { ...fallbackDiagnosis({ word, chosen, words: allWords }), reason: toReason(e) };
  }
}

/** セット総括 + 次回への一言 */
export async function fetchSummary(params: {
  apiKey: string | null;
  answers: AnswerRecord[];
  wordById: Map<number, Word>;
  elapsedMs: number;
  scoreBefore: number;
  scoreAfter: number;
  streakDays: number;
  gapWords: number;
  recentSessions: SessionRecord[];
  dominant: ErrorType | null;
  signal?: AbortSignal;
}): Promise<Summary> {
  const { apiKey, answers, wordById, dominant, scoreBefore, scoreAfter, signal } = params;
  const fb = () => fallbackSummary({ answers, scoreBefore, scoreAfter, dominant, wordById });

  try {
    const raw = await generateJson<Record<string, unknown>>({
      apiKey,
      system: SYSTEM_INSTRUCTION,
      prompt: buildSummaryPrompt(params),
      schema: summarySchema,
      maxOutputTokens: 768,
      // 総括はユーザーが結果を読んでいる間に取りにいけるため、
      // 利用制限に当たっても少し待って取り直す価値がある
      maxRetryWaitMs: 35_000,
      signal,
    });

    const base = fb();
    const nextWords = Array.isArray(raw.nextWords)
      ? raw.nextWords.map(Number).filter((n) => Number.isInteger(n) && wordById.has(n)).slice(0, 3)
      : [];

    return {
      summary: str(raw.summary, base.summary),
      strength: str(raw.strength, base.strength),
      focus: str(raw.focus, base.focus),
      nextWords: nextWords.length ? nextWords : base.nextWords,
      source: 'ai',
    };
  } catch (e) {
    return { ...fb(), reason: toReason(e) };
  }
}
