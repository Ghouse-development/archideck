-- =====================================================
-- カスタマイズ可能システム - 新テーブル作成
-- =====================================================

-- 業者カテゴリテーブル
CREATE TABLE IF NOT EXISTS vendor_categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- タスク定義テーブル
CREATE TABLE IF NOT EXISTS tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_key TEXT NOT NULL UNIQUE,
  task_name TEXT NOT NULL,
  category TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,
  has_state BOOLEAN DEFAULT false,
  state_options JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 統合業者テーブル
CREATE TABLE IF NOT EXISTS vendors_v2 (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company TEXT NOT NULL,
  contact TEXT,
  tel TEXT,
  email TEXT,
  category_id UUID REFERENCES vendor_categories(id),
  subject_format TEXT,
  template_text TEXT,
  has_special_content BOOLEAN DEFAULT false,
  default_special_content TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- タスク-業者紐づけ
CREATE TABLE IF NOT EXISTS task_vendor_mappings_v2 (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  vendor_id UUID REFERENCES vendors_v2(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(task_id, vendor_id)
);

-- RLS無効化
ALTER TABLE vendor_categories DISABLE ROW LEVEL SECURITY;
ALTER TABLE tasks DISABLE ROW LEVEL SECURITY;
ALTER TABLE vendors_v2 DISABLE ROW LEVEL SECURITY;
ALTER TABLE task_vendor_mappings_v2 DISABLE ROW LEVEL SECURITY;

-- デフォルト業者カテゴリ
INSERT INTO vendor_categories (name, display_order) VALUES
  ('給排水', 1), ('換気', 2), ('太陽光', 3), ('エボルツ', 4), ('サッシ', 5),
  ('設備', 6), ('照明', 7), ('ファブレス', 8), ('アイアン階段・手摺', 9)
ON CONFLICT (name) DO NOTHING;

SELECT '✅ テーブル作成完了' as result;
SELECT * FROM vendor_categories ORDER BY display_order;
