# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

700 Lab — TOEIC 700 点突破を目指す社会人向け英単語アプリ（Expo / React Native・オフライン完結・ログインなし）。タグラインは「今日の15分が、700点をつくる。」

**現状: Phase 0〜7 実装完了（GitHub 未アップロード）。** 支給された `doc/toeic_wordlist.xlsx`（TOEIC 頻出 300 語）を JSON 化し、出題・間隔反復・推定スコア・Gemini フィードバックまで一通り動作する。ユニットテストは 89 ケース全合格、型チェック通過、iOS バンドル成功。Web での通し動作確認（ホーム → 10 問 → 総括 → 進捗/単語帳/設定）と永続データの整合検証、および実 API キーでの Gemini 応答検証（誤答分析・例文生成）まで完了。残: セット総括（プロンプト C）の実応答確認、Expo Go 実機での確認（15 分計測・片手操作・ダークモード実表示・文字サイズ最大）、GitHub へのアップロード。詳細は `docs/task.md`、デザイン方針は `docs/spec.md` の §7。

このアプリは「3 つの課題」に答えることが存在意義であり、機能追加の判断は常にここに立ち返る。

| 課題 | 回答 |
|------|------|
| 「覚えた」と「使える」は別物 | 1 語を **認識 / 運用の 2 段階**で管理。意味の 4 択に正解しても `recognized` 止まりで、文脈穴埋めに正解して初めて `using` に昇格する |
| 間違えた原因が分からない | 不正解時に Gemini が **4 タイプ**（`confusion` / `pos` / `memory` / `context`）に分類し、理由と見分け方を先生の口調で返す |
| 続けても実感がない | **700 点メーター**（推定到達スコア）を算出し、セット終了時に差分（`450.0 → 450.9`）で提示する。計算式はアプリ内で公開する |

---

## テストに関する絶対ルール

**テストを合格させる目的で、テスト仕様書やテストコードを変更してはならない。**

- `docs/test_spec.md` に定義された入力・期待値は「正解の定義」である。テストが落ちたら、**修正するのは実装コード側**であり、テストの期待値ではない。
- テストを通すために期待値を実装の出力に合わせて書き換える、ケースを削除する、`skip` / `todo` / コメントアウトする等の行為は禁止。
- 期待値そのものが誤っている（仕様の認識違い）と判断した場合は、勝手に変更せず**必ずユーザーに確認を取り、合意の上で `docs/test_spec.md` を先に更新**してからテストコードを直す。
- テスト仕様の変更は「テストを通すため」ではなく「仕様が変わったため」にのみ行う。

---

## 実装フローの必須ルール

**1. 実装・テストの前に、必ず仕様書を確認する。**

- コードを書き始める前に、対象機能に関係する `docs/spec.md`（仕様）・`docs/test_spec.md`（テスト仕様）を読み、仕様に沿って実装・テストする。
- 仕様と異なる実装になりそうな場合は、勝手に進めず先にユーザーへ確認する。

**2. 仕様変更が発生したら、その都度 `docs/spec.md` に追記する。**

- 末尾の「変更履歴」に版数・日付・変更理由を残す。実装の都合で仕様を変えた場合も、理由（例: バンドルサイズ・実データの分布）まで書く。

**3. 実装が完了したら、必ず `docs/task.md` を更新する。**

- 完了したタスクを `⬜` から `✅` に変更する。着手中・新たに判明したタスクは追記する。
- 「実装完了」とは、コードが書かれ、関連するテストが通った状態を指す。テストが通っていないタスクを完了扱いにしない。
- 検証で見つけた不具合は「検証で見つけて直した不具合」表に、症状と対応をセットで記録する。

**4. 純粋ロジックは TDD（テスト先行）で実装する。** `docs/test_spec.md` のケースをテストコード化してから実装する。テスト名には仕様書の ID（`UT-SRS-01` など）を含めて対応を追えるようにする。

**5. 画面を変更したら、実際に動かして目で確認する。** ユニットテストだけでは、回答の取りこぼし・連打の二重登録・数値の不整合といった不具合は出ない（いずれも実走で発見された）。

---

## ドキュメント（信頼できる情報源）

