/**
 * デザイントークン（docs/spec.md §7）
 * 参考: KouxaPlatform_2 / My Growth Lab — 桜色がかった白・ローズピンク・大きな角丸・真っ黒を使わない。
 */

export type Palette = {
  background: string;
  card: string;
  foreground: string;
  primary: string;
  primaryOn: string;
  band: string;
  bandOn: string;
  secondary: string;
  accent: string;
  muted: string;
  success: string;
  destructive: string;
  border: string;
  overlay: string;
};

export const lightPalette: Palette = {
  background: '#FDFAFB',
  card: '#FFFDFE',
  foreground: '#5A4A50',
  primary: '#D9607A',
  primaryOn: '#FFFFFF',
  band: '#7A3A4C',
  bandOn: '#FBEEF1',
  secondary: '#F7EDF0',
  accent: '#F0DCD4',
  muted: '#8E7A80',
  success: '#3F8F72',
  destructive: '#C0553C',
  border: '#EDE0E4',
  overlay: 'rgba(90,74,80,0.45)',
};

export const darkPalette: Palette = {
  background: '#2B2226',
  card: '#352A2F',
  foreground: '#F0E6E9',
  primary: '#E88099',
  primaryOn: '#2B2226',
  band: '#4A2E39',
  bandOn: '#F5E4E9',
  secondary: '#3E3137',
  accent: '#4A3A3C',
  muted: '#B4A0A6',
  success: '#6FBFA0',
  destructive: '#E0836C',
  border: '#4A3B41',
  overlay: 'rgba(0,0,0,0.55)',
};

/** フォントファミリ名。日本語は指定せず OS 標準に任せる（docs/spec.md §2 仕様補足） */
export const fonts = {
  /** 英単語・画面見出し */
  display: 'Fraunces_600SemiBold',
  displayBold: 'Fraunces_700Bold',
  /** 数値・スコア・ラベル */
  mono: 'SpaceMono_400Regular',
  monoBold: 'SpaceMono_700Bold',
} as const;

export const radius = {
  tag: 12,
  card: 24,
  sheet: 28,
  pill: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/** 影は控えめ（shadow-sm 相当）に統一する */
export const shadow = {
  shadowColor: '#7A3A4C',
  shadowOpacity: 0.08,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
} as const;

/** アニメーション時間（過度な演出はしない） */
export const duration = {
  fast: 200,
  normal: 300,
} as const;
