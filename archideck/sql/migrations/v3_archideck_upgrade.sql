-- =====================================================
-- ArchiDeck v3.0 アップグレードSQL
-- 大規模リニューアル: タスク構成変更、新機能追加
-- =====================================================

-- =====================================================
-- PART 1: 既存タスクの削除と新タスクの追加
-- =====================================================

-- 不要なタスクを削除
DELETE FROM tasks WHERE task_key IN (
  'meeting1', 'meeting2', 'meeting3',
  'quotation', 'contract', 'structure_doc',
  'approval', 'delivery'
);

-- 既存タスクの名称・ステータス変更
UPDATE tasks SET task_name = 'evoltz依頼', state_options = '["", "候補図依頼", "候補図保存済", "確定図依頼", "確定図保存済"]'
WHERE task_key = 'evoltz';

UPDATE tasks SET task_name = 'サッシ依頼'
WHERE task_key = 'sash';

UPDATE tasks SET task_name = '申請GO'
WHERE task_key = 'application';

UPDATE tasks SET state_options = '["", "ラフチェック", "構造GO", "1回目CB", "2回目CB", "変更契約前会議UP", "確定図をダンドリワークUP"]'
WHERE task_key = 'structure';

UPDATE tasks SET state_options = '["", "依頼済", "保存済", "営業共有済"]'
WHERE task_key = 'solar';

UPDATE tasks SET task_name = '換気図依頼'
WHERE task_key = 'ventilation';

UPDATE tasks SET task_name = '給排水依頼'
WHERE task_key = 'plumbing';

-- 新しいタスクを追加（設計用）
INSERT INTO tasks (task_key, task_name, category, display_order, has_state, state_options) VALUES
  ('contract_check', '契約書・引継書チェック', '設計', 1, true, '["", "確認済"]'),
  ('site_survey', '現地調査', '設計', 2, true, '["", "確認済"]'),
  ('layout_confirmed', '間取確定', '設計', 4, true, '["", "確定済"]'),
  ('area_check', '面積チェック', '設計', 5, true, '["", "依頼済", "営業共有済"]'),
  ('checklist', 'チェックリスト', '設計', 6, true, '["", "間取確定後：済", "最終確認後：済"]'),
  ('handover_input', '引継書入力', '設計', 7, true, '["", "入力済"]'),
  ('exterior_request', '外構依頼', '設計', 8, true, '["", "ヒアリングシート＋3DSデータ：UP済"]'),
  ('implementation_request', '実施図依頼', '設計', 9, true, '["", "依頼済", "保存済"]'),
  ('ground_survey', '地盤調査', '設計', 16, true, '["", "依頼済", "保存済", "営業共有済"]')
ON CONFLICT (task_key) DO UPDATE SET
  task_name = EXCLUDED.task_name,
  display_order = EXCLUDED.display_order,
  has_state = EXCLUDED.has_state,
  state_options = EXCLUDED.state_options;

-- 全タスクの表示順序を更新
UPDATE tasks SET display_order = 1 WHERE task_key = 'contract_check';
UPDATE tasks SET display_order = 2 WHERE task_key = 'site_survey';
UPDATE tasks SET display_order = 3 WHERE task_key = 'meeting0';
UPDATE tasks SET display_order = 4 WHERE task_key = 'layout_confirmed';
UPDATE tasks SET display_order = 5 WHERE task_key = 'area_check';
UPDATE tasks SET display_order = 6 WHERE task_key = 'checklist';
UPDATE tasks SET display_order = 7 WHERE task_key = 'handover_input';
UPDATE tasks SET display_order = 8 WHERE task_key = 'exterior_request';
UPDATE tasks SET display_order = 9 WHERE task_key = 'implementation_request';
UPDATE tasks SET display_order = 10 WHERE task_key = 'structure';
UPDATE tasks SET display_order = 11 WHERE task_key = 'evoltz';
UPDATE tasks SET display_order = 12 WHERE task_key = 'plumbing';
UPDATE tasks SET display_order = 13 WHERE task_key = 'solar';
UPDATE tasks SET display_order = 14 WHERE task_key = 'ventilation';
UPDATE tasks SET display_order = 15 WHERE task_key = 'sash';
UPDATE tasks SET display_order = 16 WHERE task_key = 'ground_survey';
UPDATE tasks SET display_order = 17 WHERE task_key = 'application';

-- =====================================================
-- PART 2: 商品マスタの名称変更
-- =====================================================
UPDATE products SET name = 'LIFE Limited' WHERE name = 'LIFEリミ';
UPDATE products SET name = 'LIFE+ Limited' WHERE name = 'LIFE+リミ';

-- =====================================================
-- PART 3: 外構担当カテゴリの追加
-- =====================================================
INSERT INTO vendor_categories (name, display_order) VALUES
  ('外構', 10)
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- PART 4: designersテーブルに外構カテゴリ対応
-- =====================================================
-- designers テーブルにcategoryカラムがない場合は追加
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'designers' AND column_name = 'category'
  ) THEN
    ALTER TABLE designers ADD COLUMN category TEXT DEFAULT '設計';
  END IF;
END $$;

-- =====================================================
-- PART 5: 案件タスクテーブルの作成（新機能）
-- =====================================================
CREATE TABLE IF NOT EXISTS project_tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  task_name TEXT NOT NULL,
  due_date DATE,
  is_completed BOOLEAN DEFAULT false,
  assigned_to TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_tasks_project_id ON project_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_project_tasks_assigned_to ON project_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_project_tasks_due_date ON project_tasks(due_date);

