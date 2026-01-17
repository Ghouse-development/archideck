-- v14: ICタスク大幅更新
-- 実行日: 2026-01-17
-- 内容:
--   1. タスク名変更（建具プレゼン依頼→建具プレゼン等）
--   2. アイアンプレゼン追加
--   3. ステータス統一（タイルプレゼン等）
--   4. メールボタン設定
--   5. 言葉の揺らぎ統一

-- ============================================
-- 1. タスク名の変更
-- ============================================
UPDATE tasks SET task_name = '建具プレゼン' WHERE task_key = 'ic_tategu';
UPDATE tasks SET task_name = '外装プレゼン' WHERE task_key = 'ic_exterior_pres';
UPDATE tasks SET task_name = '内装プレゼン' WHERE task_key = 'ic_interior_pres';
UPDATE tasks SET task_name = 'タイルプレゼン' WHERE task_key = 'ic_tile_pres';

-- ============================================
-- 2. アイアンプレゼン追加（タイルプレゼンの上、display_order調整）
-- ============================================
-- まず既存のタスクのdisplay_orderを調整（15以上を+1）
UPDATE tasks SET display_order = display_order + 1
WHERE category = 'IC' AND display_order >= 15;

-- アイアンプレゼンを追加
INSERT INTO tasks (task_key, task_name, category, display_order, has_state, state_options, has_email_button)
VALUES ('ic_iron_pres', 'アイアンプレゼン', 'IC', 15, true, '["-", "無し", "依頼済", "保存済"]', false)
ON CONFLICT (task_key) DO UPDATE SET
  task_name = EXCLUDED.task_name,
  display_order = EXCLUDED.display_order,
  state_options = EXCLUDED.state_options;

-- ============================================
-- 3. ステータス統一（タイルプレゼン・外構・カーテン・造作・家具）
-- ============================================
-- タイルプレゼン: ー/無し/依頼済/保存済
UPDATE tasks SET state_options = '["-", "無し", "依頼済", "保存済"]'
WHERE task_key = 'ic_tile_pres';

-- 外構への打合せ依頼: ー/無し/依頼済/保存済
UPDATE tasks SET state_options = '["-", "無し", "依頼済", "保存済"]'
WHERE task_key = 'ic_exterior_meeting';

-- カーテン紹介: ー/無し/依頼済/保存済
UPDATE tasks SET state_options = '["-", "無し", "依頼済", "保存済"]'
WHERE task_key = 'ic_curtain';

-- 造作業者紹介: ー/無し/依頼済/保存済
UPDATE tasks SET state_options = '["-", "無し", "依頼済", "保存済"]'
WHERE task_key = 'ic_zousaku';

-- 家具見積依頼: ー/無し/依頼済/保存済
UPDATE tasks SET state_options = '["-", "無し", "依頼済", "保存済"]'
WHERE task_key = 'ic_furniture';

-- ============================================
-- 4. メールボタン設定
-- ============================================
-- メールボタン必須タスク
UPDATE tasks SET has_email_button = true WHERE task_key IN (
  'ic_kitchen',      -- キッチン
  'ic_bath',         -- お風呂
  'ic_washroom_1f',  -- 洗面1階
  'ic_washroom_2f',  -- 洗面2階
  'ic_toilet_1f',    -- トイレ1階
  'ic_toilet_2f',    -- トイレ2階
  'ic_lighting',     -- 照明プラン
  'ic_tategu',       -- 建具プレゼン
  'ic_tile_pres',    -- タイルプレゼン
  'ic_curtain',      -- カーテン紹介
  'ic_zousaku',      -- 造作業者紹介
  'ic_furniture'     -- 家具見積依頼
);

-- ============================================
-- 5. 言葉の揺らぎ統一（progressデータ内の「無」→「無し」）
-- ============================================
-- 既存の案件データ内の「無」を「無し」に統一
-- (注: JSONBカラムの更新は複雑なため、アプリ側で対応推奨)

-- ============================================
-- 確認クエリ
-- ============================================
-- SELECT task_key, task_name, display_order, state_options, has_email_button
-- FROM tasks
-- WHERE category = 'IC'
-- ORDER BY display_order;
