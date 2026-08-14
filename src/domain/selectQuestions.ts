/**
 * 出題選定（docs/spec.md §4.2 / テスト UT-SELECT）
 *
 * 1 セットに「復習・運用チャレンジ・新規」を必ず混ぜ、
 * 認識問題だけで終わらない（＝覚えたつもりで終わらない）構成にする。
 */
import type { QuestionFormat, Settings, Word, WordProgress } from '@/types';
import { isDue } from './srs';

export type PlannedQuestion = {
  wordId: number;
  format: QuestionFormat;
};

export type SelectParams = {
  words: Word[];
  progress: Record<number, WordProgress>;
  settings: Pick<Settings, 'questionCount' | 'levels'>;
  /** 直近セットで出題した語。期限が来ていなければ連続出題を避ける */
  recentWordIds?: number[];
  now?: Date;
  random?: () => number;
};

/** 枠の配分（合計が questionCount ちょうどになる） */
export function bucketSizes(questionCount: number) {
  const review = Math.round(questionCount * 0.4);
  const use = Math.round(questionCount * 0.3);
  return { review, use, fresh: questionCount - review - use };
}

/**
 * 出題形式は学習段階から決まる。
 * 意味の正答率が低いうちは運用に上げず、認識問題で土台を固める。
 */
export function formatFor(progress: WordProgress | undefined): QuestionFormat {
  if (!progress || progress.stage === 'new') return 'recognize';
  if (progress.recognizeWrong > progress.recognizeCorrect) return 'recognize';
  return 'use';
}

export function selectQuestions(params: SelectParams): PlannedQuestion[] {
  const { words, progress, settings, recentWordIds = [], random = Math.random } = params;
  const now = params.now ?? new Date();
  const count = settings.questionCount;
  const levels = settings.levels.length > 0 ? settings.levels : [1, 2, 3];

  const recent = new Set(recentWordIds);
  const chosen = new Map<number, PlannedQuestion>();

  const at = (w: Word) => progress[w.id];
  const due = (w: Word) => {
    const p = at(w);
    return p ? isDue(p, now) : false;
  };
  const dueTime = (w: Word) => new Date(at(w)?.dueAt ?? 0).getTime();

  /** 同一セットに同じ語を 2 回出さない */
  const add = (w: Word, format?: QuestionFormat) => {
    if (chosen.has(w.id) || chosen.size >= count) return;
    chosen.set(w.id, { wordId: w.id, format: format ?? formatFor(at(w)) });
  };

  const available = words.filter((w) => !recent.has(w.id) || due(w));

  // --- 枠 A: 復習（期限到来・dueAt 昇順） ---
  const { review, use, fresh } = bucketSizes(count);
  const dueWords = available.filter(due).sort((a, b) => dueTime(a) - dueTime(b));
  for (const w of dueWords.slice(0, review)) add(w);

  // --- 枠 B: 運用チャレンジ（「意味は分かるが使えない」語を必ず use 形式で出す） ---
  const recognized = shuffleBy(
    available.filter((w) => at(w)?.stage === 'recognized' && !chosen.has(w.id)),
    random
  );
  let used = 0;
  for (const w of recognized) {
    if (used >= use) break;
    add(w, 'use');
    used++;
  }

  // --- 枠 C: 新規（対象レベル内。やさしいレベルから投入する） ---
  const freshWords = available
    .filter((w) => (at(w)?.stage ?? 'new') === 'new' && !chosen.has(w.id))
    .filter((w) => levels.includes(w.level))
    .sort((a, b) => a.level - b.level || a.id - b.id);
  for (const w of freshWords.slice(0, fresh)) add(w, 'recognize');

  // --- 補充: 規定問題数を必ず満たす（枠が埋まらなかった場合） ---
  if (chosen.size < count) {
    const fillers = [
      // 期限超過の残り（枠 A の上限を超えたぶん）
      ...dueWords,
      // 未出題の新規（レベル設定を尊重）
      ...freshWords,
      // 学習済みの語を dueAt が近い順に（全語 mastered などの終盤ケース）
      ...available.filter((w) => at(w) && at(w)!.stage !== 'new').sort((a, b) => dueTime(a) - dueTime(b)),
      // それでも足りなければレベル設定を外して新規から
      ...words.filter((w) => (at(w)?.stage ?? 'new') === 'new'),
      // 最後の砦: マスタ全体
      ...words,
    ];
    for (const w of fillers) {
      if (chosen.size >= count) break;
      add(w);
    }
  }

  return shuffleBy([...chosen.values()], random);
}

function shuffleBy<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
