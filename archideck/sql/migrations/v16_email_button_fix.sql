-- v16: メールボタン必須設定の修正
-- 実行日: 2026-01-17
-- 内容: ICタスクのhas_email_button設定を正しく反映

-- ============================================
-- 1. has_email_buttonカラムを追加（既にある場合は無視される）
-- ============================================
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS has_email_button BOOLEAN DEFAULT false;

-- ============================================
-- 2. メールボタン必須タスクを更新
-- ============================================
-- キッチン・カップボード
UPDATE tasks SET has_email_button = true WHERE task_key = 'ic_kitchen';

-- お風呂
UPDATE tasks SET has_email_button = true WHERE task_key = 'ic_bath';

-- 洗面1階・2階
UPDATE tasks SET has_email_button = true WHERE task_key = 'ic_washroom_1f';
UPDATE tasks SET has_email_button = true WHERE task_key = 'ic_washroom_2f';
UPDATE tasks SET has_email_button = true WHERE task_key = 'ic_washroom';

-- トイレ1階・2階
UPDATE tasks SET has_email_button = true WHERE task_key = 'ic_toilet_1f';
UPDATE tasks SET has_email_button = true WHERE task_key = 'ic_toilet_2f';
UPDATE tasks SET has_email_button = true WHERE task_key = 'ic_toilet';

-- 照明プラン
UPDATE tasks SET has_email_button = true WHERE task_key = 'ic_lighting';

-- 建具プレゼン
UPDATE tasks SET has_email_button = true WHERE task_key = 'ic_tategu';

-- タイルプレゼン
UPDATE tasks SET has_email_button = true WHERE task_key = 'ic_tile_pres';

-- カーテン紹介
UPDATE tasks SET has_email_button = true WHERE task_key = 'ic_curtain';

-- 造作業者紹介
UPDATE tasks SET has_email_button = true WHERE task_key = 'ic_zousaku';

-- 家具見積依頼
UPDATE tasks SET has_email_button = true WHERE task_key = 'ic_furniture';

-- ============================================
-- 3. メールボタン不要タスクは明示的にfalse
-- ============================================
UPDATE tasks SET has_email_button = false WHERE task_key IN (
  'ic_funding_check',
  'ic_spec_doc',
  'ic_longterm_doc',
  'ic_execution_drawing',
  'ic_exterior_pres',
  'ic_interior_pres',
  'ic_iron_pres',
  'ic_exterior_meeting',
  'ic_final_checklist',
  'ic_op_check',
  'ic_meeting_followup',
  'ic_final_approval'
);

-- ============================================
-- 4. 外構への打合せ依頼の位置変更（長期資料送付の下へ）
-- ============================================
-- 現在: display_order=17 → 新: display_order=11

-- まず11以上のタスクを+1（外構への打合せ依頼を除く）
UPDATE tasks
SET display_order = display_order + 1
WHERE category = 'IC'
  AND display_order >= 11
  AND task_key != 'ic_exterior_meeting';

-- 外構への打合せ依頼を11に設定
UPDATE tasks
SET display_order = 11
WHERE task_key = 'ic_exterior_meeting';

-- ============================================
-- 確認クエリ
-- ============================================
-- SELECT task_key, task_name, display_order, has_email_button FROM tasks WHERE category = 'IC' ORDER BY display_order;
