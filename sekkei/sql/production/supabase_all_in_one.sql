-- =====================================================
-- 設計・IC業務管理システム v2.0
-- オールインワン セットアップSQL
-- =====================================================

-- =====================================================
-- PART 1: テーブル削除（クリーンインストール用）
-- =====================================================
DROP TABLE IF EXISTS task_template_mappings CASCADE;
DROP TABLE IF EXISTS template_vendors CASCADE;
DROP TABLE IF EXISTS email_templates CASCADE;
DROP TABLE IF EXISTS projects CASCADE;
DROP TABLE IF EXISTS designers CASCADE;

-- =====================================================
-- PART 2: テーブル作成
-- =====================================================

-- 1. 設計士テーブル
CREATE TABLE designers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  email TEXT UNIQUE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. 案件テーブル
CREATE TABLE projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  uid TEXT UNIQUE NOT NULL,
  customer TEXT NOT NULL,
  assigned_to TEXT NOT NULL,
  designer_id UUID REFERENCES designers(id) ON DELETE SET NULL,
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

-- 4. テンプレート業者情報テーブル
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

-- =====================================================
-- PART 3: インデックス作成
-- =====================================================
CREATE INDEX idx_projects_assigned_to ON projects(assigned_to);
CREATE INDEX idx_projects_designer_id ON projects(designer_id);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_customer ON projects(customer);
CREATE INDEX idx_projects_created_by ON projects(created_by);
CREATE INDEX idx_designers_email ON designers(email);
CREATE INDEX idx_email_templates_category ON email_templates(category);
CREATE INDEX idx_template_vendors_template_id ON template_vendors(template_id);
CREATE INDEX idx_task_mappings_task_key ON task_template_mappings(task_key);

-- =====================================================
-- PART 4: RLS有効化
-- =====================================================
ALTER TABLE designers ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_template_mappings ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- PART 5: RLSポリシー（認証済みユーザーのみ）
-- =====================================================

-- designers
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
  USING (true);

CREATE POLICY "Authenticated users can delete designers"
  ON designers FOR DELETE
  TO authenticated
  USING (true);

-- projects
DROP POLICY IF EXISTS "Authenticated users can view projects" ON projects;
DROP POLICY IF EXISTS "Authenticated users can insert projects" ON projects;
DROP POLICY IF EXISTS "Authenticated users can update projects" ON projects;
DROP POLICY IF EXISTS "Authenticated users can delete projects" ON projects;

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

CREATE POLICY "Authenticated users can insert projects"
  ON projects FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update projects"
  ON projects FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete projects"
  ON projects FOR DELETE
  TO authenticated
  USING (true);

-- email_templates
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
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update email_templates"
  ON email_templates FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete email_templates"
  ON email_templates FOR DELETE
  TO authenticated
  USING (true);

-- template_vendors
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
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update template_vendors"
  ON template_vendors FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete template_vendors"
  ON template_vendors FOR DELETE
  TO authenticated
  USING (true);

-- task_template_mappings
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
  USING (true);

CREATE POLICY "Authenticated users can delete task_template_mappings"
  ON task_template_mappings FOR DELETE
  TO authenticated
  USING (true);

-- =====================================================
-- PART 6: トリガー（自動更新日時）
-- =====================================================
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

-- =====================================================
-- PART 7: 初期データ投入
-- =====================================================

-- 設計担当者とIC担当者の追加
INSERT INTO designers (name, email) VALUES
  -- 設計担当
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
  -- IC担当
  ('柳川 奈緒', 'yn@g-house.osaka.jp'),
  ('西川 由佳', 'ny@g-house.osaka.jp'),
  ('古久保 知佳子', 'furukubo-c@g-house.osaka.jp'),
  ('島田 真奈', 'shimada-m@g-house.osaka.jp'),
  ('吉川 侑希', 'yoshikawa-y@g-house.osaka.jp'),
  ('中川 千尋', 'nakagawa-c@g-house.osaka.jp'),
  ('今村 珠梨', 'imamura-s@g-house.osaka.jp'),
  ('浦川 千夏', 'urakawa-c@g-house.osaka.jp'),
  ('森永 凪子', 'morinaga-n@g-house.osaka.jp');

