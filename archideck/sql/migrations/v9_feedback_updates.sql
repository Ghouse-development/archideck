-- =====================================================
-- v9: フィードバック対応アップデート
-- 1. evoltzタスクのメール送信ボタン有効化
-- 2. 営業担当カラムの追加
-- 3. タイルプレゼン作成に「無」オプション追加
-- =====================================================

-- 1. evoltzタスクにメールボタンを有効化
UPDATE tasks
SET has_email_button = true
WHERE task_key = 'evoltz';

-- 2. 営業担当カラムを追加
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'sales_assignee'
  ) THEN
    ALTER TABLE projects ADD COLUMN sales_assignee TEXT;
  END IF;
END $$;

-- 3. タイルプレゼン作成に「無」オプションを追加
UPDATE tasks
SET state_options = '["-", "無", "作成済"]'
WHERE task_key = 'ic_tile_pres';

-- 確認クエリ
SELECT 'evoltzメールボタン' as item, task_key, has_email_button::text as value
FROM tasks
WHERE task_key = 'evoltz'
UNION ALL
SELECT 'sales_assigneeカラム' as item, column_name, data_type
FROM information_schema.columns
WHERE table_name = 'projects' AND column_name = 'sales_assignee'
UNION ALL
SELECT 'タイルプレゼン' as item, task_key, state_options::text as value
FROM tasks
WHERE task_key = 'ic_tile_pres';

SELECT '=== v9 フィードバック対応完了 ===' as result;
