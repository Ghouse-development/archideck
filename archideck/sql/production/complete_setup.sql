-- ====================================================
-- 完全セットアップSQL - これ1つで全て解決
-- Supabase SQLエディタで実行してください
-- =====================================================

-- ステップ1: RLSを完全に無効化
ALTER TABLE designers DISABLE ROW LEVEL SECURITY;
ALTER TABLE projects DISABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates DISABLE ROW LEVEL SECURITY;
ALTER TABLE template_vendors DISABLE ROW LEVEL SECURITY;
ALTER TABLE task_template_mappings DISABLE ROW LEVEL SECURITY;

-- ステップ2: 全ポリシーを削除
DROP POLICY IF EXISTS "designers_select_policy" ON designers;
DROP POLICY IF EXISTS "designers_anon_select" ON designers;
DROP POLICY IF EXISTS "projects_select_policy" ON projects;
DROP POLICY IF EXISTS "projects_insert_policy" ON projects;
DROP POLICY IF EXISTS "projects_update_policy" ON projects;
DROP POLICY IF EXISTS "projects_delete_policy" ON projects;
DROP POLICY IF EXISTS "email_templates_select_policy" ON email_templates;
DROP POLICY IF EXISTS "email_templates_anon_select" ON email_templates;
DROP POLICY IF EXISTS "template_vendors_select_policy" ON template_vendors;
DROP POLICY IF EXISTS "template_vendors_anon_select" ON template_vendors;
DROP POLICY IF EXISTS "task_template_mappings_select_policy" ON task_template_mappings;
DROP POLICY IF EXISTS "task_template_mappings_anon_select" ON task_template_mappings;

-- ステップ3: categoryカラムを追加（存在しない場合のみ）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'designers' AND column_name = 'category'
  ) THEN
    ALTER TABLE designers ADD COLUMN category TEXT DEFAULT '設計';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_designers_category ON designers(category);

-- ステップ4: 設計担当者データ挿入（19名）
INSERT INTO designers (name, email, category) VALUES
  ('箕浦 三四郎', 'minoura-s@g-house.osaka.jp', '設計'),
  ('林 恭生', 'hayashi-t@g-house.osaka.jp', '設計'),
  ('田中 聡', 'ts@g-house.osaka.jp', '設計'),
  ('北村 晃平', 'kitamura-k@g-house.osaka.jp', '設計'),
  ('高濱 洋文', 'takahama-h@g-house.osaka.jp', '設計'),
  ('足立 雅哉', 'adachi-m@g-house.osaka.jp', '設計'),
  ('内藤 智之', 'naito-s@g-house.osaka.jp', '設計'),
  ('荘野 善宏', 'shono-y@g-house.osaka.jp', '設計'),
  ('若狹 龍成', 'wakasa-r@g-house.osaka.jp', '設計'),
  ('石井 義信', 'ishii-y@g-house.osaka.jp', '設計'),
  ('柳川 奈緒', 'yn@g-house.osaka.jp', 'IC'),
  ('西川 由佳', 'ny@g-house.osaka.jp', 'IC'),
  ('古久保 知佳子', 'furukubo-c@g-house.osaka.jp', 'IC'),
  ('島田 真奈', 'shimada-m@g-house.osaka.jp', 'IC'),
  ('吉川 侑希', 'yoshikawa-y@g-house.osaka.jp', 'IC'),
  ('中川 千尋', 'nakagawa-c@g-house.osaka.jp', 'IC'),
  ('今村 珠梨', 'imamura-s@g-house.osaka.jp', 'IC'),
  ('浦川 千夏', 'urakawa-c@g-house.osaka.jp', 'IC'),
  ('森永 凪子', 'morinaga-n@g-house.osaka.jp', 'IC')
ON CONFLICT (email) DO UPDATE SET category = EXCLUDED.category;

-- ステップ5: メールテンプレート挿入（8件）
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
   true, true, NULL, NULL)
ON CONFLICT (template_id) DO NOTHING;

-- ステップ6: 業者情報挿入（18社）
-- 給排水設備業者（10社）
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
  ('plumbing', 'katagi', '株式会社樫儀設備', '泉本さま', '080-1479-5838', 'katagisetsubi@gmail.com', NULL)
ON CONFLICT (template_id, vendor_id) DO NOTHING;

-- IC: 照明プラン（4社）
INSERT INTO template_vendors (template_id, vendor_id, company, contact, tel, email, created_by)
VALUES
  ('ic_lighting', 'odelic', 'オーデリック株式会社', '伊藤 美由紀 様', '080-1006-1562', 'myito@odelic.co.jp', NULL),
  ('ic_lighting', 'daiko', '大光電機株式会社', '石井 大輝 様', '090-4301-6438', 'daiki_ishii@lighting-daiko.co.jp', NULL),
  ('ic_lighting', 'koizumi', 'コイズミ照明株式会社', '吉岡 まひろ 様', '080-2437-2623', 'ma-yoshioka@koizumi.co.jp', NULL),
  ('ic_lighting', 'panasonic', 'パナソニック（エレクトリックワークス社）', '中 知美 様', '090-3280-7300', 'naka.tomomi@jp.panasonic.com', NULL)
ON CONFLICT (template_id, vendor_id) DO NOTHING;

-- IC: 設備PB・見積（4社）
INSERT INTO template_vendors (template_id, vendor_id, company, contact, tel, email, created_by)
VALUES
  ('ic_equipment_pb', 'panasonic', 'パナソニックリビング近畿株式会社', '瀬尾 様', '070-782-4226', 'seo.ayumi@jp.panasonic.com', NULL),
  ('ic_equipment_pb', 'takaden', 'タカラスタンダード（株式会社たけでん）', '大西 大 様', '080-2468-1924', 'ohnishi@takeden.co.jp', NULL),
  ('ic_equipment_pb', 'daiman', '株式会社大萬（TOTO）', '中野 祐一朗 様', '080-3842-4687', 'y.nakano@kk-daiman.co.jp', NULL),
  ('ic_equipment_pb', 'lixil', '株式会社クワタ（LIXIL）', '中野 遼 様', '070-6947-1233', 'ryo.nakano@lixil.com', NULL)
ON CONFLICT (template_id, vendor_id) DO NOTHING;

-- ステップ7: タスク-テンプレート紐づけ（5件）
INSERT INTO task_template_mappings (task_key, template_id)
VALUES
  ('ventilation', 'panasonic'),
  ('plumbing', 'plumbing'),
  ('sash', 'ogura'),
  ('solar', 'senpaku'),
  ('evoltz', 'senpaku')
ON CONFLICT (task_key) DO NOTHING;

-- ステップ8: 結果確認
SELECT '=== 最終確認 ===' as section;

SELECT 'RLS状態' as check_item, tablename, rowsecurity
FROM pg_tables
WHERE tablename IN ('designers', 'projects', 'email_templates', 'template_vendors', 'task_template_mappings')
ORDER BY tablename;

SELECT 'designersデータ' as check_item, COUNT(*) as total FROM designers;
SELECT 'カテゴリ別' as check_item, category, COUNT(*) as count FROM designers GROUP BY category ORDER BY category;
SELECT 'メールテンプレート' as check_item, COUNT(*) as total FROM email_templates;
SELECT 'メールテンプレート詳細' as check_item, category, COUNT(*) as count FROM email_templates GROUP BY category ORDER BY category;
SELECT '業者データ' as check_item, COUNT(*) as total FROM template_vendors;
SELECT 'タスクマッピング' as check_item, COUNT(*) as total FROM task_template_mappings;

SELECT '✅ セットアップ完了！ブラウザをリロードしてください。' as result;
