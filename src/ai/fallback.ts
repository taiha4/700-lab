/**
 * AI が使えないときの縮退表示（docs/spec.md §5.3）
 * オフライン・APIキー未設定でも学習そのものは止めない。
 */
import type { AnswerRecord, Diagnosis, ErrorType, PosTag, Summary, Word, WordBrief } from '@/types';
import { ERROR_TYPE_LABEL } from '@/types';

/**
 * 品詞ごとの雛形。空欄 "____" に語を入れると自然な英文になるよう、
 * 品詞に合った位置と文型を用意する（1 種類の固定文だと
 * 「review the customer」のような不自然な文になってしまう）。
 */
const TEMPLATES: Record<PosTag, { sentence: string; ja: (word: string) => string }> = {
  verb: {
    sentence: 'Our team will ____ the final report before the deadline next Friday.',
    ja: (w) => `私たちのチームは来週金曜の期限までに最終報告書を${w}予定です。`,
  },
  noun: {
    sentence: 'Please review the ____ carefully before the meeting tomorrow morning.',
    ja: (w) => `明日の朝の会議までに${w}をよく確認してください。`,
  },
  nounPhrase: {
    sentence: 'The board discussed the ____ at length during the quarterly review.',
    ja: (w) => `取締役会は四半期レビューで${w}について詳しく議論しました。`,
  },
  adjective: {
    sentence: 'The manager said that the revised proposal was ____ overall.',
    ja: (w) => `部長は、修正後の提案は全体として${w}ものだと述べました。`,
  },
  adverb: {
    sentence: 'The team completed the migration ____ despite the very tight schedule.',
    ja: (w) => `チームは厳しい日程にもかかわらず、移行作業を${w}完了しました。`,
  },
};

const templateFor = (word: Word) => TEMPLATES[word.posTags[0] ?? 'noun'] ?? TEMPLATES.noun;

/** 空欄に語を入れた完成文 */
const fillBlank = (sentence: string, word: string) => sentence.replace('____', word);

/**
 * AI が使えないときの誤答分析。単語データだけで組み立てる。
 * 例文は WordBrief 側が持つのでここには含めない。
 */
export function fallbackDiagnosis(params: {
  word: Word;
  chosen: string;
  /** 意味選択で選ばれた日本語が類似語のものか判定するために使う */
  words?: Word[];
}): Diagnosis {
  const { word, chosen, words } = params;
  const similar = word.similar.slice(0, 2).join('・');

  return {
    errorType: guessErrorType(word, chosen, words),
    why: `${word.word} の意味は「${word.meaning}」です。「${chosen}」と迷ったのですね。${
      similar ? `${similar} との違いに注意しましょう。` : ''
    }`,
    howToTell: similar
      ? `${word.word} は${word.scene}の文脈で使われます。${similar} との使い分けを意識してください。`
      : `${word.scene}の文脈で出てきたら ${word.word} を思い出してください。`,
    source: 'fallback',
  };
}

/**
 * AI なしでの誤答タイプ推定。
 *
 * 文脈問題では選択肢が英単語なので similar 列と直接照合できるが、
 * 意味選択では選択肢が日本語なので、master 内の類似語の「意味」とも照合する必要がある。
 * さらに、選んだ語の品詞が違えば pos と判定する。
 */
function guessErrorType(word: Word, chosen: string, words?: Word[]): ErrorType {
  const key = chosen.trim().toLowerCase();

  // 文脈問題（英単語を選ぶ）
  if (word.similar.some((s) => s.toLowerCase() === key)) return 'confusion';

  if (words) {
    // 意味選択（日本語を選ぶ）: 選ばれた意味を持つ語を特定する
    const picked = words.find((w) => w.meaning === chosen.trim());
    if (picked) {
      const isSimilar =
        word.similar.some((s) => s.toLowerCase() === picked.word.toLowerCase()) ||
        picked.similar.some((s) => s.toLowerCase() === word.word.toLowerCase());
      if (isSimilar) return 'confusion';
      if (!picked.posTags.some((t) => word.posTags.includes(t))) return 'pos';
      if (picked.scene === word.scene) return 'context';
    }
  }

  return 'memory';
}

/** AI が使えないときの語ごとの教材（例文・勘所・見分け方） */
export function fallbackBrief(word: Word, withSentence: boolean): WordBrief {
  const template = templateFor(word);
  const similar = word.similar.slice(0, 2).join('・');

  return {
    wordId: word.id,
    nuance: `${word.word} は「${word.meaning}」。${word.scene}の場面で頻出です。`,
    howToTell: similar
      ? `${similar} との使い分けを意識してください。`
      : `${word.scene}の文脈で出てきたら思い出せるようにしましょう。`,
    example: fillBlank(template.sentence, word.word),
    exampleJa: template.ja(word.meanings[0] ?? word.meaning),
    ...(withSentence
      ? {
          sentence: template.sentence,
          translation: `${template.ja(word.meanings[0] ?? word.meaning)}（場面: ${word.scene}）`,
          distractors: word.similar.slice(0, 3),
        }
      : {}),
    source: 'fallback',
  };
}

/** ローカル集計だけで作る総括 */
export function fallbackSummary(params: {
  answers: AnswerRecord[];
  scoreBefore: number;
  scoreAfter: number;
  dominant: ErrorType | null;
  wordById: Map<number, Word>;
}): Summary {
  const { answers, scoreBefore, scoreAfter, dominant, wordById } = params;
  const correct = answers.filter((a) => a.correct).length;
  const wrongWords = answers
    .filter((a) => !a.correct)
    .map((a) => wordById.get(a.wordId)?.word)
    .filter(Boolean)
    .slice(0, 3);

  const delta = (scoreAfter - scoreBefore).toFixed(1);

  return {
    summary: `${answers.length}問中${correct}問正解でした。推定スコアは ${scoreBefore.toFixed(1)}点 → ${scoreAfter.toFixed(
      1
    )}点（+${delta}）です。${
      wrongWords.length ? `今日つまずいたのは ${wrongWords.join('・')} でした。` : '全問正解、見事です。'
    }（AI総括は現在取得できません）`,
    strength: correct >= answers.length * 0.7 ? '正解率7割超えを維持できています。' : '最後まで走り切れたことがまず収穫です。',
    focus: dominant
      ? `次回は「${ERROR_TYPE_LABEL[dominant]}」の対策を重点に置きましょう。`
      : '次回は間違えた語の復習から始めましょう。',
    nextWords: answers.filter((a) => !a.correct).map((a) => a.wordId).slice(0, 3),
    source: 'fallback',
  };
}
