/**
 * Web ビルドのルート HTML（expo-router）。
 *
 * 既定では <html lang="en"> が出力されるため、日本語環境の Chrome が
 * ページ全体を「英語→日本語」へ自動翻訳し、出題対象の英単語まで
 * 日本語に置き換えてしまう（schedule →「スケジュール」）。
 * UI の主言語は日本語であることを宣言し、翻訳自体も明示的に無効化する。
 */
import type { PropsWithChildren } from 'react';
import { ScrollViewStyleReset } from 'expo-router/html';

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="ja" translate="no">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        {/* 出題される英単語が機械翻訳されないようにする */}
        <meta name="google" content="notranslate" />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: BODY_BACKGROUND }} />
      </head>
      <body className="notranslate">{children}</body>
    </html>
  );
}

/** 背景色をテーマに合わせ、スクロール時の余白が白く光らないようにする */
const BODY_BACKGROUND = `
body { background-color: #FDFAFB; }
@media (prefers-color-scheme: dark) {
  body { background-color: #2B2226; }
}
`;
