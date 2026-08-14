/** アプリ全体で共有する型定義（docs/spec.md §3 に対応） */

export type PosTag = 'verb' | 'noun' | 'adjective' | 'adverb' | 'nounPhrase';

/** 単語マスタ 1 件（src/data/toeic_wordlist.json・読み取り専用） */
export type Word = {
  id: number;
  word: string;
  pos: string;
  posTags: PosTag[];
  meaning: string;
  meanings: string[];
  level: 1 | 2 | 3;
  scene: string;
  similar: string[];
};

/**
 * 学習段階。「覚えた」と「使える」を分けて管理するための中核概念。
 * recognized（意味は分かるが使えない）に滞留している語がユーザーの伸びしろになる。
 */
export type Stage = 'new' | 'recognized' | 'using' | 'mastered';

/** 誤答の原因タイプ。Gemini が分類し、出題ロジックにフィードバックされる。 */
export type ErrorType = 'confusion' | 'pos' | 'memory' | 'context';

export const ERROR_TYPE_LABEL: Record<ErrorType, string> = {
  confusion: '類似語の混同',
  pos: '品詞の取り違え',
  memory: '記憶があいまい',
  context: '文脈で意味がズレた',
};

export type QuestionFormat = 'recognize' | 'use';

export type WordProgress = {
  wordId: number;
  stage: Stage;
  recognizeCorrect: number;
  recognizeWrong: number;
  useCorrect: number;
  useWrong: number;
  streak: number;
  ease: number;
  intervalDays: number;
  /** ISO 文字列。この日時を過ぎた語が復習枠の対象になる */
  dueAt: string;
  lastAnsweredAt: string | null;
  /** 直近 5 件の誤答タイプ（新しいものが末尾） */
  errorTypes: ErrorType[];
  lastChoiceWrong: string | null;
};

export type Choice = {
  /** 表示文字列。recognize では日本語の意味、use では英単語 */
  label: string;
  correct: boolean;
};

export type Question = {
  wordId: number;
  format: QuestionFormat;
  choices: Choice[];
  /** use 形式のみ: 空欄を "____" で表した英文 */
  sentence?: string;
  /** use 形式のみ: 英文の和訳 */
  translation?: string;
  /** use 形式の文が Gemini 生成かフォールバックか */
  sentenceSource?: 'ai' | 'fallback';
};

export type AnswerRecord = {
  wordId: number;
  format: QuestionFormat;
  correct: boolean;
  chosen: string;
  /** 回答までのミリ秒 */
  ms: number;
  errorType?: ErrorType;
};

export type SessionRecord = {
  id: string;
  startedAt: string;
  finishedAt: string;
  mode: SessionMode;
  answers: AnswerRecord[];
  /** 0–1 */
  accuracy: number;
  scoreBefore: number;
  scoreAfter: number;
  summary: string | null;
  nextAdvice: string | null;
};

export type SessionMode = 'commute' | 'lunch';

export type Settings = {
  questionCount: 8 | 10 | 12;
  /** 出題対象レベル。空にはできない */
  levels: (1 | 2 | 3)[];
  /** 設定画面で入力した Gemini API キー（未入力なら null → env の値を使う） */
  apiKey: string | null;
  haptics: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  questionCount: 10,
  levels: [1, 2, 3],
  apiKey: null,
  haptics: true,
};

/** AI が使えなかった理由。ユーザーに正しい対処を伝えるために使う */
export type FallbackReason = 'no-key' | 'rate-limit' | 'quota-daily' | 'offline';

/** Gemini の誤答分析＋例文（プロンプト B の応答） */
export type Feedback = {
  errorType: ErrorType | null;
  why: string;
  howToTell: string;
  example: string;
  exampleJa: string;
  source: 'ai' | 'fallback';
  reason?: FallbackReason;
};

/** Gemini のセット総括（プロンプト C の応答） */
export type Summary = {
  summary: string;
  strength: string;
  focus: string;
  nextWords: number[];
  source: 'ai' | 'fallback';
  reason?: FallbackReason;
};

/**
 * セット開始時に 1 回でまとめて生成する、語ごとの教材（プロンプト A の応答 1 件ぶん）。
 *
 * 例文と勘所を先に用意しておくことで、正解時は API を呼ばずに済む。
 * 無料枠の 1 日 20 リクエストに収めるための設計（docs/spec.md §5.2.1）。
 */
export type WordBrief = {
  wordId: number;
  /** 正解時に見せる「この語の勘所」 */
  nuance: string;
  /** 似た語と迷ったときの見分け方 */
  howToTell: string;
  /** ビジネス場面に沿った例文（正誤を問わず見せる） */
  example: string;
  exampleJa: string;
  /** 運用形式（文脈穴埋め）で出す語のみ。空欄を "____" で表した英文 */
  sentence?: string;
  translation?: string;
  distractors?: string[];
  source: 'ai' | 'fallback';
};

/** 不正解時だけ取りにいく誤答分析（プロンプト B の応答） */
export type Diagnosis = {
  errorType: ErrorType | null;
  why: string;
  howToTell: string;
  source: 'ai' | 'fallback';
  reason?: FallbackReason;
};
