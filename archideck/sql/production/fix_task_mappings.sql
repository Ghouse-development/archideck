-- =====================================================
-- タスク-テンプレート マッピングを確認・修正
-- =====================================================

-- 1. 現在のマッピングを確認
SELECT * FROM task_template_mappings;

-- 2. evoltzタスクのマッピングを追加/更新
INSERT INTO task_template_mappings (task_key, template_id)
VALUES ('evoltz', 'senpaku')
ON CONFLICT (task_key) DO UPDATE SET template_id = 'senpaku';

-- 3. その他の主要なマッピングも確認・追加
INSERT INTO task_template_mappings (task_key, template_id)
VALUES
  ('ogura', 'ogura'),
  ('panasonic', 'panasonic'),
  ('ground_survey', 'ground_survey'),
  ('plumbing', 'plumbing')
ON CONFLICT (task_key) DO NOTHING;

-- 4. template_vendorsの確認
SELECT template_id, vendor_id, company, email
FROM template_vendors
WHERE template_id IN ('senpaku', 'evoltz', 'ogura', 'panasonic');

-- 5. tasksテーブルの確認
SELECT task_key, task_name
FROM tasks
WHERE task_key IN ('evoltz', 'ogura', 'panasonic', 'senpaku', 'ground_survey');

-- =====================================================
-- 完了！
-- =====================================================
