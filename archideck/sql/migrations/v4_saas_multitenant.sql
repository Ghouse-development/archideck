-- =====================================================
-- ArchiDeck v4.0 SaaS マルチテナント対応
-- 100社販売に向けた大規模アップグレード
-- =====================================================

-- =====================================================
-- PART 1: 組織（会社）テーブル
-- =====================================================
CREATE TABLE IF NOT EXISTS organizations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,  -- URLで使用（例：ghouse.archideck.jp）
  email TEXT NOT NULL,
  phone TEXT,
  address TEXT,

  -- ホワイトラベル設定
  logo_url TEXT,
  primary_color TEXT DEFAULT '#4A90E2',
  secondary_color TEXT DEFAULT '#50E3C2',
  favicon_url TEXT,
  custom_domain TEXT,

  -- 設定
  timezone TEXT DEFAULT 'Asia/Tokyo',
  language TEXT DEFAULT 'ja',

  -- ステータス
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'cancelled')),

  -- メタデータ
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);
CREATE INDEX IF NOT EXISTS idx_organizations_status ON organizations(status);

-- =====================================================
-- PART 2: サブスクリプション（課金）テーブル
-- =====================================================
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

  -- プラン情報
  plan_type TEXT DEFAULT 'starter' CHECK (plan_type IN ('starter', 'professional', 'enterprise')),
  price_monthly INTEGER DEFAULT 9800,  -- 円
  price_yearly INTEGER DEFAULT 98000,  -- 円（年払い）
  billing_cycle TEXT DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'yearly')),

  -- 制限
  max_users INTEGER DEFAULT 5,
  max_projects INTEGER DEFAULT 100,
  max_storage_gb INTEGER DEFAULT 5,

  -- 機能フラグ
  features JSONB DEFAULT '{
    "kintone_integration": false,
    "custom_domain": false,
    "api_access": false,
    "priority_support": false,
    "white_label": false
  }'::jsonb,

  -- ステータス
  status TEXT DEFAULT 'trial' CHECK (status IN ('trial', 'active', 'past_due', 'cancelled')),
  trial_ends_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '14 days'),
  current_period_start TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  current_period_end TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '1 month'),

  -- 決済情報（Stripe連携用）
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_org ON subscriptions(organization_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

-- =====================================================
-- PART 3: プランマスタ
-- =====================================================
CREATE TABLE IF NOT EXISTS plans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  price_monthly INTEGER NOT NULL,
  price_yearly INTEGER NOT NULL,

  -- 制限
  max_users INTEGER NOT NULL,
  max_projects INTEGER NOT NULL,
  max_storage_gb INTEGER NOT NULL,

  -- 機能
  features JSONB NOT NULL,

  -- 表示
  is_popular BOOLEAN DEFAULT false,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 初期プラン投入
INSERT INTO plans (name, slug, description, price_monthly, price_yearly, max_users, max_projects, max_storage_gb, features, is_popular, display_order)
VALUES
  ('スターター', 'starter', '小規模チーム向け', 9800, 98000, 5, 100, 5,
   '{"kintone_integration": false, "custom_domain": false, "api_access": false, "priority_support": false, "white_label": false}'::jsonb,
   false, 1),
  ('プロフェッショナル', 'professional', '成長するチーム向け', 19800, 198000, 15, 500, 20,
   '{"kintone_integration": true, "custom_domain": false, "api_access": true, "priority_support": false, "white_label": false}'::jsonb,
   true, 2),
  ('エンタープライズ', 'enterprise', '大規模組織向け', 49800, 498000, 50, -1, 100,
   '{"kintone_integration": true, "custom_domain": true, "api_access": true, "priority_support": true, "white_label": true}'::jsonb,
   false, 3)
ON CONFLICT (slug) DO UPDATE SET
  price_monthly = EXCLUDED.price_monthly,
  price_yearly = EXCLUDED.price_yearly,
  max_users = EXCLUDED.max_users,
  max_projects = EXCLUDED.max_projects,
  features = EXCLUDED.features;

-- =====================================================
-- PART 4: 組織メンバーテーブル
-- =====================================================
CREATE TABLE IF NOT EXISTS organization_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,

  -- 役割
  role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),

  -- ステータス
  status TEXT DEFAULT 'active' CHECK (status IN ('pending', 'active', 'suspended')),
  invited_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  joined_at TIMESTAMP WITH TIME ZONE,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(organization_id, user_id),
  UNIQUE(organization_id, email)
);

