# ArchiDeck - Gハウス 設計業務管理システム

住宅案件管理とメール発注業務を統合した、設計士・インテリアコーディネーター・外構担当向けの業務効率化システムです。

## デプロイURL

**本番環境**: https://archideck.vercel.app/archideck/index.html

**GitHub**: https://github.com/Ghouse-development/archideck

---

## 主な機能

### 案件管理（5部構成カード）
- **業務内容**: 17種類のタスク進捗をチェックボックスで管理
- **タスク**: カスタムタスクの追加・期限管理
- **メモ欄**: IC・外構と共有できるメモ
- **議事録**: ファイルアップロード機能
- **引継書**: 引継ぎ情報の記録

### 担当者管理
- **設計担当**: 設計業務全般
- **IC担当**: インテリアコーディネート業務
- **外構担当**: 外構・エクステリア業務

### サイドバー機能
- 担当者別案件数表示
- 申請GO未完了数による色分け（青/黄/赤）
- タスク一覧ボタン

### その他機能
- 申請GO条件チェック
- メールテンプレート管理
- 業者情報管理
- kintone連携設定

---

## 技術スタック

- **フロントエンド**: HTML5, CSS3, Vanilla JavaScript
- **バックエンド**: Supabase（PostgreSQL + RLS）
- **認証**: Email/Password認証
- **ホスティング**: Vercel
- **バージョン管理**: Git + GitHub

---

## プロジェクト構成

```
archideck/
├── archideck/
│   ├── index.html              # メインアプリケーション
│   ├── README.md               # アプリ詳細ドキュメント
│   ├── UPDATE_V3_ARCHIDECK.md  # v3.0更新履歴
│   ├── sankou/                 # 参考資料
│   └── sql/
│       ├── migrations/         # マイグレーションSQL
│       └── production/         # 本番用SQL
├── .claude/                    # Claude Code設定
├── .vercel/                    # Vercel設定
├── .gitignore
├── CHANGELOG.md                # 開発履歴
└── README.md                   # このファイル
```

---

## セットアップ

### 1. Supabaseセットアップ
```bash
# 初期セットアップ
sql/production/supabase_all_in_one.sql を実行

# v3.0アップグレード
sql/migrations/v3_archideck_upgrade.sql を実行
```

### 2. ローカル開発
```bash
# リポジトリをクローン
git clone https://github.com/Ghouse-development/archideck.git
cd archideck

# ブラウザで開く
open archideck/index.html
```

### 3. デプロイ
```bash
vercel --prod
```

---

## バージョン履歴

- **v3.0.0** (2025-12-13): ArchiDeckへリブランディング、5部構成カードUI、外構担当機能
- **v2.0.0** (2025-11): カスタマイズ可能システム、業者管理機能
- **v1.0.0** (2025-10): 初期リリース

---

## ライセンス

© 2025 株式会社Gハウス. All rights reserved.

---

Generated with [Claude Code](https://claude.com/claude-code)
