-- =====================================================
-- v7: 外構・不動産タスクの追加
-- =====================================================
-- 実行日: 2025-12-17
-- 内容: 外構と不動産のデフォルトタスクを追加
-- =====================================================

-- 外構タスク（6項目）
INSERT INTO tasks (task_key, task_name, category, display_order, has_state, state_options, has_email_button) VALUES
  -- ①現地確認
  ('ext_site_check', '現地確認', '外構', 1, true, '["-", "確認済"]', false),

  -- ②プラン作成依頼
  ('ext_plan_request', 'プラン作成依頼', '外構', 2, true, '["-", "依頼済", "作成済"]', true),

  -- ③見積依頼
  ('ext_quotation', '見積依頼', '外構', 3, true, '["-", "依頼済", "回答済"]', true),

  -- ④契約
  ('ext_contract', '契約', '外構', 4, true, '["-", "契約済"]', false),

  -- ⑤着工打合せ
  ('ext_start_meeting', '着工打合せ', '外構', 5, true, '["-", "実施済"]', false),

  -- ⑥工事完了確認
  ('ext_completion', '工事完了確認', '外構', 6, true, '["-", "確認済"]', false)
ON CONFLICT (task_key) DO UPDATE SET
  task_name = EXCLUDED.task_name,
  display_order = EXCLUDED.display_order,
  has_state = EXCLUDED.has_state,
  state_options = EXCLUDED.state_options,
  has_email_button = EXCLUDED.has_email_button;

-- 不動産タスク（6項目）
INSERT INTO tasks (task_key, task_name, category, display_order, has_state, state_options, has_email_button) VALUES
  -- ①物件調査
  ('re_property_survey', '物件調査', '不動産', 1, true, '["-", "調査済"]', false),

  -- ②重要事項説明書作成
  ('re_important_doc', '重要事項説明書作成', '不動産', 2, true, '["-", "作成中", "作成済"]', false),

  -- ③契約書作成
  ('re_contract_doc', '契約書作成', '不動産', 3, true, '["-", "作成中", "作成済"]', false),

  -- ④決済準備
  ('re_settlement_prep', '決済準備', '不動産', 4, true, '["-", "準備中", "完了"]', false),

  -- ⑤金融機関連絡
  ('re_bank_contact', '金融機関連絡', '不動産', 5, true, '["-", "連絡済", "承認済"]', true),

  -- ⑥引渡し
  ('re_delivery', '引渡し', '不動産', 6, true, '["-", "完了"]', false)
ON CONFLICT (task_key) DO UPDATE SET
  task_name = EXCLUDED.task_name,
  display_order = EXCLUDED.display_order,
  has_state = EXCLUDED.has_state,
  state_options = EXCLUDED.state_options,
  has_email_button = EXCLUDED.has_email_button;

-- 確認クエリ
SELECT '=== 外構タスク一覧 ===' as section;
SELECT task_key, task_name, display_order, state_options
FROM tasks
WHERE category = '外構'
ORDER BY display_order;

SELECT '=== 不動産タスク一覧 ===' as section;
SELECT task_key, task_name, display_order, state_options
FROM tasks
WHERE category = '不動産'
ORDER BY display_order;

SELECT '✅ 外構・不動産タスク追加完了' as result;
