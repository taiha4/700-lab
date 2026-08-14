/**
 * Gemini へのプロンプト構築（docs/spec.md §5.2 / テスト UT-AI-01,02）
 *
 * 設計方針:
 *  - 「先生が目の前の生徒ひとりに語りかける」ロールと口調を必ず与える。
 *  - 一般論を禁止し、この生徒の回答・履歴を必ず参照させる（パーソナライズ）。
 *  - 例文は必ず単語データの「ビジネス場面」に沿わせる。
 */
import { ERROR_TYPE_LABEL } from '@/types';
import type { AnswerRecord, ErrorType, QuestionFormat, SessionRecord, Word, WordProgress } from '@/types';

export const SYSTEM_INSTRUCTION = `あなたはTOEIC指導歴20年のベテラン英語講師です。生徒は30代の社会人で、通勤と昼休みのスキマ時間だけで TOEIC 700 点突破を目指しています。
次のルールを必ず守ってください。
1. 口調は「先生が目の前の生徒ひとりに語りかける」ように。です・ます調で、温かく、しかし具体的に。「頑張りましょう」だけの精神論は禁止。
2. 一般論を書かない。渡された「この生徒の回答・履歴」に必ず言及する。
3. 例文は必ずビジネス実務の場面（渡された『場面』）に沿ったものにする。
4. 日本語の解説は120字以内。冗長な前置きは書かない。
5. 出力は指定されたJSONスキーマに厳密に従う。JSON以外の文字を出力しない。`;

/** 誤答タイプの定義。プロンプト内で分類基準を明示して判定のブレを抑える */
const ERROR_TYPE_GUIDE = `誤答タイプの分類基準:
- confusion: 意味の近い別の語（類似語）と取り違えた
- pos: 品詞を取り違えた（動詞と名詞の混同など、文中での働きの誤り）
- memory: 単純に記憶が定着していない（語自体を知らない・思い出せない）
- context: 語は知っているが、この文脈での意味・使われ方を読み違えた`;

const FORMAT_LABEL: Record<QuestionFormat, string> = {
  recognize: '意味選択（英単語を見て日本語の意味を4択から選ぶ）',
  use: '文脈穴埋め（ビジネス英文の空欄に入る語を4択から選ぶ）',
};

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** この生徒の履歴を要約した文字列。これがあることで応答がパーソナライズされる */
export function describeLearner(params: {
  progress?: WordProgress;
  recentErrorTypes: ErrorType[];
  learnedCount: number;
  overallAccuracy: number;
  estimatedScore: number;
}): string {
  const { progress, recentErrorTypes, learnedCount, overallAccuracy, estimatedScore } = params;
  const lines: string[] = [];

  if (progress) {
    const wrong = progress.recognizeWrong + progress.useWrong;
    const correct = progress.recognizeCorrect + progress.useCorrect;
    const total = wrong + correct;
    lines.push(
      total === 0
        ? 'この語は今回が初挑戦です。'
        : `この語は過去${total}回中${wrong}回不正解（意味問題 ${progress.recognizeCorrect}○/${progress.recognizeWrong}× ・文脈問題 ${progress.useCorrect}○/${progress.useWrong}×）。`
    );
    if (progress.lastChoiceWrong) lines.push(`前回この語で選んだ誤答: 「${progress.lastChoiceWrong}」。`);
  }

  if (recentErrorTypes.length > 0) {
    const counts = new Map<ErrorType, number>();
    for (const t of recentErrorTypes) counts.set(t, (counts.get(t) ?? 0) + 1);
    const summary = [...counts.entries()].map(([t, n]) => `${ERROR_TYPE_LABEL[t]} ${n}回`).join(' / ');
    lines.push(`この生徒の直近の誤答傾向: ${summary}。`);
  }

  lines.push(`総学習語数 ${learnedCount}語・全体正解率 ${pct(overallAccuracy)}・現在の推定スコア ${Math.round(estimatedScore)}点。`);
  return lines.join('\n');
}

/**
 * プロンプト A: セット開始時の一括生成（1 セットにつき 1 回だけ呼ぶ）。
 *
 * 出題する全語の例文・勘所・見分け方をここでまとめて作る。正解時はこれを見せるだけで済み、
 * API 呼び出しは「不正解の数 + 総括 1 回」に抑えられる（docs/spec.md §5.2.1）。
 */
