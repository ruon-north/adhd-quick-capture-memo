# ADHD傾向のある人向け個人メモPWAを完成させる

## Objective

思いつきを失う前にスマホで記録し、情報量に圧倒されず整理し、忘れたメモを自然に再発見できる個人用WebメモアプリのMVPを実装する。端末内完結のインストール可能なPWAとしてGitHub Pagesへ配信し、主要操作、自動テスト、オフライン動作を証拠として完成を判定する。

## Original Request

PlanモードでまとめたADHD傾向のある人向けメモアプリの計画を前提に、計画の内容を保ちながらGoalBuddy用の目標、完了条件、作業ボードを作成し、その後のGoalBuddy実行でMVPを完成させる。

## Intake Summary

- Input shape: `existing_plan`
- Audience: ADHD傾向があり、主に1台のスマホで思考・用事・リンクを個人的に記録する単独ユーザー
- Authority: `approved`
- Proof type: `test`
- Completion proof: GitHub Pages上のPWAでスマホ幅の受け入れシナリオが通り、自動テスト、永続化、オフライン利用、JSON復元がすべて確認される
- Goal oracle: 公開PWAに対するスマホ幅のブラウザwalkthroughと自動テスト結果
- Likely misfire: 一般的な多機能メモアプリを作り、即時入力、低刺激性、端末内プライバシーを損なう
- Blind spots considered: スマホでの起動障壁、未整理件数の圧迫感、端末故障時のデータ消失、平文バックアップ、オフライン利用、GitHub Pagesのbase path、PWA更新、アクセシビリティ
- Existing plan facts: 下記のMVP仕様、非対象、技術選定、受け入れ条件を保持する

## Goal Oracle

The oracle for this goal is:

`GitHub Pages上のHTTPS版をスマホ相当幅でPWAとして利用し、即時記録、再読み込み後の保持、1件ずつの整理、検索、再発見、JSON復元、オフライン操作を完走でき、VitestとPlaywrightを含む自動検証が合格する。`

PMは各Worker packageのreceiptをこのoracleへ照合する。計画、部分実装、ビルド成功だけでは完了しない。最終JudgeまたはPM監査が、現在の実装証拠と検証結果をoracleへ対応付け、`full_outcome_complete: true`を記録した場合のみ完了とする。

## Goal Kind

`existing_plan`

## Current Tranche

空の作業フォルダから、既存計画を検証して実装可能な境界へ落とし込み、次の安全な縦断スライスを連続して完成させる。

1. アプリ基盤、IndexedDBデータ層、即時記録、永続化、PWAオフライン基盤
2. 1件ずつの整理、編集・削除、検索、起動ごとの再発見
3. JSONバックアップ・置換復元、設定、プライバシー説明、アクセシビリティ
4. 自動テスト、GitHub Pages配信、公開環境の受け入れwalkthrough
5. original outcomeに対する最終監査

各packageの検証後、安全な次packageが残る限り同じ`/goal`実行内で継続する。

## Product Requirements

### 利用者と中心課題

- スマホ中心の個人利用とする。
- 思考、用事、URLを分類せず同じ受信箱へ記録する。
- 最優先課題は、分類や画面遷移の間に思いつきが消えること。
- 保存前にタイトル、種類、タグ、フォルダを要求しない。

### 画面構成

- 下部固定の「記録」「整理」「探す」3タブを提供する。
- 設定はヘッダーから開き、バックアップ、復元、プライバシー説明、PWA導入案内を置く。
- スマホ幅を第一のレイアウト基準とし、デスクトップでも使用可能にする。

### 記録

- 「記録」画面の単一入力欄から本文を1回の保存操作で受信箱へ追加する。
- 空白だけの本文は保存しない。
- HTTP/HTTPS URLを本文から認識し、外部リンクとして表示する。
- 外部URLからメタデータやプレビューを取得しない。
- 保存後は入力欄を空にして同じ画面に留まり、短時間の保存通知と「元に戻す」を表示する。
- 連続して複数メモを記録できる。

### 整理

- 状態は`inbox`、`kept`、`done`の3つだけとする。
- 新規メモは必ず`inbox`になる。
- 「整理」画面では受信箱を古い順に1件だけ表示する。
- 操作は「保管」「完了」「後回し」「編集」「削除」とする。
- 「後回し」は状態を変えず、現在の整理セッション内で次のメモへ進む。
- 受信箱件数は通常画面に表示せず、補助メニューを開いた時だけ確認可能にする。
- 削除前に確認し、削除直後は取り消し可能にする。

### 探索と再発見

- 「探す」画面で本文とURLを対象にした全文部分一致検索を提供する。
- 検索文字列はUnicode NFKC正規化と小文字化を行う。
- `inbox`、`kept`、`done`で絞り込み、結果は新しい順に表示する。
- 「記録」画面で、起動ごとに`kept`メモを1件再提示する。
- 候補が複数ある場合、直前に表示したメモを避ける。
- 一度に複数の再発見カードを表示しない。

### 保存とバックアップ

- ログインなしでIndexedDBへ保存する。
- `Memo`は`id`、`body`、`urls`、`status`、`createdAt`、`updatedAt`を持つ。
- アプリ設定にはデータスキーマバージョンと直前の再発見メモIDを保存する。
- 全データをJSONとして書き出せる。
- バックアップはスキーマバージョン、出力日時、全メモ、アプリ設定を含む。
- 復元前に形式を検証し、対象件数を表示して確認を取る。
- 復元は既存データとのマージではなく、確認後の全置換とする。
- 不正なJSONや非対応スキーマでは既存データを変更せず、理解可能なエラーを表示する。

