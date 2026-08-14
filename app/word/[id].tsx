/**
 * 単語詳細（docs/spec.md §4.1）
 * その語について「自分が今どう間違えているか」と、保存済みの例文を見る画面。
 */
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Body, Button, Card, Divider, EnglishText, Eyebrow, Meta, Num, Screen, Tag, Title } from '@/components/base';
import { getWord, useWords } from '@/context/WordsProvider';
import { ERROR_TYPE_LABEL } from '@/types';
import { spacing } from '@/theme';
import { useTheme } from '@/theme/useTheme';

const STAGE_LABEL = {
  new: '未学習',
  recognized: '分かる（意味は取れる）',
  using: '使える（文脈で選べた）',
  mastered: '使いこなせる',
} as const;

export default function WordDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const { progress, aiCache } = useWords();

  const word = getWord(Number(id));
  if (!word) {
    return (
      <Screen>
        <Meta>単語が見つかりませんでした。</Meta>
        <Button label="閉じる" onPress={() => router.back()} style={{ marginTop: spacing.lg }} />
      </Screen>
    );
  }

  const p = progress[word.id];
  const cached = aiCache[String(word.id)];
  const totalWrong = (p?.recognizeWrong ?? 0) + (p?.useWrong ?? 0);
  const totalCorrect = (p?.recognizeCorrect ?? 0) + (p?.useCorrect ?? 0);

  return (
    <Screen>
      <View style={{ gap: spacing.sm, marginBottom: spacing.lg }}>
        <Eyebrow>WORD {String(word.id).padStart(3, '0')}</Eyebrow>
        <EnglishText style={{ fontSize: 40, lineHeight: 50 }}>{word.word}</EnglishText>
        <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
          <Tag label={word.pos} />
          <Tag label={`L${word.level}`} />
          <Tag label={word.scene} tone="primary" />
        </View>
      </View>

      <Card>
        <Eyebrow style={{ marginBottom: spacing.sm }}>MEANING</Eyebrow>
        <Title>{word.meaning}</Title>
        {word.similar.length > 0 ? (
          <>
            <Divider />
            <Eyebrow style={{ marginBottom: spacing.sm }}>CONFUSABLE WITH</Eyebrow>
            <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
              {word.similar.map((s) => (
                <Tag key={s} label={s} tone="warning" />
              ))}
            </View>
            <Meta style={{ marginTop: spacing.sm }}>
              これらの語は文脈問題の選択肢に混ざります。違いを言えるようにしておきましょう。
            </Meta>
          </>
        ) : null}
      </Card>

      <Card style={{ marginTop: spacing.lg }}>
        <Eyebrow style={{ marginBottom: spacing.md }}>YOUR RECORD</Eyebrow>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Stat label="現在の段階" value={STAGE_LABEL[p?.stage ?? 'new']} />
        </View>
        <Divider />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Cell label="意味問題" value={`${p?.recognizeCorrect ?? 0}○ / ${p?.recognizeWrong ?? 0}×`} />
          <Cell label="文脈問題" value={`${p?.useCorrect ?? 0}○ / ${p?.useWrong ?? 0}×`} />
          <Cell label="連続正解" value={`${p?.streak ?? 0}`} />
        </View>
        {totalCorrect + totalWrong > 0 ? (
          <Meta style={{ marginTop: spacing.md }}>
            次の出題予定: {new Date(p!.dueAt).toLocaleDateString('ja-JP')}
          </Meta>
        ) : (
          <Meta style={{ marginTop: spacing.md }}>まだ出題されていません。</Meta>
        )}

        {p && p.errorTypes.length > 0 ? (
          <View style={{ marginTop: spacing.md, gap: spacing.xs }}>
            <Meta style={{ fontWeight: '700' }}>この語での間違い方</Meta>
            <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
              {[...new Set(p.errorTypes)].map((t) => (
                <Tag key={t} label={ERROR_TYPE_LABEL[t]} tone="warning" />
              ))}
            </View>
            {p.lastChoiceWrong ? <Meta>前回選んだ答え: {p.lastChoiceWrong}</Meta> : null}
          </View>
        ) : null}
      </Card>

      {cached ? (
        <Card style={{ marginTop: spacing.lg }}>
          <Eyebrow style={{ marginBottom: spacing.md }}>SAVED EXAMPLE</Eyebrow>
          <EnglishText style={{ fontSize: 16, lineHeight: 26 }}>{cached.example}</EnglishText>
          <Meta style={{ marginTop: 4 }}>{cached.exampleJa}</Meta>
          <Divider />
          <Meta style={{ fontWeight: '700', marginBottom: 4 }}>先生のメモ</Meta>
          <Body style={{ fontSize: 14 }}>{cached.howToTell}</Body>
        </Card>
      ) : (
        <Card tone="secondary" style={{ marginTop: spacing.lg }}>
          <Meta>この語を学習すると、あなた向けの例文と解説がここに保存されます。</Meta>
        </Card>
      )}

      <Button label="閉じる" variant="outline" onPress={() => router.back()} style={{ marginTop: spacing.xl }} />
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Meta>{label}</Meta>
      <Body style={{ fontWeight: '700' }}>{value}</Body>
    </View>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ alignItems: 'center', gap: 2, flex: 1 }}>
      <Num style={{ fontSize: 15 }}>{value}</Num>
      <Meta>{label}</Meta>
    </View>
  );
}
