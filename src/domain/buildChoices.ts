/**
 * 選択肢生成（docs/spec.md §4.5 / テスト UT-CHOICE）
 *
 * このアプリの差別化点のひとつ。ダミー選択肢の選び方が
 * 「ユーザーの最頻誤答タイプ」によって変わる＝誤答分析が出題に還元される。
 */
import type { Choice, ErrorType, QuestionFormat, Word } from '@/types';

export const CHOICE_COUNT = 4;

/** マスタ全体に対して 1 度だけ作るインデックス（配列の参照が同じ間は再利用する） */
type WordIndex = {
  byWord: Map<string, Word>;
  /** ある語を similar に挙げている語の一覧（逆引き） */
  referencedBy: Map<string, Word[]>;
};

let cachedSource: Word[] | null = null;
let cachedIndex: WordIndex | null = null;

export function buildIndex(words: Word[]): WordIndex {
  if (cachedSource === words && cachedIndex) return cachedIndex;

  const byWord = new Map<string, Word>();
  const referencedBy = new Map<string, Word[]>();
  for (const w of words) byWord.set(w.word.toLowerCase(), w);
  for (const w of words) {
    for (const s of w.similar) {
      const key = s.toLowerCase();
      const list = referencedBy.get(key);
      if (list) list.push(w);
      else referencedBy.set(key, [w]);
    }
  }

  cachedSource = words;
  cachedIndex = { byWord, referencedBy };
  return cachedIndex;
}

/** Fisher–Yates。random を差し替えられるようにしてテストを決定的にする */
export function shuffle<T>(items: T[], random: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** master 内に実在する類似語（順方向 + 逆引き） */
export function similarWordsInMaster(word: Word, words: Word[]): Word[] {
  const { byWord, referencedBy } = buildIndex(words);
  const found = new Map<number, Word>();

  for (const s of word.similar) {
    const hit = byWord.get(s.toLowerCase());
    if (hit && hit.id !== word.id) found.set(hit.id, hit);
  }
  for (const w of referencedBy.get(word.word.toLowerCase()) ?? []) {
    if (w.id !== word.id) found.set(w.id, w);
  }
  return [...found.values()];
}

const sharesPos = (a: Word, b: Word) => a.posTags.some((t) => b.posTags.includes(t));

/**
 * recognize 形式（日本語の意味 4 択）のダミー候補を優先順に並べる。
 * 誤答タイプごとに「何と紛らわしくするか」を変えるのが要点。
 */
function candidatePoolForRecognize(word: Word, words: Word[], dominant: ErrorType | null): Word[] {
  const others = words.filter((w) => w.id !== word.id);
  const similar = similarWordsInMaster(word, words);
  const samePosSameLevel = others.filter((w) => w.level === word.level && sharesPos(w, word));
  const diffPos = others.filter((w) => !sharesPos(w, word));
  const sameScene = others.filter((w) => w.scene === word.scene);
  const sameLevel = others.filter((w) => w.level === word.level);

  switch (dominant) {
    case 'pos':
      // 品詞を取り違える人には、あえて品詞の異なる語を混ぜて意識させる
      return [...diffPos, ...sameLevel, ...others];
    case 'memory':
    case 'context':
      return [...sameScene, ...sameLevel, ...others];
    case 'confusion':
    default:
      // 既定も confusion 扱い（類似語の混同が最も起きやすいため）
      return [...similar, ...samePosSameLevel, ...sameLevel, ...others];
  }
}

/**
 * use 形式（英単語 4 択）のダミー候補。
 * similar 列の文字列をそのまま使えるので、全 300 語で「紛らわしい選択肢」が成立する。
 */
function candidatePoolForUse(
  word: Word,
  words: Word[],
  dominant: ErrorType | null,
  aiDistractors: string[]
): string[] {
  const others = words.filter((w) => w.id !== word.id);
  const samePos = others.filter((w) => sharesPos(w, word)).map((w) => w.word);
  const diffPos = others.filter((w) => !sharesPos(w, word)).map((w) => w.word);
  const sameLevel = others.filter((w) => w.level === word.level).map((w) => w.word);

  if (dominant === 'pos') {
    return [...aiDistractors, ...diffPos, ...word.similar, ...sameLevel];
  }
  // confusion / memory / context / 既定: 類似語を最優先で混ぜる
  return [...aiDistractors, ...word.similar, ...samePos, ...sameLevel];
}

export type BuildChoicesParams = {
  word: Word;
  format: QuestionFormat;
  words: Word[];
  /** ユーザーの最頻誤答タイプ。null の場合は confusion 相当の既定戦略 */
  dominantErrorType?: ErrorType | null;
  /** use 形式で Gemini が返した distractor（あれば最優先で使う） */
  aiDistractors?: string[];
  random?: () => number;
};

/**
 * 正解 1 + ダミー 3 の 4 択を返す。
 * 重複ラベルは除外し、候補が尽きた場合もマスタ全体から補って必ず 4 択にする。
 */
export function buildChoices(params: BuildChoicesParams): Choice[] {
  const { word, format, words, dominantErrorType = null, aiDistractors = [], random = Math.random } = params;

  const correctLabel = format === 'recognize' ? word.meaning : word.word;
  const labels: string[] = [correctLabel];
  const seen = new Set([correctLabel.toLowerCase()]);

  const pool =
    format === 'recognize'
      ? candidatePoolForRecognize(word, words, dominantErrorType).map((w) => w.meaning)
      : candidatePoolForUse(word, words, dominantErrorType, aiDistractors);

  for (const label of pool) {
    if (labels.length >= CHOICE_COUNT) break;
    const key = label.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    labels.push(label.trim());
  }

  // 候補が足りない異常系でもクラッシュさせない（テスト UT-CHOICE-05）
  for (const w of words) {
    if (labels.length >= CHOICE_COUNT) break;
    const label = format === 'recognize' ? w.meaning : w.word;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    labels.push(label);
  }

  return shuffle(
    labels.map((label) => ({ label, correct: label === correctLabel })),
    random
  );
}