CREATE INDEX IF NOT EXISTS idx_org_members_org ON organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user ON organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_email ON organization_members(email);

-- =====================================================
-- PART 5: 既存テーブルにorganization_id追加
-- =====================================================

-- designers テーブル
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'designers' AND column_name = 'organization_id'
  ) THEN
    ALTER TABLE designers ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
    CREATE INDEX idx_designers_org ON designers(organization_id);
  END IF;
END $$;

-- projects テーブル
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'organization_id'
  ) THEN
    ALTER TABLE projects ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
    CREATE INDEX idx_projects_org ON projects(organization_id);
  END IF;
END $$;

-- email_templates テーブル
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'email_templates' AND column_name = 'organization_id'
  ) THEN
    ALTER TABLE email_templates ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
    CREATE INDEX idx_email_templates_org ON email_templates(organization_id);
  END IF;
END $$;

-- template_vendors テーブル
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'template_vendors' AND column_name = 'organization_id'
  ) THEN
    ALTER TABLE template_vendors ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
    CREATE INDEX idx_template_vendors_org ON template_vendors(organization_id);
  END IF;
END $$;

-- kintone_settings テーブル
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'kintone_settings' AND column_name = 'organization_id'
  ) THEN
    ALTER TABLE kintone_settings ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
    CREATE INDEX idx_kintone_settings_org ON kintone_settings(organization_id);
  END IF;
END $$;

-- =====================================================
-- PART 6: ユーザーの所属組織を取得する関数
-- =====================================================
CREATE OR REPLACE FUNCTION get_user_organization_id()
RETURNS UUID AS $$
DECLARE
  org_id UUID;
BEGIN
  SELECT organization_id INTO org_id
  FROM organization_members
  WHERE user_id = auth.uid()
    AND status = 'active'
  LIMIT 1;

  RETURN org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- PART 7: RLSポリシー更新（マルチテナント対応）
-- =====================================================

-- organizations RLS
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own organization" ON organizations;
CREATE POLICY "Users can view own organization"
  ON organizations FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

DROP POLICY IF EXISTS "Owners can update organization" ON organizations;
CREATE POLICY "Owners can update organization"
  ON organizations FOR UPDATE TO authenticated
  USING (
    id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin') AND status = 'active'
    )
  );

-- subscriptions RLS
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own subscription" ON subscriptions;
CREATE POLICY "Users can view own subscription"
  ON subscriptions FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- organization_members RLS
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view org members" ON organization_members;
CREATE POLICY "Users can view org members"
  ON organization_members FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members om
      WHERE om.user_id = auth.uid() AND om.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Admins can manage members" ON organization_members;
CREATE POLICY "Admins can manage members"
  ON organization_members FOR ALL TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin') AND status = 'active'
    )
  );

-- designers RLS（更新）
DROP POLICY IF EXISTS "Authenticated users can view designers" ON designers;
DROP POLICY IF EXISTS "Org members can view designers" ON designers;
CREATE POLICY "Org members can view designers"
  ON designers FOR SELECT TO authenticated
  USING (
    organization_id IS NULL  -- 既存データ対応
    OR organization_id = get_user_organization_id()
  );

DROP POLICY IF EXISTS "Org members can manage designers" ON designers;
CREATE POLICY "Org members can manage designers"
  ON designers FOR ALL TO authenticated
  USING (
    organization_id IS NULL
    OR organization_id = get_user_organization_id()
  );

-- projects RLS（更新）
DROP POLICY IF EXISTS "Authenticated users can view projects" ON projects;
DROP POLICY IF EXISTS "Org members can view projects" ON projects;
CREATE POLICY "Org members can view projects"
  ON projects FOR SELECT TO authenticated
  USING (
    organization_id IS NULL
    OR organization_id = get_user_organization_id()
  );

DROP POLICY IF EXISTS "Org members can manage projects" ON projects;
CREATE POLICY "Org members can manage projects"
  ON projects FOR ALL TO authenticated
  USING (
    organization_id IS NULL
    OR organization_id = get_user_organization_id()
  );

