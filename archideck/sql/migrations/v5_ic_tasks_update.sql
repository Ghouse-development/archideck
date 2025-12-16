-- =====================================================
-- IC業務内容の刷新マイグレーション v5.0
-- 既存の8項目から新しい21項目へ変更
-- =====================================================

-- ステップ0: tasksテーブルにhas_email_buttonカラムを追加（存在しない場合）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'has_email_button'
  ) THEN
    ALTER TABLE tasks ADD COLUMN has_email_button BOOLEAN DEFAULT true;
  END IF;
END $$;

-- ステップ1: 既存ICタスクを削除（紐づけも自動削除される）
DELETE FROM tasks WHERE category = 'IC';

-- ステップ2: 新しいIC業者カテゴリを追加
INSERT INTO vendor_categories (name, display_order) VALUES
  ('キッチン', 10),
  ('お風呂', 11),
  ('洗面', 12),
  ('トイレ', 13),
  ('照明', 14),
  ('建具', 15),
  ('カーテン', 16),
  ('造作', 17),
  ('家具', 18)
ON CONFLICT (name) DO NOTHING;

-- ステップ3: 新しいICタスク（21項目）を挿入
INSERT INTO tasks (task_key, task_name, category, display_order, has_state, state_options, has_email_button) VALUES
  -- ①資金計画・引継書確認
  ('ic_funding_check', '資金計画・引継書確認', 'IC', 1, true, '["-", "確認済"]', false),

  -- ②キッチン・カップボード（メーカー選択、メール機能あり）
  ('ic_kitchen', 'キッチン・カップボード', 'IC', 2, true, '["-", "GRAFTECT", "オリジナル", "Lixil", "Panasonic", "Takarastandard"]', true),

  -- ③お風呂（メーカー選択、メール機能あり）
  ('ic_bath', 'お風呂', 'IC', 3, true, '["-", "Lixil", "Panasonic", "Takarastandard"]', true),

  -- ④洗面（メーカー選択、メール機能あり）
  ('ic_washroom', '洗面', 'IC', 4, true, '["-", "TOTO", "AICA", "Lixil", "Panasonic", "Takarastandard"]', true),

  -- ⑤トイレ（メーカー選択、メール機能あり）
  ('ic_toilet', 'トイレ', 'IC', 5, true, '["-", "TOTO", "Lixil", "Panasonic"]', true),

  -- ⑥照明プラン（メーカー選択、メール機能あり）
  ('ic_lighting', '照明プラン', 'IC', 6, true, '["-", "ODELIC", "DAIKO", "KOIZUMI", "Panasonic"]', true),

  -- ⑦仕様書作成
  ('ic_spec_doc', '仕様書作成', 'IC', 7, true, '["-", "作成済"]', false),

  -- ⑧長期資料送付
  ('ic_longterm_doc', '長期資料送付', 'IC', 8, true, '["-", "送付済"]', false),

  -- ⑨実施図
  ('ic_execution_drawing', '実施図', 'IC', 9, true, '["-", "修正依頼済", "図面チェック済"]', false),

  -- ⑩外装プレゼン作成
  ('ic_exterior_pres', '外装プレゼン作成', 'IC', 10, true, '["-", "作成済"]', false),

  -- ⑪内装プレゼン作成
  ('ic_interior_pres', '内装プレゼン作成', 'IC', 11, true, '["-", "作成済"]', false),

  -- ⑫建具プレゼン依頼（メール機能あり）
  ('ic_tategu', '建具プレゼン依頼', 'IC', 12, true, '["-", "依頼済", "保存済"]', true),

  -- ⑬タイルプレゼン作成
  ('ic_tile_pres', 'タイルプレゼン作成', 'IC', 13, true, '["-", "作成済"]', false),

  -- ⑭外構への打合せ依頼
  ('ic_exterior_meeting', '外構への打合せ依頼', 'IC', 14, true, '["-", "依頼済"]', false),

  -- ⑮カーテン紹介（メール機能あり）
  ('ic_curtain', 'カーテン紹介', 'IC', 15, true, '["-", "依頼済"]', true),

  -- ⑯造作業者紹介（メール機能あり）
  ('ic_zousaku', '造作業者紹介', 'IC', 16, true, '["-", "無し", "依頼済"]', true),

  -- ⑰家具見積依頼（メール機能あり）
  ('ic_furniture', '家具見積依頼', 'IC', 17, true, '["-", "無し", "依頼済"]', true),

  -- ⑱確定図チェックリスト
  ('ic_final_checklist', '確定図チェックリスト', 'IC', 18, true, '["-", "実施済"]', false),

  -- ⑲OP見積チェック
  ('ic_op_check', 'OP見積チェック', 'IC', 19, true, '["-", "依頼済", "保存済"]', false),

  -- ⑳会議後確認事項送付
  ('ic_meeting_followup', '会議後確認事項送付', 'IC', 20, true, '["-", "送付済"]', false),

  -- ㉑確定図承認
  ('ic_final_approval', '確定図承認', 'IC', 21, true, '["-", "依頼中", "ダンドリワーク保存済"]', false)
