/**
 * 設定（docs/spec.md §4.1 / §5.1）
 */
import { useState } from 'react';
import { Alert, Pressable, Switch, TextInput, View } from 'react-native';
import { Body, Button, Card, Divider, Eyebrow, Meta, Screen, Title } from '@/components/base';
import { useWords } from '@/context/WordsProvider';
import { radius, spacing } from '@/theme';
import { useTheme } from '@/theme/useTheme';

export default function SettingsScreen() {
  const { colors } = useTheme();
  const { settings, updateSettings, resetAll, overview } = useWords();
  const [apiKeyDraft, setApiKeyDraft] = useState(settings.apiKey ?? '');
  const [saved, setSaved] = useState(false);

  const envKeyPresent = !!process.env.EXPO_PUBLIC_GEMINI_API_KEY;

  return (
    <Screen>
      <View style={{ gap: spacing.xs, marginBottom: spacing.lg }}>
        <Eyebrow>SETTINGS</Eyebrow>
        <Title>設定</Title>
      </View>

      {/* 出題設定 */}
      <Card>
        <Eyebrow style={{ marginBottom: spacing.md }}>QUESTIONS</Eyebrow>

        <Body style={{ fontWeight: '700' }}>1セットの問題数</Body>
        <Meta style={{ marginBottom: spacing.md }}>通勤モードで出す問題数です。昼休みモードは自動で2問少なくなります。</Meta>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {([8, 10, 12] as const).map((n) => (
            <Choice
              key={n}
              label={`${n}問`}
              active={settings.questionCount === n}
              onPress={() => updateSettings({ questionCount: n })}
            />
          ))}
        </View>

        <Divider />

        <Body style={{ fontWeight: '700' }}>出題する難易度</Body>
        <Meta style={{ marginBottom: spacing.md }}>
          L1=TOEIC500点以下 / L2=500〜700点 / L3=700点以上。新しく出す語の範囲に効きます。
        </Meta>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {([1, 2, 3] as const).map((l) => {
            const active = settings.levels.includes(l);
            return (
              <Choice
                key={l}
                label={`L${l}`}
                active={active}
                onPress={() => {
                  const next = active ? settings.levels.filter((x) => x !== l) : [...settings.levels, l];
                  // 全部外すと出題できなくなるため、最低 1 つは残す
                  if (next.length === 0) return;
                  void updateSettings({ levels: next.sort() });
                }}
              />
            );
          })}
        </View>

        <Divider />

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Body style={{ fontWeight: '700' }}>触覚フィードバック</Body>
            <Meta>正誤のたびに軽く振動します。</Meta>
          </View>
          <Switch
            value={settings.haptics}
            onValueChange={(v) => updateSettings({ haptics: v })}
            trackColor={{ true: colors.primary, false: colors.border }}
            accessibilityLabel="触覚フィードバック"
          />
        </View>
      </Card>

      {/* Gemini API キー */}
      <Card style={{ marginTop: spacing.lg }}>
        <Eyebrow style={{ marginBottom: spacing.md }}>GEMINI API</Eyebrow>
        <Body style={{ fontWeight: '700' }}>APIキー</Body>
        <Meta style={{ marginBottom: spacing.md }}>
          解説・例文・総括の生成に使います。未設定でも学習はできますが、AIの解説は簡易表示になります。
        </Meta>

        <TextInput
          value={apiKeyDraft}
          onChangeText={(t) => {
            setApiKeyDraft(t);
            setSaved(false);
          }}
          placeholder={envKeyPresent ? '（.env のキーを使用中）' : 'AIza… から始まるキー'}
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          accessibilityLabel="Gemini APIキー"
          style={{
            height: 48,
            borderRadius: radius.tag,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.background,
            paddingHorizontal: spacing.md,
            color: colors.foreground,
          }}
        />

        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
          <Button
            label={saved ? '保存しました' : 'キーを保存'}
            size="md"
            style={{ flex: 1 }}
            onPress={async () => {
              await updateSettings({ apiKey: apiKeyDraft.trim() || null });
              setSaved(true);
            }}
          />
          <Button
            label="消去"
            size="md"
            variant="outline"
            onPress={async () => {
              setApiKeyDraft('');
              setSaved(false);
              await updateSettings({ apiKey: null });
            }}
          />
        </View>

        <Meta style={{ marginTop: spacing.md, color: colors.destructive }}>
          ※ ログイン・サーバーを持たない構成のため、キーは端末内に保存されます。学習・デモ用途を想定した設計です。
        </Meta>
      </Card>

      {/* データ */}
      <Card style={{ marginTop: spacing.lg }}>
        <Eyebrow style={{ marginBottom: spacing.md }}>DATA</Eyebrow>
        <Meta>
          学習データはすべて端末内に保存され、外部には送信されません（AIには問題の単語と回答のみを送ります）。
        </Meta>
        <Meta style={{ marginTop: spacing.sm }}>
          記録中: {overview.learned}語 / {overview.totalSessions}セット
        </Meta>

        <Button
          label="全データをリセット"
          variant="outline"
          size="md"
          style={{ marginTop: spacing.lg }}
          onPress={() =>
            Alert.alert(
              '全データをリセットしますか？',
              '学習の記録・推定スコア・保存済みの例文がすべて消えます。この操作は取り消せません。',
              [
                { text: 'キャンセル', style: 'cancel' },
                { text: 'リセットする', style: 'destructive', onPress: () => void resetAll() },
              ]
            )
          }
        />
      </Card>

      <Meta style={{ textAlign: 'center', marginTop: spacing.xl }}>700 Lab · TOEIC頻出300語</Meta>
    </Screen>
  );
}

function Choice({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      style={{
        flex: 1,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.pill,
        backgroundColor: active ? colors.primary : colors.card,
        borderWidth: 1,
        borderColor: active ? colors.primary : colors.border,
      }}
    >
      <Body style={{ fontWeight: '700', fontSize: 14, color: active ? colors.primaryOn : colors.muted }}>{label}</Body>
    </Pressable>
  );
}
