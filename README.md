# いまメモ

ADHD傾向のある人が、思いつきを失う前にスマホで記録し、あとから1件ずつ整理できる個人用PWAです。メモは外部へ送信せず、ブラウザのIndexedDBへ保存します。

## 起動

Node.js 24以上を使用します。このWindows環境ではPowerShellの`npm` shimを避け、明示的に`npm.cmd`を実行します。

```powershell
& 'C:\Program Files\nodejs\npm.cmd' install
& 'C:\Program Files\nodejs\npm.cmd' run dev
```

## 検証

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- --run
& 'C:\Program Files\nodejs\npm.cmd' run build
& 'C:\Program Files\nodejs\npm.cmd' run test:e2e
& 'C:\Program Files\nodejs\npm.cmd' run test:e2e:pages
```

`test:e2e:pages`は公開予定の`/adhd-quick-capture-memo/`配下でPWAをbuildし、同じ利用シナリオを検証します。

## データとバックアップ

- メモと設定は端末内のIndexedDBに保存されます。
- 設定画面からversion付きJSONを書き出せます。
- 復元は内容を検証し、件数を表示して確認した後、現在の全データを置き換えます。
- JSONファイルは暗号化されません。安全な場所に保管してください。
- ブラウザデータの削除や端末故障に備え、定期的な書き出しを推奨します。

## プライバシー

アクセス解析、広告、外部フォント、URLプレビュー通信は使用しません。端末ロックが主なプライバシー境界です。

## GitHub Pages

`.github/workflows/pages.yml`はテストとbuild後に`dist/`をGitHub Pagesへ配信します。リポジトリのSettingsからPagesのSourceを「GitHub Actions」に設定してください。workflowはリポジトリ名をViteのbase pathとして渡します。

## PWA

初回オンライン読み込み後、アプリ資産はService Workerへ保存されます。ブラウザの共有またはメニューから「ホーム画面に追加」を選択できます。
