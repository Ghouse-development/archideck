-- =====================================================
-- マイグレーションSQL: 担当者別ログイン機能追加
-- 既存データを保持したまま新機能を追加
-- =====================================================

-- =====================================================
-- PART 1: カラム追加（存在しない場合のみ）
-- =====================================================

-- designersテーブルにemail列を追加
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'designers' AND column_name = 'email'
  ) THEN
    ALTER TABLE designers ADD COLUMN email TEXT UNIQUE;
  END IF;
END $$;

-- projectsテーブルにdesigner_id列を追加
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'designer_id'
  ) THEN
    ALTER TABLE projects ADD COLUMN designer_id UUID REFERENCES designers(id) ON DELETE SET NULL;
  END IF;
END $$;

-- =====================================================
-- PART 2: インデックス追加
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_projects_designer_id ON projects(designer_id);
CREATE INDEX IF NOT EXISTS idx_designers_email ON designers(email);

-- =====================================================
-- PART 3: 設計士のメールアドレス更新
-- =====================================================
UPDATE designers SET email = 'minoura-s@g-house.osaka.jp' WHERE name = '箕浦 三四郎';
UPDATE designers SET email = 'hayashi-t@g-house.osaka.jp' WHERE name = '林 恭生';
UPDATE designers SET email = 'ts@g-house.osaka.jp' WHERE name = '田中 聡';
UPDATE designers SET email = 'kitamura-k@g-house.osaka.jp' WHERE name = '北村 晃平';
UPDATE designers SET email = 'takahama-h@g-house.osaka.jp' WHERE name = '高濱 洋文';
UPDATE designers SET email = 'adachi-m@g-house.osaka.jp' WHERE name = '足立 雅哉';
UPDATE designers SET email = 'naito-s@g-house.osaka.jp' WHERE name = '内藤 智之';
UPDATE designers SET email = 'shono-y@g-house.osaka.jp' WHERE name = '荘野 善宏';
UPDATE designers SET email = 'wakasa-r@g-house.osaka.jp' WHERE name = '若狹 龍成';
UPDATE designers SET email = 'ishii-y@g-house.osaka.jp' WHERE name = '石井 義信';
UPDATE designers SET email = 'yn@g-house.osaka.jp' WHERE name = '柳川 奈緒';
UPDATE designers SET email = 'ny@g-house.osaka.jp' WHERE name = '西川 由佳';
UPDATE designers SET email = 'furukubo-c@g-house.osaka.jp' WHERE name = '古久保 知佳子';
UPDATE designers SET email = 'shimada-m@g-house.osaka.jp' WHERE name = '島田 真奈';
UPDATE designers SET email = 'yoshikawa-y@g-house.osaka.jp' WHERE name = '吉川 侑希';
UPDATE designers SET email = 'nakagawa-c@g-house.osaka.jp' WHERE name = '中川 千尋';
UPDATE designers SET email = 'imamura-s@g-house.osaka.jp' WHERE name = '今村 珠梨';
UPDATE designers SET email = 'urakawa-c@g-house.osaka.jp' WHERE name = '浦川 千夏';
UPDATE designers SET email = 'morinaga-n@g-house.osaka.jp' WHERE name = '森永 凪子';

-- =====================================================
-- PART 4: 既存案件のdesigner_idを設定
-- =====================================================
UPDATE projects p
SET designer_id = d.id
FROM designers d
WHERE p.assigned_to = d.name
AND p.designer_id IS NULL;

-- =====================================================
-- PART 5: RLSポリシー更新
-- =====================================================

-- 既存のprojectsポリシーを削除
DROP POLICY IF EXISTS "Authenticated users can view projects" ON projects;

-- 新しいポリシーを作成（担当者別フィルタリング）
CREATE POLICY "Authenticated users can view projects"
  ON projects FOR SELECT
  TO authenticated
  USING (
    -- 管理者は全て見られる
    auth.jwt() ->> 'email' = 'admin@ghouse.jp'
    OR
    -- 担当者は自分の案件のみ見られる
    designer_id IN (
      SELECT id FROM designers WHERE email = auth.jwt() ->> 'email'
    )
  );

-- =====================================================
-- 完了！
-- =====================================================
-- このSQLを実行すれば、既存データを保持したまま
-- 担当者別ログイン機能が追加されます。
-- =====================================================