ON CONFLICT (task_key) DO UPDATE SET
  task_name = EXCLUDED.task_name,
  display_order = EXCLUDED.display_order,
  has_state = EXCLUDED.has_state,
  state_options = EXCLUDED.state_options,
  has_email_button = EXCLUDED.has_email_button;

-- ステップ4: メーカー別業者を追加（メール機能用）

-- キッチンメーカー業者
DO $$
DECLARE
  cat_id UUID;
BEGIN
  SELECT id INTO cat_id FROM vendor_categories WHERE name = 'キッチン';

  INSERT INTO vendors_v2 (company, contact, email, category_id, subject_format, template_text, has_special_content)
  VALUES
    ('GRAFTECT', 'ご担当者様', '', cat_id, '{customerName}様邸 キッチン・カップボードプラン依頼', 'GRAFTECT
ご担当者様

いつもお世話になっております。
キッチン・カップボードプランのご依頼です。

【お客様名】{customerName}
【期日】{dueDate}', false),
    ('Lixilキッチン', 'ご担当者様', '', cat_id, '{customerName}様邸 キッチン・カップボードプラン依頼', 'Lixil
ご担当者様

いつもお世話になっております。
キッチン・カップボードプランのご依頼です。

【お客様名】{customerName}
【期日】{dueDate}', false),
    ('Panasonicキッチン', 'ご担当者様', '', cat_id, '{customerName}様邸 キッチン・カップボードプラン依頼', 'Panasonic
ご担当者様

いつもお世話になっております。
キッチン・カップボードプランのご依頼です。

【お客様名】{customerName}
【期日】{dueDate}', false),
    ('タカラスタンダードキッチン', 'ご担当者様', '', cat_id, '{customerName}様邸 キッチン・カップボードプラン依頼', 'タカラスタンダード
ご担当者様

いつもお世話になっております。
キッチン・カップボードプランのご依頼です。

【お客様名】{customerName}
【期日】{dueDate}', false)
  ON CONFLICT DO NOTHING;
END $$;

-- お風呂メーカー業者
DO $$
DECLARE
  cat_id UUID;
BEGIN
  SELECT id INTO cat_id FROM vendor_categories WHERE name = 'お風呂';

  INSERT INTO vendors_v2 (company, contact, email, category_id, subject_format, template_text, has_special_content)
  VALUES
    ('Lixilお風呂', 'ご担当者様', '', cat_id, '{customerName}様邸 浴室プラン依頼', 'Lixil
ご担当者様

いつもお世話になっております。
浴室プランのご依頼です。

【お客様名】{customerName}
【期日】{dueDate}', false),
    ('Panasonicお風呂', 'ご担当者様', '', cat_id, '{customerName}様邸 浴室プラン依頼', 'Panasonic
ご担当者様

いつもお世話になっております。
浴室プランのご依頼です。

【お客様名】{customerName}
【期日】{dueDate}', false),
    ('タカラスタンダードお風呂', 'ご担当者様', '', cat_id, '{customerName}様邸 浴室プラン依頼', 'タカラスタンダード
ご担当者様

いつもお世話になっております。
浴室プランのご依頼です。

【お客様名】{customerName}
【期日】{dueDate}', false)
  ON CONFLICT DO NOTHING;
END $$;

-- 洗面メーカー業者
DO $$
DECLARE
  cat_id UUID;
BEGIN
  SELECT id INTO cat_id FROM vendor_categories WHERE name = '洗面';

  INSERT INTO vendors_v2 (company, contact, email, category_id, subject_format, template_text, has_special_content)
  VALUES
    ('TOTO洗面', 'ご担当者様', '', cat_id, '{customerName}様邸 洗面プラン依頼', 'TOTO
ご担当者様

いつもお世話になっております。
洗面プランのご依頼です。

【お客様名】{customerName}
【期日】{dueDate}', false),
    ('AICA洗面', 'ご担当者様', '', cat_id, '{customerName}様邸 洗面プラン依頼', 'AICA
ご担当者様

いつもお世話になっております。
洗面プランのご依頼です。

【お客様名】{customerName}
【期日】{dueDate}', false),
    ('Lixil洗面', 'ご担当者様', '', cat_id, '{customerName}様邸 洗面プラン依頼', 'Lixil
ご担当者様

いつもお世話になっております。
洗面プランのご依頼です。

【お客様名】{customerName}
【期日】{dueDate}', false),
    ('Panasonic洗面', 'ご担当者様', '', cat_id, '{customerName}様邸 洗面プラン依頼', 'Panasonic
ご担当者様

いつもお世話になっております。
洗面プランのご依頼です。

【お客様名】{customerName}
【期日】{dueDate}', false),
    ('タカラスタンダード洗面', 'ご担当者様', '', cat_id, '{customerName}様邸 洗面プラン依頼', 'タカラスタンダード
ご担当者様

いつもお世話になっております。
洗面プランのご依頼です。

【お客様名】{customerName}
【期日】{dueDate}', false)
  ON CONFLICT DO NOTHING;
END $$;

-- トイレメーカー業者
DO $$
DECLARE
  cat_id UUID;
BEGIN
  SELECT id INTO cat_id FROM vendor_categories WHERE name = 'トイレ';

  INSERT INTO vendors_v2 (company, contact, email, category_id, subject_format, template_text, has_special_content)
  VALUES
    ('TOTOトイレ', 'ご担当者様', '', cat_id, '{customerName}様邸 トイレプラン依頼', 'TOTO
ご担当者様

いつもお世話になっております。
トイレプランのご依頼です。

【お客様名】{customerName}
【期日】{dueDate}', false),
    ('Lixilトイレ', 'ご担当者様', '', cat_id, '{customerName}様邸 トイレプラン依頼', 'Lixil
ご担当者様

いつもお世話になっております。
トイレプランのご依頼です。

【お客様名】{customerName}
【期日】{dueDate}', false),
    ('Panasonicトイレ', 'ご担当者様', '', cat_id, '{customerName}様邸 トイレプラン依頼', 'Panasonic
ご担当者様

いつもお世話になっております。
トイレプランのご依頼です。

【お客様名】{customerName}
【期日】{dueDate}', false)
  ON CONFLICT DO NOTHING;
END $$;

-- 照明メーカー業者
DO $$
DECLARE
  cat_id UUID;
BEGIN
  SELECT id INTO cat_id FROM vendor_categories WHERE name = '照明';

  INSERT INTO vendors_v2 (company, contact, email, category_id, subject_format, template_text, has_special_content)
  VALUES
    ('ODELIC', 'ご担当者様', '', cat_id, '{customerName}様邸 照明プラン依頼', 'ODELIC
ご担当者様

いつもお世話になっております。
照明プランのご依頼です。

【お客様名】{customerName}
【期日】{dueDate}', false),
    ('DAIKO', 'ご担当者様', '', cat_id, '{customerName}様邸 照明プラン依頼', 'DAIKO
ご担当者様

いつもお世話になっております。
照明プランのご依頼です。

【お客様名】{customerName}
【期日】{dueDate}', false),
    ('KOIZUMI', 'ご担当者様', '', cat_id, '{customerName}様邸 照明プラン依頼', 'KOIZUMI
ご担当者様

いつもお世話になっております。
照明プランのご依頼です。

【お客様名】{customerName}
【期日】{dueDate}', false),
    ('Panasonic照明', 'ご担当者様', '', cat_id, '{customerName}様邸 照明プラン依頼', 'Panasonic
ご担当者様

いつもお世話になっております。
照明プランのご依頼です。

【お客様名】{customerName}
【期日】{dueDate}', false)
  ON CONFLICT DO NOTHING;
END $$;

-- 建具業者
DO $$
DECLARE
  cat_id UUID;
BEGIN
  SELECT id INTO cat_id FROM vendor_categories WHERE name = '建具';

  INSERT INTO vendors_v2 (company, contact, email, category_id, subject_format, template_text, has_special_content)
  VALUES
    ('建具業者', 'ご担当者様', '', cat_id, '{customerName}様邸 建具プレゼン依頼', '建具業者
ご担当者様

いつもお世話になっております。
建具プレゼンのご依頼です。

【お客様名】{customerName}
【期日】{dueDate}', false)
  ON CONFLICT DO NOTHING;
END $$;

-- カーテン業者
DO $$
DECLARE
  cat_id UUID;
BEGIN
  SELECT id INTO cat_id FROM vendor_categories WHERE name = 'カーテン';

  INSERT INTO vendors_v2 (company, contact, email, category_id, subject_format, template_text, has_special_content)
  VALUES
    ('カーテン業者', 'ご担当者様', '', cat_id, '{customerName}様邸 カーテン紹介依頼', 'カーテン業者
ご担当者様

いつもお世話になっております。
カーテン紹介のご依頼です。

【お客様名】{customerName}
【期日】{dueDate}', false)
  ON CONFLICT DO NOTHING;
END $$;

-- 造作業者
DO $$
DECLARE
  cat_id UUID;
BEGIN
  SELECT id INTO cat_id FROM vendor_categories WHERE name = '造作';

  INSERT INTO vendors_v2 (company, contact, email, category_id, subject_format, template_text, has_special_content)
  VALUES
    ('造作業者', 'ご担当者様', '', cat_id, '{customerName}様邸 造作業者紹介依頼', '造作業者
ご担当者様

いつもお世話になっております。
造作業者紹介のご依頼です。

【お客様名】{customerName}
【期日】{dueDate}', false)
  ON CONFLICT DO NOTHING;
END $$;

-- 家具業者
DO $$
DECLARE
  cat_id UUID;
BEGIN
  SELECT id INTO cat_id FROM vendor_categories WHERE name = '家具';

  INSERT INTO vendors_v2 (company, contact, email, category_id, subject_format, template_text, has_special_content)
  VALUES
    ('家具業者', 'ご担当者様', '', cat_id, '{customerName}様邸 家具見積依頼', '家具業者
ご担当者様

いつもお世話になっております。
家具見積のご依頼です。

【お客様名】{customerName}
【期日】{dueDate}', false)
  ON CONFLICT DO NOTHING;
END $$;

-- ステップ5: タスク-業者紐づけを追加
-- キッチン・カップボードタスクにキッチン業者を紐づけ
DO $$
DECLARE
  task_id UUID;
  v_id UUID;
BEGIN
  SELECT id INTO task_id FROM tasks WHERE task_key = 'ic_kitchen';

  FOR v_id IN SELECT id FROM vendors_v2 WHERE category_id = (SELECT id FROM vendor_categories WHERE name = 'キッチン')
  LOOP
    INSERT INTO task_vendor_mappings_v2 (task_id, vendor_id) VALUES (task_id, v_id) ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- お風呂タスクにお風呂業者を紐づけ
DO $$
DECLARE
  task_id UUID;
  v_id UUID;
BEGIN
  SELECT id INTO task_id FROM tasks WHERE task_key = 'ic_bath';

  FOR v_id IN SELECT id FROM vendors_v2 WHERE category_id = (SELECT id FROM vendor_categories WHERE name = 'お風呂')
  LOOP
    INSERT INTO task_vendor_mappings_v2 (task_id, vendor_id) VALUES (task_id, v_id) ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- 洗面タスクに洗面業者を紐づけ
DO $$
DECLARE
  task_id UUID;
  v_id UUID;
BEGIN
  SELECT id INTO task_id FROM tasks WHERE task_key = 'ic_washroom';

  FOR v_id IN SELECT id FROM vendors_v2 WHERE category_id = (SELECT id FROM vendor_categories WHERE name = '洗面')
  LOOP
    INSERT INTO task_vendor_mappings_v2 (task_id, vendor_id) VALUES (task_id, v_id) ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- トイレタスクにトイレ業者を紐づけ
DO $$
DECLARE
  task_id UUID;
  v_id UUID;
BEGIN
  SELECT id INTO task_id FROM tasks WHERE task_key = 'ic_toilet';

  FOR v_id IN SELECT id FROM vendors_v2 WHERE category_id = (SELECT id FROM vendor_categories WHERE name = 'トイレ')
  LOOP
    INSERT INTO task_vendor_mappings_v2 (task_id, vendor_id) VALUES (task_id, v_id) ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- 照明プランタスクに照明業者を紐づけ
DO $$
DECLARE
  task_id UUID;
  v_id UUID;
BEGIN
  SELECT id INTO task_id FROM tasks WHERE task_key = 'ic_lighting';

  FOR v_id IN SELECT id FROM vendors_v2 WHERE category_id = (SELECT id FROM vendor_categories WHERE name = '照明')
  LOOP
    INSERT INTO task_vendor_mappings_v2 (task_id, vendor_id) VALUES (task_id, v_id) ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- 建具プレゼン依頼タスクに建具業者を紐づけ
DO $$
DECLARE
  task_id UUID;
  v_id UUID;
BEGIN
  SELECT id INTO task_id FROM tasks WHERE task_key = 'ic_tategu';

  FOR v_id IN SELECT id FROM vendors_v2 WHERE category_id = (SELECT id FROM vendor_categories WHERE name = '建具')
  LOOP
    INSERT INTO task_vendor_mappings_v2 (task_id, vendor_id) VALUES (task_id, v_id) ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- カーテン紹介タスクにカーテン業者を紐づけ
DO $$
DECLARE
  task_id UUID;
  v_id UUID;
BEGIN
  SELECT id INTO task_id FROM tasks WHERE task_key = 'ic_curtain';

  FOR v_id IN SELECT id FROM vendors_v2 WHERE category_id = (SELECT id FROM vendor_categories WHERE name = 'カーテン')
  LOOP
    INSERT INTO task_vendor_mappings_v2 (task_id, vendor_id) VALUES (task_id, v_id) ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- 造作業者紹介タスクに造作業者を紐づけ
DO $$
DECLARE
  task_id UUID;
  v_id UUID;
BEGIN
  SELECT id INTO task_id FROM tasks WHERE task_key = 'ic_zousaku';

  FOR v_id IN SELECT id FROM vendors_v2 WHERE category_id = (SELECT id FROM vendor_categories WHERE name = '造作')
  LOOP
    INSERT INTO task_vendor_mappings_v2 (task_id, vendor_id) VALUES (task_id, v_id) ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- 家具見積依頼タスクに家具業者を紐づけ
DO $$
DECLARE
  task_id UUID;
  v_id UUID;
BEGIN
  SELECT id INTO task_id FROM tasks WHERE task_key = 'ic_furniture';

  FOR v_id IN SELECT id FROM vendors_v2 WHERE category_id = (SELECT id FROM vendor_categories WHERE name = '家具')
  LOOP
    INSERT INTO task_vendor_mappings_v2 (task_id, vendor_id) VALUES (task_id, v_id) ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- 確認クエリ
SELECT '=== 新ICタスク一覧 ===' as section;
SELECT task_key, task_name, display_order, has_state, state_options, has_email_button
FROM tasks
WHERE category = 'IC'
ORDER BY display_order;

SELECT '=== 新業者カテゴリ ===' as section;
SELECT name, display_order FROM vendor_categories ORDER BY display_order;

SELECT '=== タスク-業者紐づけ ===' as section;
SELECT t.task_name, v.company
FROM task_vendor_mappings_v2 tvm
JOIN tasks t ON tvm.task_id = t.id
JOIN vendors_v2 v ON tvm.vendor_id = v.id
WHERE t.category = 'IC'
ORDER BY t.display_order, v.company;

SELECT '✅ ICタスクマイグレーション完了 (21項目 + 業者紐づけ)' as result;