実装に着手する前に必ず参照する。これらが仕様の正であり、コードはこれに従う。

| ファイル | 役割 |
|---------|------|
| `docs/spec.md` | 仕様書（要件・技術構成・データ設計・出題エンジン・Gemini プロンプト・スコア式・デザイン・変更履歴） |
| `docs/task.md` | タスク進捗（Phase 0〜7・見つけて直した不具合の記録） |
| `docs/test_spec.md` | テスト仕様（UT/MT のケースと期待値・受け入れ基準 AC-01〜15・実施結果） |
| `doc/app-spec.txt` | 支給された元要件（読み取り専用。変更しない） |
| `doc/toeic_wordlist.xlsx` | 支給された単語リスト（読み取り専用。変更しない） |

---

## 技術スタック

```
Expo SDK 54 / React Native 0.81（Expo Go 実行・ネイティブビルド不要）
├── 言語: TypeScript (strict)
├── ルーティング: expo-router（ファイルベース）
├── 状態管理: React Context（WordsProvider）
├── 永続化: @react-native-async-storage/async-storage（端末内のみ）
├── 描画: react-native-svg / react-native-reanimated
├── フォント: @expo-google-fonts（Fraunces / Space Mono）
└── AI: Gemini API (gemini-2.5-flash) を REST 直叩き（SDK なし）
```

テストは Jest + jest-expo。**バージョンは SDK 54 に合わせて固定する**（`jest-expo` / `babel-preset-expo` を最新の 57 系にすると起動しない）。

---

## アーキテクチャの要点

複数ファイルにまたがる「全体像」として把握しておくべき点。詳細は `docs/spec.md`。

- **単語マスタは生成物**。`src/data/toeic_wordlist.json` を直接編集しない。`doc/toeic_wordlist.xlsx` を正とし、`npm run build:wordlist` で再生成する（スクリプトが 300 件・レベル分布 L1:40/L2:110/L3:150・必須項目の欠損を検証して落ちる）。追加依存なしで xlsx を読むため、ZIP + inlineStr を自前でパースしている。

- **学習段階（`Stage`）がアプリの背骨**。`new → recognized → using → mastered`。認識問題の正解では `recognized` までしか上がらず、運用問題（文脈穴埋め）の正解で `using`、間隔をあけて 2 回連続正解で `mastered`。運用で落とすと 1 段階降格する。推定スコアの段階係数（0 / 0.4 / 0.8 / 1.0）もここに紐づく。

- **誤答分析が出題に還元される**（このアプリの差別化点）。`stats.dominantErrorType()` が出した最頻誤答タイプを `buildChoices()` に渡し、**ダミー選択肢の選び方そのものを変える**。`confusion` なら類似語、`pos` なら品詞違いの語を優先する。ここを切ると「誤答カルテ」がただの円グラフに退化するので、リファクタ時に依存を落とさない。
  - `similar` 列の 860 語のうち単語マスタ 300 語に実在するのは 101 語。そのため**日本語の意味を選ぶ `recognize` 形式では類似語ダミーが常には作れない**（順方向 + 逆引きで 109/300 語）。英単語を選ぶ `use` 形式は `similar` の文字列をそのまま使えるので全 300 語で成立する。混同対策の主戦場は `use` 形式。

- **回答はタップした瞬間に確定・永続化する**（`WordsProvider.answerQuestion`）。AI 応答の解決後に記録すると、解説を待たずに「次へ」を押した回答が消える。誤答タイプだけを `attachErrorType()` で後から追記する。**この順序を戻してはいけない。**

- **AI が落ちても学習フローは止めない**。`src/ai/service.ts` は例外を外に投げず、必ず `src/ai/fallback.ts` の値に変換する。タイムアウト 12 秒 → 1 回再試行 → フォールバック。オフラインでも出題・回答・進捗更新はすべて動作する。フォールバック文は品詞別テンプレートで組む（1 種類の固定文にすると "review the customer" のような不自然な英文になる）。

- **Gemini へは必ず構造化 JSON で要求する**（`responseMimeType` + `responseSchema`）。プロンプトには「先生ロール・口調・一般論禁止」の system 指示と、**この生徒の履歴**（当該語の正誤回数・直近の誤答タイプ・総学習語数・正解率・推定スコア）を必ず含める。これが無いと応答が一般論になり、要件を満たさない。

