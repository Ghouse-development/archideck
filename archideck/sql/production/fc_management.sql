-- =====================================================
-- FC（フランチャイズ）管理テーブル
-- =====================================================

-- FC組織テーブル
CREATE TABLE IF NOT EXISTS fc_organizations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,  -- URLスラッグ（例: tokyo-fc）
  name TEXT NOT NULL,         -- FC名（例: 東京フランチャイズ）
  logo_url TEXT,              -- カスタムロゴURL
  primary_color TEXT DEFAULT '#2563EB',  -- ブランドカラー
  contact_email TEXT,         -- 連絡先メール
  contact_tel TEXT,           -- 連絡先電話
  is_active BOOLEAN DEFAULT true,
  settings JSONB DEFAULT '{}',  -- その他のカスタム設定
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- FC組織に紐づくスタッフ
CREATE TABLE IF NOT EXISTS fc_staff (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  fc_id UUID REFERENCES fc_organizations(id) ON DELETE CASCADE,
  designer_id UUID REFERENCES designers(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member',  -- admin, member
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(fc_id, designer_id)
);

-- RLSを無効化（シンプルな運用のため）
ALTER TABLE fc_organizations DISABLE ROW LEVEL SECURITY;
ALTER TABLE fc_staff DISABLE ROW LEVEL SECURITY;

-- インデックス
CREATE INDEX IF NOT EXISTS idx_fc_organizations_slug ON fc_organizations(slug);
CREATE INDEX IF NOT EXISTS idx_fc_organizations_active ON fc_organizations(is_active);
CREATE INDEX IF NOT EXISTS idx_fc_staff_fc_id ON fc_staff(fc_id);
CREATE INDEX IF NOT EXISTS idx_fc_staff_designer_id ON fc_staff(designer_id);

-- 確認
SELECT '✅ FC管理テーブル作成完了' as result;
