-- =====================================================
-- 設計士・IC担当者の追加SQL
-- designersテーブルにデータを挿入
-- =====================================================

-- 既存の設計士を削除（重複を避けるため）
DELETE FROM designers;

-- 設計担当者とIC担当者の追加
INSERT INTO designers (name, email) VALUES
  -- 設計担当（10名）
  ('箕浦 三四郎', 'minoura-s@g-house.osaka.jp'),
  ('林 恭生', 'hayashi-t@g-house.osaka.jp'),
  ('田中 聡', 'ts@g-house.osaka.jp'),
  ('北村 晃平', 'kitamura-k@g-house.osaka.jp'),
  ('高濱 洋文', 'takahama-h@g-house.osaka.jp'),
  ('足立 雅哉', 'adachi-m@g-house.osaka.jp'),
  ('内藤 智之', 'naito-s@g-house.osaka.jp'),
  ('荘野 善宏', 'shono-y@g-house.osaka.jp'),
  ('若狹 龍成', 'wakasa-r@g-house.osaka.jp'),
  ('石井 義信', 'ishii-y@g-house.osaka.jp'),
  -- IC担当（9名）
  ('柳川 奈緒', 'yn@g-house.osaka.jp'),
  ('西川 由佳', 'ny@g-house.osaka.jp'),
  ('古久保 知佳子', 'furukubo-c@g-house.osaka.jp'),
  ('島田 真奈', 'shimada-m@g-house.osaka.jp'),
  ('吉川 侑希', 'yoshikawa-y@g-house.osaka.jp'),
  ('中川 千尋', 'nakagawa-c@g-house.osaka.jp'),
  ('今村 珠梨', 'imamura-s@g-house.osaka.jp'),
  ('浦川 千夏', 'urakawa-c@g-house.osaka.jp'),
  ('森永 凪子', 'morinaga-n@g-house.osaka.jp');

-- 既存案件のdesigner_idを設定
UPDATE projects p
SET designer_id = d.id
FROM designers d
WHERE p.assigned_to = d.name
AND p.designer_id IS NULL;

-- 確認
SELECT name, email FROM designers ORDER BY name;