### PWAと配信

- 初回読み込み後は、記録、整理、検索、編集、バックアップ操作をオフラインで利用可能にする。
- ホーム画面へインストール可能にする。
- GitHub Pagesのリポジトリ配下base pathでも資産とルーティングが壊れない構成にする。
- GitHub Actionsでテスト、ビルド、Pages配信を行う。

## Technology Defaults

- React
- TypeScript
- Vite
- Dexieを介したIndexedDB
- Vite PWA plugin
- CSS custom properties中心のローカルスタイル
- Vitest
- Testing Library
- Playwright
- GitHub ActionsおよびGitHub Pages

依存パッケージの正確な選定とバージョンは、最初のJudge/Scout検証で現在の互換性を確認してから固定する。外部UIサービス、CDN、外部フォント、アクセス解析は使用しない。

## Accessibility And Privacy

- WCAG 2.2 AAを目標とする。
- 操作領域は原則44px以上とし、十分なコントラストと明確なフォーカス表示を持たせる。
- 状態を色だけで伝えず、テキストまたはアイコンラベルを併用する。
- キーボード操作とスクリーンリーダー向けラベルを提供する。
- OSのダークモードと`prefers-reduced-motion`を尊重する。
- 不要なアニメーション、点滅、常時表示の件数、通知を使用しない。
- メモ内容を端末外へ送信しない。
- URLプレビュー通信、広告、アクセス解析、外部フォントを導入しない。
- 端末ロックがプライバシー境界であり、JSONバックアップが平文であることを明示する。

## MVP Non-Goals

- アカウント、複数ユーザー、クラウド同期、自動バックアップ
- 音声入力、他アプリからの共有受信
- 通知、期限、繰り返し、チェックリスト
- タグ、フォルダ、AI分類、要約、関連メモ推薦
- URLメタデータ取得
- 画像、添付ファイル、Markdown編集
- アプリ内PIN、生体認証、独自暗号化、バックアップ暗号化
- デスクトップ専用の高度な一括整理画面

## Completion Conditions

- 起動直後に画面遷移なしで入力欄が見え、本文入力後1回の操作で保存できる。
- 保存後は入力画面に留まり、連続入力と保存取り消しができる。
- 保存メモが再読み込みとブラウザ再起動後も保持される。
- オフライン状態でも記録、整理、検索、編集が成功する。
- 整理画面では常に1件だけ表示され、保管、完了、後回しが正しく動く。
- URL認識、日本語本文とURLの部分一致検索、状態絞り込みが動く。
- 起動ごとの再発見カードが候補のある範囲で直前の重複を避ける。
- JSON書き出し後、空のデータ状態へ復元して全メモと状態が一致する。
- 不正なバックアップを拒否し、既存データを保持する。
- Vitestでデータ操作、検索、再発見、バックアップ検証をカバーする。
- Playwrightで主要3画面、永続化、オフライン、キーボード操作、主要アクセシビリティを検証する。
- 自動アクセシビリティ検査に重大な違反がない。
- GitHub Pages上のHTTPS版がスマホ相当幅で動作し、PWAとしてインストール可能である。
- READMEまたは同等の利用者向け文書に、起動、テスト、配信、バックアップ、プライバシー境界が記載される。
- 最終JudgeまたはPM監査が上記証拠をoriginal outcomeへ対応付け、`full_outcome_complete: true`を記録する。

## Non-Negotiable Constraints

- 既存計画の即時入力、低刺激、再発見という優先順位を維持する。
- MVP non-goalsを無断で実装範囲へ戻さない。
- メモ保存時に分類を要求しない。
- メモ内容を外部サービスへ送信しない。
- 端末内データを壊し得る処理には検証、確認、失敗時の非破壊性を持たせる。
- 既存のユーザー変更を見つけた場合は取り消さず、共存させる。
- GitHub Pagesへの実配信に必要なリポジトリ権限や設定が不足する場合、配信以外の安全なローカル作業を継続し、該当taskだけを明示的にblockedにする。

## Stop Rule

Stop only when a final audit proves the full original outcome is complete.

計画検証、基盤作成、単一画面の完成、ローカルテスト成功だけでは停止しない。安全な次のWorker packageが残る限り進める。権限や認証情報が不足しても、影響するtaskだけをblockedにし、可能なローカル作業を継続する。

## Slice Sizing

Worker taskは、利用者にとって意味のある縦断機能単位で完了させる。小さな設定ファイルやhelper単体を独立taskにしない。各packageは許可ファイル、検証コマンド、停止条件を持ち、失敗時に戻せる境界にする。

## Canonical Board

Machine truth lives at:

`docs/goals/adhd-quick-capture-memo/state.yaml`

このcharterと`state.yaml`が競合する場合、task status、active task、receipt、verification freshness、completion truthは`state.yaml`を優先する。

## Run Command

```text
/goal Follow docs/goals/adhd-quick-capture-memo/goal.md.
```

## PM Loop

1. このcharterと`state.yaml`を読む。
2. GoalBuddy更新確認を行い、新版があれば非ブロッキングで通知する。
3. active taskだけを実行する。
4. assigneeに応じてScout、Judge、Worker、PMを使い、専用agentが使えなければPM fallbackで継続する。
5. 完了、blocked、判断ごとにcompact receiptをtaskへ書く。
6. Worker package後にoracleと検証結果を照合する。
7. 安全な次packageが残れば、phase、risk、ambiguity、rejected verification、final completionの境界を除いて継続する。
8. 最終監査のみがgoalを完了できる。
