-- =====================================================
-- 案件アーカイブ機能追加
-- =====================================================
--
-- このSQLは、projectsテーブルにアーカイブ状態を管理するカラムを追加します。
--
-- 実行手順:
-- 1. Supabase SQL Editorを開く
-- 2. このSQLを全てコピー&ペースト
-- 3. 「Run」をクリック
--

-- アーカイブフラグを追加
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;

-- アーカイブ日時を追加
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE;

-- インデックスを追加（検索パフォーマンス向上）
CREATE INDEX IF NOT EXISTS idx_projects_is_archived ON projects(is_archived);

-- 確認
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'projects'
  AND column_name IN ('is_archived', 'archived_at')
ORDER BY column_name;

SELECT '✅ アーカイブカラム追加完了' as result;
