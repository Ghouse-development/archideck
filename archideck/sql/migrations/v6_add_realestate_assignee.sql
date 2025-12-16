-- =====================================================
-- v6: 不動産担当者カラムの追加
-- =====================================================
-- 実行日: 2025-12-16
-- 内容: projectsテーブルにrealestate_assigneeカラムを追加
-- =====================================================

-- realestate_assigneeカラムを追加（存在しない場合のみ）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'realestate_assignee'
  ) THEN
    ALTER TABLE projects ADD COLUMN realestate_assignee TEXT;
    RAISE NOTICE '✅ realestate_assigneeカラムを追加しました';
  ELSE
    RAISE NOTICE '⏭️ realestate_assigneeカラムは既に存在します';
  END IF;
END $$;

-- 確認
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'projects'
  AND column_name IN ('assigned_to', 'ic_assignee', 'exterior_assignee', 'realestate_assignee')
ORDER BY ordinal_position;

SELECT '✅ マイグレーション完了' as result;
