-- =====================================================
-- 設計・ICコーディネーター業務管理システム
-- Supabaseテーブル作成SQL
-- =====================================================

-- 1. 設計士テーブル
CREATE TABLE IF NOT EXISTS designers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. 案件テーブル
CREATE TABLE IF NOT EXISTS projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  uid TEXT UNIQUE NOT NULL,
  customer TEXT NOT NULL,
  assigned_to TEXT NOT NULL,
  specifications TEXT,
  memo TEXT,
  status TEXT DEFAULT 'active',
  progress JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. メールテンプレートテーブル
CREATE TABLE IF NOT EXISTS email_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  category TEXT DEFAULT '設計',
  company TEXT NOT NULL,
  contact TEXT,
  email TEXT,
  subject_format TEXT,
  template_text TEXT,
  has_special_content BOOLEAN DEFAULT false,
  has_sub_options BOOLEAN DEFAULT false,
  default_special_content TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. テンプレート業者情報テーブル（サブオプション）
CREATE TABLE IF NOT EXISTS template_vendors (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES email_templates(template_id) ON DELETE CASCADE,
  vendor_id TEXT NOT NULL,
  company TEXT NOT NULL,
  contact TEXT NOT NULL,
  tel TEXT,
  email TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(template_id, vendor_id)
);

-- 5. タスク-テンプレート紐づけテーブル
CREATE TABLE IF NOT EXISTS task_template_mappings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_key TEXT UNIQUE NOT NULL,
  template_id TEXT REFERENCES email_templates(template_id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_projects_assigned_to ON projects(assigned_to);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_customer ON projects(customer);
CREATE INDEX IF NOT EXISTS idx_email_templates_category ON email_templates(category);
CREATE INDEX IF NOT EXISTS idx_template_vendors_template_id ON template_vendors(template_id);
CREATE INDEX IF NOT EXISTS idx_task_mappings_task_key ON task_template_mappings(task_key);

-- RLS（Row Level Security）の有効化
ALTER TABLE designers ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_template_mappings ENABLE ROW LEVEL SECURITY;

-- RLSポリシー: 全ユーザーが全データにアクセス可能（社内システム想定）
-- designers
CREATE POLICY "Anyone can view designers" ON designers FOR SELECT USING (true);
CREATE POLICY "Anyone can insert designers" ON designers FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update designers" ON designers FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete designers" ON designers FOR DELETE USING (true);

-- projects
CREATE POLICY "Anyone can view projects" ON projects FOR SELECT USING (true);
CREATE POLICY "Anyone can insert projects" ON projects FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update projects" ON projects FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete projects" ON projects FOR DELETE USING (true);

-- email_templates
CREATE POLICY "Anyone can view email_templates" ON email_templates FOR SELECT USING (true);
CREATE POLICY "Anyone can insert email_templates" ON email_templates FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update email_templates" ON email_templates FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete email_templates" ON email_templates FOR DELETE USING (true);

-- template_vendors
CREATE POLICY "Anyone can view template_vendors" ON template_vendors FOR SELECT USING (true);
CREATE POLICY "Anyone can insert template_vendors" ON template_vendors FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update template_vendors" ON template_vendors FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete template_vendors" ON template_vendors FOR DELETE USING (true);

-- task_template_mappings
CREATE POLICY "Anyone can view task_template_mappings" ON task_template_mappings FOR SELECT USING (true);
CREATE POLICY "Anyone can insert task_template_mappings" ON task_template_mappings FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update task_template_mappings" ON task_template_mappings FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete task_template_mappings" ON task_template_mappings FOR DELETE USING (true);

-- 更新日時を自動更新するトリガー
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_designers_updated_at BEFORE UPDATE ON designers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_email_templates_updated_at BEFORE UPDATE ON email_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_template_vendors_updated_at BEFORE UPDATE ON template_vendors FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_task_mappings_updated_at BEFORE UPDATE ON task_template_mappings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