-- メールテンプレートの挿入
INSERT INTO email_templates (template_id, display_name, category, company, contact, email, subject_format, template_text, has_special_content, has_sub_options, default_special_content, created_by)
VALUES
  ('panasonic', 'パナソニックリビング近畿（換気図面）', '設計', 'パナソニックリビング近畿株式会社', '北浦さま', 'kitaura.seiga@jp.panasonic.com',
   '{customerName}様 新規換気図面作成依頼　期日{dueDate}',
   '{company}
{contact}

いつもお世話になっております。
新規換気図面作成お願いいたします。
詳細下記参照お願いいたします。

【お客様名】　{customerName}
【　内容　】　新規換気図面作成依頼
【　期日　】　{dueDate}',
   false, false, NULL, NULL),

  ('plumbing', '給排水設備業者（給排水設備図面）', '設計', '給排水設備業者', '', '',
   '{customerName}様邸　新規給排水設備経路図作成依頼　期日{dueDate}中',
   '{company}
{contact}

いつもお世話になっております。
新規給排水設備経路図作成をお願いいたします。
詳細下記参照お願いいたします。

【お客様名】　{customerName}
【　内容　】　新規給排水設備経路図作成依頼
【　期日　】　{dueDate}
作成の際に**凡例の記載**も合わせてお願いいたします。',
   false, true, NULL, NULL),

  ('ogura', '小倉サンダイン（サッシプレゼン）', '設計', '小倉サンダイン株式会社', '井上さま
野間さま
金ケ江さま', 's_inoue@ogura-sundine.com; s.noma@ogura-sundine.com; ju-taku9@ogura-sundine.com',
   '{customerName}様邸　新規サッシプレゼン作成依頼　期日{dueDate}',
   '{company}
{contact}

いつもお世話になっております。
新規サッシプレゼン関係作成お願いいたします。
詳細下記参照お願いいたします。
法22条地域になります。

【お客様名】　{customerName}
【　内容　】　{specialContent}
【　期日　】　{dueDate}',
   true, false, 'サッシプレゼン、開口部リスト、玄関プレゼン(C10　カームブラック)', NULL),

  ('senpaku', '千博産業（evoltz配置図）', '設計', '千博産業株式会社', 'ご担当者様', 'evoltz@chihiro.co.jp',
   '{customerName}様 新規evoltz配置図作成依頼　期日{dueDate}',
   '{company}
{contact}

いつもお世話になっております。
新規evoltz配置図作成お願いいたします。
詳細下記参照お願いいたします。

【お客様名】　{customerName}
【　内容　】　新規evoltz配置図作成依頼
【　期日　】　{dueDate}中',
   false, false, NULL, NULL),

  ('ic_panasonic_tategu', '建具プレゼン・見積（Panasonic 近畿）', 'IC', 'パナソニックリビング近畿株式会社', '堤 様
（CC）北浦 星河 様', 'tsutsumi.yoshiaki@jp.panasonic.com; kitaura.seiga@jp.panasonic.com',
   '{customerName}様邸　建具プレゼン・見積作成依頼　期日{dueDate}',
   '{company}
{contact}

お世話になっております。
株式会社Gハウス　設計部ICの{staffName}と申します。

【新規依頼】{customerName}
【納期希望】{dueDate}

建具プレゼン・見積の作成をお願いいたします。

{specialContent}',
   true, false, NULL, NULL),

  ('ic_lighting', '照明プラン（まとめ：ODELIC/DAIKO/KOIZUMI/Panasonic）', 'IC', '照明メーカー各社', '', '',
   '{customerName}様邸　照明プラン作成依頼　期日{dueDate}',
   '{company}
{contact}

お世話になっております。
株式会社Gハウス　設計部ICの{staffName}と申します。

【新規物件】{customerName}
【希望納期】{dueDate}

下記お客様からのご要望になります。
{specialContent}

お忙しいところ恐れ入りますが、よろしくお願いいたします。',
   true, true, NULL, NULL),

  ('ic_ncraft_iron', 'アイアン階段・手摺（Nくらふと）', 'IC', '株式会社Nくらふと', '中村 様', 'info@n-craft.net',
   '{customerName}様邸　アイアン階段／手摺　見積・図面作成依頼　期日{dueDate}',
   '{company}
{contact}

お世話になっております。
株式会社Gハウス　設計部ICの{staffName}と申します。

【新規物件】{customerName}
【納期希望】{dueDate}

見積・図面の作成をお願い致します。
あわせてJWデータもいただけますと幸いです。

【階高】2980㎜
【階段】15段 ひな壇階段
【共通】中桟1本（ブラック）
（1）階段手摺（3段目〜8段目）
（2）吹き抜け部 手摺

{specialContent}

お忙しいところ恐れ入りますが、よろしくお願いいたします。',
   true, false, NULL, NULL),

  ('ic_equipment_pb', '設備PB・見積（まとめ：Panasonic/タカラスタンダード/TOTO/LIXIL）', 'IC', '設備メーカー各社', '', '',
   '{customerName}様邸　設備PB見積作成依頼　期日{dueDate}',
   '{company}
{contact}

お世話になっております。
株式会社Gハウス　設計部ICの{staffName}と申します。

【物件名】{customerName}
【希望納期】{dueDate}

設備PB、お見積りの作成をお願いいたします。
添付資料のご確認をお願いいたします。

{specialContent}

お忙しいところ恐れ入りますが、よろしくお願いいたします。',
   true, true, NULL, NULL);

