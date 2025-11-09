-- =====================================================
-- IC担当者カラム追加マイグレーション
-- =====================================================
--
-- このSQLは、projectsテーブルにIC担当者の情報を追加します。
--
-- 実行手順:
-- 1. Supabase SQL Editorを開く
-- 2. このSQLを全てコピー&ペースト
-- 3. 「Run」をクリック
--

-- IC担当者名を追加（NULLを許可 = IC担当が未定の場合）
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS ic_assignee TEXT;

-- IC担当者IDを追加（外部キー制約付き）
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS ic_designer_id UUID REFERENCES designers(id) ON DELETE SET NULL;

-- 確認
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'projects'
  AND column_name IN ('ic_assignee', 'ic_designer_id')
ORDER BY column_name;

SELECT '✅ IC担当者カラム追加完了' as result;