export function buildBriefPrompt(params: {
  words: Word[];
  /** 文脈穴埋め形式で出す語の id。この語だけ sentence 系も作る */
  useWordIds: number[];
  dominant: ErrorType | null;
  learner: string;
}): string {
  const { words, useWordIds, dominant, learner } = params;
  const useSet = new Set(useWordIds);

  const list = words
    .map(
      (w, i) =>
        `${i + 1}. wordId=${w.id} / 単語: ${w.word} / 品詞: ${w.pos} / 意味: ${w.meaning} / ビジネス場面: ${w.scene} / 混同しやすい類似語: ${w.similar.join(', ') || 'なし'}${useSet.has(w.id) ? ' 【穴埋め問題も作る】' : ''}`
    )
    .join('\n');

  return `これから生徒が学習する単語です。1 語ずつ教材を作ってください。

${list}

【この生徒について】
${learner}

【全語に必要な項目】
- nuance: この語の「勘所」。正解した生徒に伝える一言（120字以内）。訳語の丸暗記で終わらせないよう、実務でどう使う語かを書く。
- howToTell: 似た語と迷ったときの見分け方（1文）。「混同しやすい類似語」に具体的に触れること。
- example: その語を使った自然なビジネス英文1文。必ず「ビジネス場面」の設定に沿わせる。
- exampleJa: example の自然な日本語訳。

【「【穴埋め問題も作る】」と書かれた語にだけ必要な項目】
- sentence: 空欄を "____" で表した英文1文（12〜20語）。空欄には必ずその単語（活用形も可）が入る。TOEIC Part5相当。
- translation: sentence の自然な日本語訳（空欄は正解の語で埋めた訳）。
- distractors: 空欄に入れても文法的には成立しうるが意味的には誤りの語を3つ。「混同しやすい類似語」から優先して選ぶ。
${dominant ? `\nこの生徒は「${ERROR_TYPE_LABEL[dominant]}」で間違えることが多いので、そこが試される内容にしてください。` : ''}`;
}

/**
 * プロンプト B: 誤答分析（不正解のときだけ呼ぶ）。
 * 生徒が実際に選んだ答えは事前に分からないため、ここだけは都度の呼び出しが必要。
 * 例文はプロンプト A で用意済みなので生成させない。
 */
export function buildDiagnosisPrompt(params: {
  word: Word;
  format: QuestionFormat;
  chosen: string;
  correctLabel: string;
  sentence?: string;
  learner: string;
}): string {
  const { word, format, chosen, correctLabel, sentence, learner } = params;

  return `【単語データ】
単語: ${word.word}
品詞: ${word.pos}
意味: ${word.meaning}
難易度: レベル${word.level}
ビジネス場面: ${word.scene}
混同しやすい類似語: ${word.similar.join(', ') || 'なし'}

【出題】
形式: ${FORMAT_LABEL[format]}
${sentence ? `問題文: ${sentence}\n` : ''}正解: ${correctLabel}
生徒の回答: 「${chosen}」（不正解）

【この生徒について】
${learner}

【指示】
${ERROR_TYPE_GUIDE}

errorType: 上の4つから1つ選ぶ。
why: なぜ間違えたのかを、生徒が選んだ「${chosen}」に必ず触れながら書く。上の履歴を踏まえ、同じ間違いを繰り返しているならその点にも触れる。
howToTell: 次に迷ったときの見分け方を具体的に1文で書く。`;
}

/** プロンプト C: セット総括 + 次回への一言 */
export function buildSummaryPrompt(params: {
  answers: AnswerRecord[];
  wordById: Map<number, Word>;
  elapsedMs: number;
  scoreBefore: number;
  scoreAfter: number;
  streakDays: number;
  gapWords: number;
  recentSessions: SessionRecord[];
}): string {
  const { answers, wordById, elapsedMs, scoreBefore, scoreAfter, streakDays, gapWords, recentSessions } = params;

  const detail = answers
    .map((a) => {
      const w = wordById.get(a.wordId);
      const fmt = a.format === 'recognize' ? '意味' : '文脈';
      const mark = a.correct ? '○' : '×';
      const why = !a.correct && a.errorType ? `・原因:${ERROR_TYPE_LABEL[a.errorType]}` : '';
      const chosen = !a.correct ? `・選んだ答え:「${a.chosen}」` : '';
      return `- wordId=${a.wordId} ${w?.word ?? ''}（${w?.meaning ?? ''}）[${fmt}] ${mark}${chosen}${why}`;
    })
    .join('\n');

  const correctCount = answers.filter((a) => a.correct).length;
  const history = recentSessions
    .slice(-3)
    .map((s) => `${Math.round(s.accuracy * 100)}%`)
    .join(' → ');

  return `【今日のセット結果】
${correctCount}問正解 / ${answers.length}問中（所要 ${Math.round(elapsedMs / 1000 / 60)}分${Math.round((elapsedMs / 1000) % 60)}秒）
推定スコア: ${scoreBefore.toFixed(1)}点 → ${scoreAfter.toFixed(1)}点
連続学習日数: ${streakDays}日
「意味は分かるが文脈で使えない」段階の語: ${gapWords}語
${history ? `直近セットの正解率推移: ${history}` : ''}

【1問ずつの結果】
${detail}

【指示】
summary: 今日の学習の総括。必ず具体的な数字と、実際に出た単語名に触れること。200字以内。
strength: 今日よかった点を1文で。お世辞ではなく結果から言えることを。
focus: 次回の重点を1文で。具体的な単語名か誤答タイプを名指しすること。
nextWords: 次回に再挑戦させたい wordId を最大3件（上のリストから選ぶ）。`;
}