-- 給排水設備業者のサブオプション
INSERT INTO template_vendors (template_id, vendor_id, company, contact, tel, email, created_by)
VALUES
  ('plumbing', 'spacebuild', '株式会社スペースビルド', '冨阪さま', '090 1144 9504', 'spacetomisaka@carol.ocn.ne.jp', NULL),
  ('plumbing', 'daigo', '株式会社　大五', '村田さま', '090 1223 6957', 'murata-n@daigo-inc.co.jp', NULL),
  ('plumbing', 'kokoro', '株式会社こころ建築工房', '吉岡さま', '090-6207-6659', 'h.yoshioka_839@nz-gp.com', NULL),
  ('plumbing', 'rivu', '株式会社リヴ匠建設', '別役さま', '080-3845-1839', 'becchaku@takumi-kyoto.co.jp', NULL),
  ('plumbing', 'daikou', '大光建設株式会社', '南岡さま', '090-1597-3656', 'nobuyuki@daikou-co.jp', NULL),
  ('plumbing', 'senmon', '株式会社　専門設備', '村田さま', '090-5667-7750', 'senmonsetubi6260@hera.eonet.ne.jp', NULL),
  ('plumbing', 'hirata', '株式会社　平田設備工産', '林さま', '090-2196-2687', 'h.hayashi@eco.ocn.ne.jp', NULL),
  ('plumbing', 'shinsei', '株式会社　シンセイ設備', '石川さま', '080-3031-3876', 'ishikawa@shinseisetubi.jp', NULL),
  ('plumbing', 'iwao', 'イワオ産業　株式会社', '大上さま', '080-2531-4718', 'iwaosan@vesta.ocn.ne.jp', NULL),
  ('plumbing', 'katagi', '株式会社樫儀設備', '泉本さま', '080-1479-5838', 'katagisetsubi@gmail.com', NULL);

-- IC: 照明プランのサブオプション
INSERT INTO template_vendors (template_id, vendor_id, company, contact, tel, email, created_by)
VALUES
  ('ic_lighting', 'odelic', 'オーデリック株式会社', '伊藤 美由紀 様', '080-1006-1562', 'myito@odelic.co.jp', NULL),
  ('ic_lighting', 'daiko', '大光電機株式会社', '石井 大輝 様', '090-4301-6438', 'daiki_ishii@lighting-daiko.co.jp', NULL),
  ('ic_lighting', 'koizumi', 'コイズミ照明株式会社', '吉岡 まひろ 様', '080-2437-2623', 'ma-yoshioka@koizumi.co.jp', NULL),
  ('ic_lighting', 'panasonic', 'パナソニック（エレクトリックワークス社）', '中 知美 様', '090-3280-7300', 'naka.tomomi@jp.panasonic.com', NULL);

-- IC: 設備PB・見積のサブオプション
INSERT INTO template_vendors (template_id, vendor_id, company, contact, tel, email, created_by)
VALUES
  ('ic_equipment_pb', 'panasonic', 'パナソニックリビング近畿株式会社', '瀬尾 様', '070-782-4226', 'seo.ayumi@jp.panasonic.com', NULL),
  ('ic_equipment_pb', 'takaden', 'タカラスタンダード（株式会社たけでん）', '大西 大 様', '080-2468-1924', 'ohnishi@takeden.co.jp', NULL),
  ('ic_equipment_pb', 'daiman', '株式会社大萬（TOTO）', '中野 祐一朗 様', '080-3842-4687', 'y.nakano@kk-daiman.co.jp', NULL),
  ('ic_equipment_pb', 'lixil', '株式会社クワタ（LIXIL）', '中野 遼 様', '070-6947-1233', 'ryo.nakano@lixil.com', NULL);

-- デフォルトのタスク-テンプレート紐づけ
INSERT INTO task_template_mappings (task_key, template_id)
VALUES
  ('ventilation', 'panasonic'),
  ('plumbing', 'plumbing'),
  ('sash', 'ogura'),
  ('solar', 'senpaku'),
  ('evoltz', 'senpaku');

-- =====================================================
-- セットアップ完了！
-- =====================================================
-- 次のステップ:
-- 1. Supabase Dashboard → Authentication → Email
-- 2. "Enable Email provider" をON
-- 3. "Confirm email" をOFFに設定（開発用）
-- 4. Users タブで admin@ghouse.jp ユーザーを手動作成
--    - Email: admin@ghouse.jp
--    - Password: Ghouse0648
-- =====================================================
