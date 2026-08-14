/**
 * Gemini の構造化出力スキーマ（responseSchema）
 * OpenAPI サブセットで記述する。型がぶれると UI が壊れるため必ず指定する。
 */

/** 不正解時だけ呼ぶ誤答分析。例文はセット開始時に用意済みなので含めない */
export const diagnosisSchema = {
  type: 'OBJECT',
  properties: {
    errorType: { type: 'STRING', enum: ['confusion', 'pos', 'memory', 'context'] },
    why: { type: 'STRING' },
    howToTell: { type: 'STRING' },
  },
  required: ['errorType', 'why', 'howToTell'],
  propertyOrdering: ['errorType', 'why', 'howToTell'],
} as const;

export const summarySchema = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING' },
    strength: { type: 'STRING' },
    focus: { type: 'STRING' },
    nextWords: { type: 'ARRAY', items: { type: 'INTEGER' } },
  },
  required: ['summary', 'strength', 'focus', 'nextWords'],
  propertyOrdering: ['summary', 'strength', 'focus', 'nextWords'],
} as const;

/**
 * セット開始時の一括生成。1 回の呼び出しで出題する全語ぶんを受け取る。
 * sentence / translation / distractors は運用形式で出す語にだけ入る。
 */
export const briefsSchema = {
  type: 'OBJECT',
  properties: {
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          wordId: { type: 'INTEGER' },
          nuance: { type: 'STRING' },
          howToTell: { type: 'STRING' },
          example: { type: 'STRING' },
          exampleJa: { type: 'STRING' },
          sentence: { type: 'STRING' },
          translation: { type: 'STRING' },
          distractors: { type: 'ARRAY', items: { type: 'STRING' } },
        },
        required: ['wordId', 'nuance', 'howToTell', 'example', 'exampleJa'],
        propertyOrdering: [
          'wordId',
          'nuance',
          'howToTell',
          'example',
          'exampleJa',
          'sentence',
          'translation',
          'distractors',
        ],
      },
    },
  },
  required: ['items'],
} as const;