-- RLSポリシー
ALTER TABLE project_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view project_tasks" ON project_tasks;
DROP POLICY IF EXISTS "Authenticated users can insert project_tasks" ON project_tasks;
DROP POLICY IF EXISTS "Authenticated users can update project_tasks" ON project_tasks;
DROP POLICY IF EXISTS "Authenticated users can delete project_tasks" ON project_tasks;

CREATE POLICY "Authenticated users can view project_tasks"
  ON project_tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert project_tasks"
  ON project_tasks FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update project_tasks"
  ON project_tasks FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete project_tasks"
  ON project_tasks FOR DELETE TO authenticated USING (true);

-- =====================================================
-- PART 6: 議事録テーブルの作成（新機能）
-- =====================================================
CREATE TABLE IF NOT EXISTS project_minutes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size INTEGER,
  uploaded_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_minutes_project_id ON project_minutes(project_id);

-- RLSポリシー
ALTER TABLE project_minutes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view project_minutes" ON project_minutes;
DROP POLICY IF EXISTS "Authenticated users can insert project_minutes" ON project_minutes;
DROP POLICY IF EXISTS "Authenticated users can delete project_minutes" ON project_minutes;

CREATE POLICY "Authenticated users can view project_minutes"
  ON project_minutes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert project_minutes"
  ON project_minutes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can delete project_minutes"
  ON project_minutes FOR DELETE TO authenticated USING (true);

-- =====================================================
-- PART 7: 通知テーブルの作成（新機能）
-- =====================================================
CREATE TABLE IF NOT EXISTS notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_email TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  link TEXT,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_email ON notifications(user_email);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);

-- RLSポリシー
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;

CREATE POLICY "Users can view own notifications"
  ON notifications FOR SELECT TO authenticated
  USING (user_email = auth.jwt() ->> 'email');
CREATE POLICY "Authenticated users can insert notifications"
  ON notifications FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE TO authenticated
  USING (user_email = auth.jwt() ->> 'email');

-- =====================================================
-- PART 8: 引継書テーブルの作成（新機能）
-- =====================================================
CREATE TABLE IF NOT EXISTS project_handovers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  content TEXT,
  updated_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_handovers_project_id ON project_handovers(project_id);

-- RLSポリシー
ALTER TABLE project_handovers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view project_handovers" ON project_handovers;
DROP POLICY IF EXISTS "Authenticated users can insert project_handovers" ON project_handovers;
DROP POLICY IF EXISTS "Authenticated users can update project_handovers" ON project_handovers;

CREATE POLICY "Authenticated users can view project_handovers"
  ON project_handovers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert project_handovers"
  ON project_handovers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update project_handovers"
  ON project_handovers FOR UPDATE TO authenticated USING (true);

-- =====================================================
-- PART 9: projectsテーブルに新カラム追加
-- =====================================================
DO $$
BEGIN
  -- 外構担当カラム
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'exterior_assignee'
  ) THEN
    ALTER TABLE projects ADD COLUMN exterior_assignee TEXT;
  END IF;

  -- 共有メモカラム（IC・外構も見える）
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'shared_memo'
  ) THEN
    ALTER TABLE projects ADD COLUMN shared_memo TEXT;
  END IF;

  -- kintone連携用カラム
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'kintone_record_id'
  ) THEN
    ALTER TABLE projects ADD COLUMN kintone_record_id TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'layout_confirmed_date'
  ) THEN
    ALTER TABLE projects ADD COLUMN layout_confirmed_date DATE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'construction_permit_date'
  ) THEN
    ALTER TABLE projects ADD COLUMN construction_permit_date DATE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'pre_contract_meeting_date'
  ) THEN
    ALTER TABLE projects ADD COLUMN pre_contract_meeting_date DATE;
  END IF;
END $$;

-- =====================================================
-- PART 10: kintone設定テーブル（新機能）
-- =====================================================
CREATE TABLE IF NOT EXISTS kintone_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  domain TEXT NOT NULL,
  app_id TEXT NOT NULL,
  api_token TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLSポリシー
ALTER TABLE kintone_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view kintone_settings" ON kintone_settings;
DROP POLICY IF EXISTS "Authenticated users can insert kintone_settings" ON kintone_settings;
DROP POLICY IF EXISTS "Authenticated users can update kintone_settings" ON kintone_settings;

CREATE POLICY "Authenticated users can view kintone_settings"
  ON kintone_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert kintone_settings"
  ON kintone_settings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update kintone_settings"
  ON kintone_settings FOR UPDATE TO authenticated USING (true);

-- =====================================================
-- 確認クエリ
-- =====================================================
SELECT '=== 設計用タスク（新順序）===' as section;
SELECT task_key, task_name, display_order, has_state, state_options
FROM tasks
WHERE category = '設計'
ORDER BY display_order;

SELECT '=== 商品マスタ ===' as section;
SELECT * FROM products ORDER BY display_order;

SELECT '=== 新テーブル確認 ===' as section;
SELECT 'project_tasks' as table_name, COUNT(*) as count FROM project_tasks
UNION ALL
SELECT 'project_minutes', COUNT(*) FROM project_minutes
UNION ALL
SELECT 'notifications', COUNT(*) FROM notifications
UNION ALL
SELECT 'project_handovers', COUNT(*) FROM project_handovers;

SELECT '=== ArchiDeck v3.0 マイグレーション完了 ===' as result;
