-- =====================================================
-- スタッフ表示順序の設定
-- =====================================================

-- display_orderカラムを追加（既に存在する場合はスキップ）
ALTER TABLE designers ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 999;

-- 設計担当の表示順序を設定
UPDATE designers SET display_order = 1 WHERE name = '箕浦' AND category = '設計';
UPDATE designers SET display_order = 2 WHERE name = '林' AND category = '設計';
UPDATE designers SET display_order = 3 WHERE name = '田中' AND category = '設計';
UPDATE designers SET display_order = 4 WHERE name = '高濱' AND category = '設計';
UPDATE designers SET display_order = 5 WHERE name = '荘野' AND category = '設計';
UPDATE designers SET display_order = 6 WHERE name = '石井' AND category = '設計';
UPDATE designers SET display_order = 7 WHERE name = '若狭' AND category = '設計';
UPDATE designers SET display_order = 8 WHERE name = '北村' AND category = '設計';
UPDATE designers SET display_order = 9 WHERE name = '内藤' AND category = '設計';
UPDATE designers SET display_order = 10 WHERE name = '足立' AND category = '設計';

-- IC担当の表示順序を設定
UPDATE designers SET display_order = 1 WHERE name = '柳川' AND category = 'IC';
UPDATE designers SET display_order = 2 WHERE name = '西川' AND category = 'IC';
UPDATE designers SET display_order = 3 WHERE name = '島田' AND category = 'IC';
UPDATE designers SET display_order = 4 WHERE name = '吉川' AND category = 'IC';
UPDATE designers SET display_order = 5 WHERE name = '中川' AND category = 'IC';
UPDATE designers SET display_order = 6 WHERE name = '古久保' AND category = 'IC';
UPDATE designers SET display_order = 7 WHERE name = '今村' AND category = 'IC';
UPDATE designers SET display_order = 8 WHERE name = '浦川' AND category = 'IC';
UPDATE designers SET display_order = 9 WHERE name = '森永' AND category = 'IC';

-- 確認用：表示順序を確認
SELECT
  category,
  name,
  display_order
FROM designers
ORDER BY category DESC, display_order;
