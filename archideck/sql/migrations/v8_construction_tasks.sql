-- =====================================================
-- v8: 工事タスクの追加
-- =====================================================
-- 実行日: 2025-12-17
-- 内容: 工事担当者用のタスクを追加
-- =====================================================

-- projectsテーブルにconstruction_assigneeカラムを追加（存在しない場合のみ）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'construction_assignee'
  ) THEN
    ALTER TABLE projects ADD COLUMN construction_assignee TEXT;
    RAISE NOTICE '✅ construction_assigneeカラムを追加しました';
  ELSE
    RAISE NOTICE '⏭️ construction_assigneeカラムは既に存在します';
  END IF;
END $$;

-- 工事タスク（8項目）
INSERT INTO tasks (task_key, task_name, category, display_order, has_state, state_options, has_email_button) VALUES
  -- ①着工準備
  ('con_preparation', '着工準備', '工事', 1, true, '["-", "準備中", "完了"]', false),

  -- ②地盤調査
  ('con_ground_survey', '地盤調査', '工事', 2, true, '["-", "依頼済", "完了"]', true),

  -- ③基礎工事
  ('con_foundation', '基礎工事', '工事', 3, true, '["-", "着工", "完了"]', false),

  -- ④上棟
  ('con_framework', '上棟', '工事', 4, true, '["-", "予定", "完了"]', false),

  -- ⑤中間検査
  ('con_mid_inspection', '中間検査', '工事', 5, true, '["-", "申請済", "合格"]', false),

  -- ⑥完了検査
  ('con_final_inspection', '完了検査', '工事', 6, true, '["-", "申請済", "合格"]', false),

  -- ⑦引渡し前確認
  ('con_pre_delivery', '引渡し前確認', '工事', 7, true, '["-", "実施済"]', false),

  -- ⑧引渡し完了
  ('con_delivery_done', '引渡し完了', '工事', 8, true, '["-", "完了"]', false)
ON CONFLICT (task_key) DO UPDATE SET
  task_name = EXCLUDED.task_name,
  display_order = EXCLUDED.display_order,
  has_state = EXCLUDED.has_state,
  state_options = EXCLUDED.state_options,
  has_email_button = EXCLUDED.has_email_button;

-- 確認クエリ
SELECT '=== 工事タスク一覧 ===' as section;
SELECT task_key, task_name, display_order, state_options
FROM tasks
WHERE category = '工事'
ORDER BY display_order;

SELECT '✅ 工事タスク追加完了' as result;
