/**
 * 進捗（docs/spec.md §4.4 / §4.6 / §6.1）
 * 数字とビジュアルの両方で「どこまで来たか」を出す。計算式も隠さない。
 */
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Body, Button, Card, Eyebrow, Meta, Num, Screen, Tag, Title } from '@/components/base';
import { Donut, StatTile, TwoLayerBar, WeekBars } from '@/components/gauges';
import { errorTypeColors } from '@/components/FeedbackCard';
import { useWords } from '@/context/WordsProvider';
import { BASE_SCORE, LEVEL_WEIGHT, progressTo700 } from '@/domain/score';
import { ERROR_TYPES, last7Days, toPercentages, weakWords } from '@/domain/stats';
import { ERROR_TYPE_LABEL } from '@/types';
import { spacing, radius } from '@/theme';
import { useTheme } from '@/theme/useTheme';

export default function ProgressScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { words, progress, sessions, overview, breakdown, score, beginSession } = useWords();
  const [showFormula, setShowFormula] = useState(false);
  const [starting, setStarting] = useState(false);

  const week = useMemo(() => last7Days(sessions), [sessions]);
  const weak = useMemo(() => weakWords(words, progress, 5), [words, progress]);
  const typeColors = errorTypeColors(colors);

  const { stages, total } = overview;
  const recognizeRatio = (stages.recognized + stages.using + stages.mastered) / total;
  const useRatio = (stages.using + stages.mastered) / total;

  const slices = ERROR_TYPES.map((t) => ({
    value: breakdown.counts[t],
    color: typeColors[t],
    label: ERROR_TYPE_LABEL[t],
  }));
  // 内訳の合計が必ず 100% になるようにそろえる
  const percentages = toPercentages(ERROR_TYPES.map((t) => breakdown.counts[t]));

  return (
    <Screen>
      <View style={{ gap: spacing.xs, marginBottom: spacing.lg }}>
        <Eyebrow>PROGRESS</Eyebrow>
        <Title>数字で見る現在地</Title>
      </View>

      {/* KPI */}
      <View style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <StatTile value={`${overview.learned}`} unit={`/ ${total}`} label="学習済み語数" />
          <StatTile value={`${stages.mastered}`} unit="語" label="使いこなせる語" />
          <StatTile value={`${Math.round(overview.accuracy * 100)}`} unit="%" label="通算正解率" />
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <StatTile value={`${Math.round(overview.recognizeAccuracy * 100)}`} unit="%" label="意味問題の正解率" />
          <StatTile value={`${Math.round(overview.useAccuracy * 100)}`} unit="%" label="文脈問題の正解率" />
          <StatTile value={`${Math.round(overview.avgAnswerMs / 1000)}`} unit="秒" label="平均回答時間" />
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <StatTile value={`${overview.totalSessions}`} unit="回" label="学習セット" />
          <StatTile value={`${overview.streakDays}`} unit="日" label="連続学習" />
          <StatTile value={`${Math.round(overview.totalStudyMs / 60000)}`} unit="分" label="通算学習時間" />
        </View>
      </View>

      {/* 二軸マスタリー — このアプリの主張そのもの */}
      <Card style={{ marginTop: spacing.lg }}>
        <Eyebrow style={{ marginBottom: spacing.md }}>RECOGNIZE × USE</Eyebrow>
        <Body style={{ fontWeight: '700', marginBottom: spacing.sm }}>「分かる」と「使える」の差</Body>
        <TwoLayerBar recognizeRatio={recognizeRatio} useRatio={useRatio} height={10} />

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.md }}>
          <MatrixCell label="分かる（認識）" value={stages.recognized + stages.using + stages.mastered} color={colors.accent} />
          <MatrixCell label="使える（運用）" value={stages.using + stages.mastered} color={colors.primary} />
          <MatrixCell label="未学習" value={stages.new} color={colors.secondary} />
        </View>

        {stages.recognized > 0 ? (
          <View
            style={{
              marginTop: spacing.lg,
              backgroundColor: colors.secondary,
              borderRadius: radius.tag,
              padding: spacing.md,
              gap: spacing.sm,
            }}
          >
            <Body style={{ fontSize: 14 }}>
              <Num style={{ fontSize: 14, color: colors.primary }}>{stages.recognized}</Num>
              {' 語が「意味は分かるが、文脈では使えない」状態です。'}
            </Body>
            <Button
              label="この層から出題する"
              size="md"
              loading={starting}
              disabled={starting}
              onPress={async () => {
                setStarting(true);
                try {
                  const targets = words
                    .filter((w) => progress[w.id]?.stage === 'recognized')
                    .slice(0, 10)
                    .map((w) => w.id);
                  await beginSession('lunch', targets);
                  router.push('/session');
                } finally {
                  setStarting(false);
                }
              }}
            />
          </View>
        ) : null}
      </Card>

      {/* 誤答カルテ */}
      <Card style={{ marginTop: spacing.lg }}>
        <Eyebrow style={{ marginBottom: spacing.md }}>ERROR CHART</Eyebrow>
        <Body style={{ fontWeight: '700', marginBottom: spacing.md }}>誤答カルテ</Body>

        {breakdown.totalWrong === 0 ? (
          <Meta>まだ不正解がありません。学習を進めると、間違いの傾向がここに溜まります。</Meta>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
            <Donut slices={slices} />
            <View style={{ flex: 1, gap: spacing.sm }}>
              {ERROR_TYPES.map((t, i) => (
                <View key={t} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: typeColors[t] }} />
                  <Meta style={{ flex: 1 }}>{ERROR_TYPE_LABEL[t]}</Meta>
                  <Num style={{ fontSize: 12 }}>
                    {breakdown.counts[t]}（{percentages[i]}%）
                  </Num>
                </View>
              ))}
              {breakdown.unclassified > 0 ? <Meta>未分類 {breakdown.unclassified}件</Meta> : null}
            </View>
          </View>
        )}

        {breakdown.dominant ? (
          <View
            style={{
              marginTop: spacing.lg,
              backgroundColor: colors.secondary,
              borderRadius: radius.tag,
              padding: spacing.md,
            }}
          >
            <Body style={{ fontSize: 14 }}>
              あなたの弱点は<Body style={{ fontWeight: '700' }}>「{ERROR_TYPE_LABEL[breakdown.dominant]}」</Body>です。
              次のセットでは、この点が試される選択肢を優先して出します。
            </Body>
          </View>
        ) : null}
      </Card>

      {/* 直近 7 日 */}
      <Card style={{ marginTop: spacing.lg }}>
        <Eyebrow style={{ marginBottom: spacing.md }}>LAST 7 DAYS</Eyebrow>
        <WeekBars data={week} />
      </Card>

      {/* 要注意語 */}
      {weak.length > 0 ? (
        <Card style={{ marginTop: spacing.lg }}>
          <Eyebrow style={{ marginBottom: spacing.md }}>WATCH LIST</Eyebrow>
          <View style={{ gap: spacing.md }}>
            {weak.map(({ word, wrong }) => (
              <Pressable
                key={word.id}
                onPress={() => router.push(`/word/${word.id}`)}
                accessibilityRole="button"
                accessibilityLabel={`${word.word} の詳細を開く`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
              >
                <Body style={{ fontWeight: '700', flex: 1 }}>{word.word}</Body>
                <Meta style={{ flex: 1.2 }} numberOfLines={1}>
                  {word.meaning}
                </Meta>
                <Tag label={`${wrong}回ミス`} tone="warning" />
              </Pressable>
            ))}
          </View>
        </Card>
      ) : null}

      {/* スコアの計算式を公開する */}
      <Card tone="secondary" style={{ marginTop: spacing.lg }}>
        <Pressable
          onPress={() => setShowFormula((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel="推定スコアの計算方法を表示"
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <Body style={{ fontWeight: '700' }}>推定スコアの計算方法</Body>
          <Meta>{showFormula ? '閉じる' : 'ⓘ 見る'}</Meta>
        </Pressable>

        {showFormula ? (
          <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
            <Meta>
              推定スコア = {BASE_SCORE} + Σ(レベル重み × 段階係数) × 正解率補正
            </Meta>
            <Meta>
              レベル重み: L1 {LEVEL_WEIGHT[1]} / L2 {LEVEL_WEIGHT[2]} / L3 {LEVEL_WEIGHT[3]}
            </Meta>
            <Meta>段階係数: 未学習 0 / 分かる 0.4 / 使える 0.8 / 使いこなせる 1.0</Meta>
            <Meta>正解率補正: 0.9 + (直近50問の正解率 × 0.2)</Meta>
            <Meta>
              全300語を「使いこなせる」にすると約700点に届く設計です。現在 {Math.round(progressTo700(score) * 100)}%
              地点。
            </Meta>
            <Meta style={{ color: colors.destructive }}>
              ※ TOEIC公式スコアを保証するものではなく、本アプリ内の学習到達度の指標です。
            </Meta>
          </View>
        ) : null}
      </Card>
    </Screen>
  );
}

function MatrixCell({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={{ alignItems: 'center', gap: 4, flex: 1 }}>
      <View style={{ width: 20, height: 4, borderRadius: 2, backgroundColor: color }} />
      <Num style={{ fontSize: 22 }}>{value}</Num>
      <Meta style={{ textAlign: 'center' }}>{label}</Meta>
    </View>
  );
}
