/**
 * 共通の下地コンポーネント（docs/spec.md §7.3）
 * 角丸は大きめ・ボタンはピル型・影は控えめ、を全画面で守るための土台。
 */
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type TextProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fonts, radius, shadow, spacing } from '@/theme';
import { useTheme } from '@/theme/useTheme';

// ---- 文字 ----

type TypoProps = TextProps & { children: React.ReactNode };

/** セクションの上に置く小さなラベル。Space Mono を字間広めで使う（構造の目印） */
export function Eyebrow({ style, children, ...rest }: TypoProps) {
  const { colors } = useTheme();
  return (
    <Text
      accessibilityRole="header"
      {...rest}
      style={[{ fontFamily: fonts.mono, fontSize: 11, letterSpacing: 2, color: colors.muted }, style]}
    >
      {children}
    </Text>
  );
}

/** 画面見出し（日本語は OS 標準） */
export function Title({ style, children, ...rest }: TypoProps) {
  const { colors } = useTheme();
  return (
    <Text {...rest} style={[{ fontSize: 22, fontWeight: '700', color: colors.foreground, letterSpacing: 0.3 }, style]}>
      {children}
    </Text>
  );
}

export function Body({ style, children, ...rest }: TypoProps) {
  const { colors } = useTheme();
  return (
    <Text {...rest} style={[{ fontSize: 15, lineHeight: 24, color: colors.foreground }, style]}>
      {children}
    </Text>
  );
}

export function Meta({ style, children, ...rest }: TypoProps) {
  const { colors } = useTheme();
  return (
    <Text {...rest} style={[{ fontSize: 12, lineHeight: 18, color: colors.muted }, style]}>
      {children}
    </Text>
  );
}

/**
 * 英単語・英文用。Fraunces がこのアプリのタイポグラフィの主役。
 *
 * ここに出るのは出題対象そのものなので、機械翻訳されると問題が成立しない。
 * Web プレビュー時のブラウザ翻訳は app/+html.tsx で無効化している。
 */
export function EnglishText({ style, children, ...rest }: TypoProps) {
  const { colors } = useTheme();
  return (
    <Text {...rest} style={[{ fontFamily: fonts.display, color: colors.foreground }, style]}>
      {children}
    </Text>
  );
}

/** 数値は必ず Space Mono（桁が揺れないので進捗が読み取りやすい） */
export function Num({ style, children, ...rest }: TypoProps) {
  const { colors } = useTheme();
  return (
    <Text {...rest} style={[{ fontFamily: fonts.monoBold, color: colors.foreground }, style]}>
      {children}
    </Text>
  );
}

// ---- 面 ----

export function Screen({
  children,
  scroll = true,
  style,
  contentStyle,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const inner = scroll ? (
    <ScrollView
      contentContainerStyle={[{ padding: spacing.lg, paddingBottom: spacing.xxl * 2 }, contentStyle]}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1, padding: spacing.lg }, contentStyle]}>{children}</View>
  );

  return (
    <SafeAreaView edges={['top']} style={[{ flex: 1, backgroundColor: colors.background }, style]}>
      {inner}
    </SafeAreaView>
  );
}

export function Card({
  children,
  style,
  tone = 'card',
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  tone?: 'card' | 'secondary' | 'band';
}) {
  const { colors } = useTheme();
  const background = tone === 'card' ? colors.card : tone === 'secondary' ? colors.secondary : colors.band;
  return (
    <View
      style={[
        {
          backgroundColor: background,
          borderRadius: radius.card,
          padding: spacing.lg,
          borderWidth: tone === 'card' ? 1 : 0,
          borderColor: colors.border,
        },
        tone === 'card' && shadow,
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** 縫い目風の破線枠。誤答カルテ（診断票）の見た目を作る */
export function StitchCard({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        {
          borderWidth: 1.5,
          borderStyle: 'dashed',
          borderColor: colors.border,
          borderRadius: radius.card,
          padding: spacing.lg,
          backgroundColor: colors.card,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

// ---- 操作 ----

type ButtonProps = PressableProps & {
  label: string;
  variant?: 'primary' | 'outline' | 'ghost';
  size?: 'lg' | 'md';
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({ label, variant = 'primary', size = 'lg', loading, style, ...rest }: ButtonProps) {
  const { colors } = useTheme();
  const filled = variant === 'primary';
  const height = size === 'lg' ? 56 : 44;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!rest.disabled || !!loading }}
      {...rest}
      style={({ pressed }) => [
        {
          height,
          borderRadius: radius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: spacing.sm,
          paddingHorizontal: spacing.xl,
          backgroundColor: filled ? colors.primary : variant === 'outline' ? 'transparent' : colors.secondary,
          borderWidth: variant === 'outline' ? 1.5 : 0,
          borderColor: colors.primary,
          opacity: rest.disabled ? 0.45 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading && <ActivityIndicator size="small" color={filled ? colors.primaryOn : colors.primary} />}
      <Text
        style={{
          fontSize: size === 'lg' ? 16 : 14,
          fontWeight: '700',
          color: filled ? colors.primaryOn : colors.primary,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** 小さなラベル片（レベル・段階・場面など） */
export function Tag({
  label,
  tone = 'neutral',
  style,
}: {
  label: string;
  tone?: 'neutral' | 'primary' | 'success' | 'warning';
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const map = {
    neutral: { bg: colors.secondary, fg: colors.muted },
    primary: { bg: colors.secondary, fg: colors.primary },
    success: { bg: colors.secondary, fg: colors.success },
    warning: { bg: colors.accent, fg: colors.destructive },
  } as const;
  const { bg, fg } = map[tone];

  return (
    <View style={[{ backgroundColor: bg, borderRadius: radius.tag, paddingHorizontal: 10, paddingVertical: 4 }, style]}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: fg }}>{label}</Text>
    </View>
  );
}

export function Divider() {
  const { colors } = useTheme();
  return <View style={{ height: 1, backgroundColor: colors.border, marginVertical: spacing.lg }} />;
}

export const gap = StyleSheet.create({
  xs: { gap: spacing.xs },
  sm: { gap: spacing.sm },
  md: { gap: spacing.md },
  lg: { gap: spacing.lg },
  xl: { gap: spacing.xl },
  row: { flexDirection: 'row', alignItems: 'center' },
});
