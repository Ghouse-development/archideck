-- =====================================================
-- 設計・IC業務統合管理システム v2.0
-- Supabaseテーブル作成SQL（認証強化版）
-- =====================================================

-- 既存テーブルを削除（クリーンインストール用）
DROP TABLE IF EXISTS task_template_mappings CASCADE;
DROP TABLE IF EXISTS template_vendors CASCADE;
DROP TABLE IF EXISTS email_templates CASCADE;
DROP TABLE IF EXISTS projects CASCADE;
DROP TABLE IF EXISTS designers CASCADE;

-- 1. 設計士テーブル
CREATE TABLE designers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. 案件テーブル
CREATE TABLE projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  uid TEXT UNIQUE NOT NULL,
  customer TEXT NOT NULL,
  assigned_to TEXT NOT NULL,
  specifications TEXT,
  memo TEXT,
  status TEXT DEFAULT 'active',
  progress JSONB DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. メールテンプレートテーブル
CREATE TABLE email_templates (
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
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. テンプレート業者情報テーブル（サブオプション）
CREATE TABLE template_vendors (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES email_templates(template_id) ON DELETE CASCADE,
  vendor_id TEXT NOT NULL,
  company TEXT NOT NULL,
  contact TEXT NOT NULL,
  tel TEXT,
  email TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(template_id, vendor_id)
);

-- 5. タスク-テンプレート紐づけテーブル
CREATE TABLE task_template_mappings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_key TEXT UNIQUE NOT NULL,
  template_id TEXT REFERENCES email_templates(template_id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- インデックス作成
CREATE INDEX idx_projects_assigned_to ON projects(assigned_to);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_customer ON projects(customer);
CREATE INDEX idx_projects_created_by ON projects(created_by);
CREATE INDEX idx_email_templates_category ON email_templates(category);
CREATE INDEX idx_template_vendors_template_id ON template_vendors(template_id);
CREATE INDEX idx_task_mappings_task_key ON task_template_mappings(task_key);

-- RLS（Row Level Security）の有効化
ALTER TABLE designers ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_template_mappings ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLSポリシー: 認証済みユーザーのみアクセス可能
-- =====================================================

-- designers: 認証済みユーザーのみ
DROP POLICY IF EXISTS "Authenticated users can view designers" ON designers;
DROP POLICY IF EXISTS "Authenticated users can insert designers" ON designers;
DROP POLICY IF EXISTS "Authenticated users can update designers" ON designers;
DROP POLICY IF EXISTS "Authenticated users can delete designers" ON designers;

CREATE POLICY "Authenticated users can view designers"
  ON designers FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert designers"
  ON designers FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update designers"
  ON designers FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete designers"
  ON designers FOR DELETE
  TO authenticated
  USING (true);

-- projects: 認証済みユーザーのみ
DROP POLICY IF EXISTS "Authenticated users can view projects" ON projects;
DROP POLICY IF EXISTS "Authenticated users can insert projects" ON projects;
DROP POLICY IF EXISTS "Authenticated users can update projects" ON projects;
DROP POLICY IF EXISTS "Authenticated users can delete projects" ON projects;

CREATE POLICY "Authenticated users can view projects"
  ON projects FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert projects"
  ON projects FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Authenticated users can update projects"
  ON projects FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete projects"
  ON projects FOR DELETE
  TO authenticated
  USING (true);

-- email_templates: 認証済みユーザーのみ
DROP POLICY IF EXISTS "Authenticated users can view email_templates" ON email_templates;
DROP POLICY IF EXISTS "Authenticated users can insert email_templates" ON email_templates;
DROP POLICY IF EXISTS "Authenticated users can update email_templates" ON email_templates;
DROP POLICY IF EXISTS "Authenticated users can delete email_templates" ON email_templates;

CREATE POLICY "Authenticated users can view email_templates"
  ON email_templates FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert email_templates"
  ON email_templates FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Authenticated users can update email_templates"
  ON email_templates FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete email_templates"
  ON email_templates FOR DELETE
  TO authenticated
  USING (true);

-- template_vendors: 認証済みユーザーのみ
DROP POLICY IF EXISTS "Authenticated users can view template_vendors" ON template_vendors;
DROP POLICY IF EXISTS "Authenticated users can insert template_vendors" ON template_vendors;
DROP POLICY IF EXISTS "Authenticated users can update template_vendors" ON template_vendors;
DROP POLICY IF EXISTS "Authenticated users can delete template_vendors" ON template_vendors;

CREATE POLICY "Authenticated users can view template_vendors"
  ON template_vendors FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert template_vendors"
  ON template_vendors FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Authenticated users can update template_vendors"
  ON template_vendors FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete template_vendors"
  ON template_vendors FOR DELETE
  TO authenticated
  USING (true);

-- task_template_mappings: 認証済みユーザーのみ
DROP POLICY IF EXISTS "Authenticated users can view task_template_mappings" ON task_template_mappings;
DROP POLICY IF EXISTS "Authenticated users can insert task_template_mappings" ON task_template_mappings;
DROP POLICY IF EXISTS "Authenticated users can update task_template_mappings" ON task_template_mappings;
DROP POLICY IF EXISTS "Authenticated users can delete task_template_mappings" ON task_template_mappings;

CREATE POLICY "Authenticated users can view task_template_mappings"
  ON task_template_mappings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert task_template_mappings"
  ON task_template_mappings FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update task_template_mappings"
  ON task_template_mappings FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete task_template_mappings"
  ON task_template_mappings FOR DELETE
  TO authenticated
  USING (true);

-- 更新日時を自動更新するトリガー
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_designers_updated_at ON designers;
DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;
DROP TRIGGER IF EXISTS update_email_templates_updated_at ON email_templates;
DROP TRIGGER IF EXISTS update_template_vendors_updated_at ON template_vendors;
DROP TRIGGER IF EXISTS update_task_mappings_updated_at ON task_template_mappings;

CREATE TRIGGER update_designers_updated_at BEFORE UPDATE ON designers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_email_templates_updated_at BEFORE UPDATE ON email_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_template_vendors_updated_at BEFORE UPDATE ON template_vendors FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_task_mappings_updated_at BEFORE UPDATE ON task_template_mappings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