-- =====================================================
-- PART 8: 招待トークンテーブル
-- =====================================================
CREATE TABLE IF NOT EXISTS invitations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT DEFAULT 'member',
  token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  invited_by UUID REFERENCES auth.users(id),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '7 days'),
  used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email);

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage invitations" ON invitations;
CREATE POLICY "Admins can manage invitations"
  ON invitations FOR ALL TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin') AND status = 'active'
    )
  );

-- 招待を公開で読める（トークン認証用）
DROP POLICY IF EXISTS "Anyone can view invitations by token" ON invitations;
CREATE POLICY "Anyone can view invitations by token"
  ON invitations FOR SELECT TO anon, authenticated
  USING (token IS NOT NULL AND expires_at > NOW() AND used_at IS NULL);

-- =====================================================
-- PART 9: 監査ログテーブル
-- =====================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_org ON audit_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view audit logs" ON audit_logs;
CREATE POLICY "Admins can view audit logs"
  ON audit_logs FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin') AND status = 'active'
    )
  );

-- =====================================================
-- PART 10: 組織作成関数（サインアップ時に使用）
-- =====================================================
CREATE OR REPLACE FUNCTION create_organization_with_owner(
  org_name TEXT,
  org_slug TEXT,
  owner_email TEXT,
  owner_user_id UUID
)
RETURNS UUID AS $$
DECLARE
  new_org_id UUID;
  new_sub_id UUID;
BEGIN
  -- 組織を作成
  INSERT INTO organizations (name, slug, email)
  VALUES (org_name, org_slug, owner_email)
  RETURNING id INTO new_org_id;

  -- サブスクリプションを作成（トライアル）
  INSERT INTO subscriptions (organization_id, plan_type, status)
  VALUES (new_org_id, 'starter', 'trial')
  RETURNING id INTO new_sub_id;

  -- オーナーとして登録
  INSERT INTO organization_members (organization_id, user_id, email, role, status, joined_at)
  VALUES (new_org_id, owner_user_id, owner_email, 'owner', 'active', NOW());

  RETURN new_org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- PART 11: スーパーアドミンテーブル（ArchiDeck運営用）
-- =====================================================
CREATE TABLE IF NOT EXISTS super_admins (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- スーパーアドミン判定関数
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM super_admins WHERE user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- スーパーアドミン用ポリシー（全データ閲覧可能）
DROP POLICY IF EXISTS "Super admins can view all organizations" ON organizations;
CREATE POLICY "Super admins can view all organizations"
  ON organizations FOR SELECT TO authenticated
  USING (is_super_admin());

DROP POLICY IF EXISTS "Super admins can manage all organizations" ON organizations;
CREATE POLICY "Super admins can manage all organizations"
  ON organizations FOR ALL TO authenticated
  USING (is_super_admin());

-- =====================================================
-- PART 12: 使用量トラッキングテーブル
-- =====================================================
CREATE TABLE IF NOT EXISTS usage_stats (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  month DATE NOT NULL,  -- YYYY-MM-01

  -- カウント
  users_count INTEGER DEFAULT 0,
  projects_count INTEGER DEFAULT 0,
  storage_bytes BIGINT DEFAULT 0,
  api_calls INTEGER DEFAULT 0,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(organization_id, month)
);

CREATE INDEX IF NOT EXISTS idx_usage_stats_org ON usage_stats(organization_id);

ALTER TABLE usage_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own usage" ON usage_stats;
CREATE POLICY "Users can view own usage"
  ON usage_stats FOR SELECT TO authenticated
  USING (
    organization_id = get_user_organization_id()
    OR is_super_admin()
  );

-- =====================================================
-- 確認クエリ
-- =====================================================
SELECT '=== ArchiDeck v4.0 SaaS マルチテナント対応 完了 ===' as result;
SELECT '=== 新規テーブル ===' as section;
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('organizations', 'subscriptions', 'plans', 'organization_members', 'invitations', 'audit_logs', 'super_admins', 'usage_stats')
ORDER BY table_name;

SELECT '=== プラン一覧 ===' as section;
SELECT name, slug, price_monthly, max_users, max_projects FROM plans ORDER BY display_order;
