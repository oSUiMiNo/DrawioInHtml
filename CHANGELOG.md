# Changelog

本拡張機能のすべての注目すべき変更はこのファイルに記録される。
フォーマットは [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) に準拠する。

## [0.1.0] - 2026-05-18

### Added
- 初期リリース。
- HTMLファイル内に `<script type="application/drawio+xml" data-diagram-id="...">XML</script>` 形式で埋め込まれた Drawio 図を、VSCode 上で静的 SVG として閲覧できる Custom Text Editor を提供。
- 各図カードに「✏️ 編集」ボタン。クリックで別タブに Drawio 公式エディタ（`embed.diagrams.net`）を開く。
- Drawio エディタで保存すると、元の HTML の該当 `<script>` の中身だけを書き換えてディスクに自動保存。
- 「🔍 拡大」ボタンによる図のフルスクリーン表示。
- 1つの HTML 内に複数の Drawio 図を埋め込み可能、それぞれ独立に編集可。
- `data-diagram-id` 欠落時の赤帯警告。
- ResizeObserver による container 幅変動への自動追随。