- **API 呼び出しは 1 セットあたり「1 + 誤答数 + 1」回に抑える**。無料枠が **1 日 20 リクエスト**しかないため、これは機能要件と同じ重みを持つ制約（`docs/spec.md` §5.2.1）。
  - セット開始時に `fetchWordBriefs` が全語ぶんの例文・勘所・見分け方・穴埋め文を**1 回で**取得する。
  - **正解時は API を呼ばない**。`WordBrief` の内容をそのまま表示する。
  - 不正解時だけ `fetchDiagnosis` を呼ぶ（選んだ答えは事前に分からないため）。
  - 「毎問フィードバックを取りにいく」形に戻すと、無料枠では 1 日 1.6 セットで AI が止まる。**この呼び分けを崩さないこと。**

- **Web は検証用の手段であり、成果物の実行環境は Expo Go**。ただし Web で開く場合、既定の HTML が `lang="en"` のため日本語環境の Chrome がページ全体を自動翻訳し、**出題対象の英単語まで日本語に置き換える**。`app/+html.tsx`（静的書き出し用）と `app/_layout.tsx`（実行時）の両方で `lang="ja"` + `notranslate` を指定している。外さないこと。

### スコープ外（v1 では実装しない）

ログイン / クラウド同期 / 課金、音声（TTS）・リスニング問題、単語の自作追加・編集、プッシュ通知。

---

## ディレクトリ構成

```
app/                    expo-router の画面
  (tabs)/               ホーム / 進捗 / 単語帳 / 設定
  session/              出題（index）・総括（summary）
  word/[id].tsx         単語詳細
  +html.tsx             Web のルート HTML（翻訳無効化）
src/
  data/                 単語マスタ 300 語（xlsx からの生成物）
  domain/               純粋関数。テストの主対象
    srs.ts              間隔反復・stage 遷移
    selectQuestions.ts  出題選定（復習 4 / 運用 3 / 新規 3）
    buildChoices.ts     選択肢生成（誤答タイプで戦略が変わる）
    score.ts            700 点メーター
    stats.ts            KPI・誤答カルテ・百分率の正規化
  ai/                   gemini.ts（通信）/ prompts.ts / schemas.ts / fallback.ts / service.ts
  storage/              AsyncStorage ラッパ（破損データでも初期値に落とす）
  context/              WordsProvider（唯一の状態の持ち主）
  components/           base.tsx（共通 UI）/ gauges.tsx（二層ゲージ）/ FeedbackCard.tsx（誤答カルテ）
  theme/                デザイントークン
scripts/build-wordlist.mjs   xlsx → JSON 変換
```

---

## 開発コマンド

```bash
npm start                # Expo 開発サーバー（Expo Go で QR を読み取る）
npm run typecheck        # tsc --noEmit
npm test                 # Jest（89 ケース）
npm run build:wordlist   # doc/toeic_wordlist.xlsx → src/data/toeic_wordlist.json

# 単一テストファイル
npx jest src/domain/__tests__/srs.test.ts
# テスト名（仕様書 ID）で絞り込み
npx jest -t "UT-SRS-01"

# Web で挙動を確認する（検証用）
npx expo start --web
# バンドルが通るかの確認（実機なしで壊れを検出できる）
npx expo export --platform ios --output-dir /tmp/export-check
```

---

## 環境変数

`.env` に設定する（`.env.example` を参照）。

| 変数 | 用途 |
|------|------|
| `EXPO_PUBLIC_GEMINI_API_KEY` | Gemini API キー。未設定でも学習は動作し、AI 部分がフォールバック表示になる。**無料枠は 1 日 20 リクエスト**なので、消費回数の設計（上記）を崩さないこと |

キーはアプリの「設定」画面からも入力でき、その場合は端末内 `AsyncStorage` に保存される（`settings.apiKey` が `.env` より優先）。**ログイン・サーバーを持たない構成のため、キーは必ず端末側に置かれる。** 学習・デモ用途を想定した設計であることを設定画面にも明記している。`.env` は `.gitignore` 済みなので、キーをコミットしないこと。
