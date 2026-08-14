/**
 * 誤答カルテ（docs/spec.md §4.3）
 *
 * 「間違えた理由が分からない」への回答。正誤だけでなく、
 * 原因タイプ・なぜ間違えたか・次の見分け方・ビジネス例文を診断票の形で返す。
 */
import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Body, EnglishText, Eyebrow, Meta, StitchCard, Tag } from './base';
import { ERROR_TYPE_LABEL, type ErrorType, type FallbackReason, type Feedback, type Word } from '@/types';
import { radius, spacing } from '@/theme';
import { useTheme } from '@/theme/useTheme';

/** AI が使えなかった理由ごとの案内。対処が違うので文言を分ける */
export const FALLBACK_MESSAGE: Record<FallbackReason, string> = {
  'no-key': 'AI解説は設定画面でGemini APIキーを登録すると表示されます。いまは単語データからの説明です。',
  'rate-limit': 'AIの利用制限に達しました。少し時間をおくと再び使えます。いまは単語データからの説明です。',
  'quota-daily':
    '本日のAI利用回数の上限に達しました（無料枠は1日20回）。明日また使えます。いまは単語データからの説明です。',
  offline: 'AI解説を取得できませんでした（通信エラー）。いまは単語データからの説明です。',
};

/** 誤答タイプごとの色。誤答カルテのドーナツと必ず揃える */
export function errorTypeColors(colors: { primary: string; destructive: string; band: string; muted: string }) {
  return {
    confusion: colors.primary,
    pos: colors.band,
    context: colors.destructive,
    memory: colors.muted,
  } as Record<ErrorType, string>;
}

export function FeedbackCard({
  feedback,
  word,
  correct,
  loading,
}: {
  feedback: Feedback | null;
  word: Word;
  correct: boolean;
  loading: boolean;
}) {
  const { colors } = useTheme();

  return (
    <Animated.View entering={FadeIn.duration(200)} style={{ gap: spacing.md }}>
      {/* 正誤は色だけでなくアイコンと文言でも示す */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: correct ? colors.success : colors.destructive,
          }}
        >
          <Body style={{ color: '#fff', fontWeight: '700', fontSize: 14, lineHeight: 18 }}>{correct ? '✓' : '✕'}</Body>
        </View>
        <Body style={{ fontWeight: '700', color: correct ? colors.success : colors.destructive }}>
          {correct ? '正解' : '不正解'}
        </Body>
        <View style={{ flex: 1 }} />
        <Meta>
          {word.word} · {word.pos}
        </Meta>
      </View>

      <StitchCard>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md }}>
          <Eyebrow>{correct ? "TEACHER'S NOTE" : 'DIAGNOSIS'}</Eyebrow>
          {feedback?.errorType ? (
            <Tag label={ERROR_TYPE_LABEL[feedback.errorType]} tone="warning" />
          ) : null}
        </View>

        {loading || !feedback ? (
          <Skeleton />
        ) : (
          <View style={{ gap: spacing.md }}>
            <Body>{feedback.why}</Body>

            <View
              style={{
                backgroundColor: colors.secondary,
                borderRadius: radius.tag,
                padding: spacing.md,
                gap: 4,
              }}
            >
              <Meta style={{ fontWeight: '700' }}>次に迷ったら</Meta>
              <Body style={{ fontSize: 14 }}>{feedback.howToTell}</Body>
            </View>

            <View style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Eyebrow>IN BUSINESS</Eyebrow>
                <Tag label={word.scene} />
              </View>
              <EnglishText style={{ fontSize: 16, lineHeight: 26 }}>{feedback.example}</EnglishText>
              <Meta>{feedback.exampleJa}</Meta>
            </View>

            {feedback.source === 'fallback' ? (
              <Meta style={{ color: colors.destructive }}>{FALLBACK_MESSAGE[feedback.reason ?? 'offline']}</Meta>
            ) : null}
          </View>
        )}
      </StitchCard>
    </Animated.View>
  );
}

/** AI 応答待ちの間も画面を空にしない */
function Skeleton() {
  const { colors } = useTheme();
  const bar = (width: `${number}%`) => (
    <View key={width} style={{ height: 12, width, borderRadius: 6, backgroundColor: colors.secondary }} />
  );
  return (
    <View style={{ gap: spacing.sm }}>
      {bar('92%')}
      {bar('78%')}
      {bar('85%')}
      <Meta style={{ marginTop: spacing.sm }}>先生が解説を書いています…</Meta>
    </View>
  );
}
