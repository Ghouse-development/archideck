-- =====================================================
-- 全依頼テンプレート統合セットアップ
-- 5つの依頼タイプ: サッシ、ダンパー、換気、地盤調査、給排水
-- =====================================================

-- =====================================================
-- 1. サッシプレゼン・開口部リスト依頼 (ogura)
-- =====================================================
INSERT INTO email_templates (template_id, display_name, category, company, contact, email, subject_format, template_text, has_special_content, has_sub_options, default_special_content, created_by)
VALUES (
  'ogura',
  'サッシプレゼン・開口部リスト依頼（小倉サンダイン）',
  '設計',
  '小倉サンダイン株式会社',
  '井上様
野間様
金ケ江様',
  's_inoue@ogura-sundine.com; s.noma@ogura-sundine.com; ju-taku9@ogura-sundine.com',
  '【サッシプレゼン・開口部リスト作成依頼】{customerName}様邸',
  '{company}
{contact}

いつもお世話になっております。
Gハウス設計の{staffName}です。

下記物件のサッシプレゼン・開口部リスト作成をお願いいたします。

━━━━━━━━━━━━━━━━━━━━━━━━
■ 依頼内容
━━━━━━━━━━━━━━━━━━━━━━━━
【物件名】　{customerName}様邸
【期日】　　{dueDate}
【内容】　　新規サッシプレゼン・開口部リスト依頼
【地域】　　{region}
【玄関ドア】{entranceDoor}
【サッシ色】{sashColor}

━━━━━━━━━━━━━━━━━━━━━━━━
■ 添付図面
━━━━━━━━━━━━━━━━━━━━━━━━
・配置図
・平面図（サッシ記号入り）
・立面図
※高所用すべり出し窓の場合は開閉仕様を記載しております

━━━━━━━━━━━━━━━━━━━━━━━━

お忙しいところ恐れ入りますが、
ご確認のほどよろしくお願いいたします。

──────────────────────────
株式会社Gハウス
設計部　{staffName}
TEL: {staffPhone}
Email: {staffEmail}
──────────────────────────',
  true,
  false,
  '準防火地域',
  NULL
)
ON CONFLICT (template_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  company = EXCLUDED.company,
  contact = EXCLUDED.contact,
  email = EXCLUDED.email,
  subject_format = EXCLUDED.subject_format,
  template_text = EXCLUDED.template_text,
  has_special_content = EXCLUDED.has_special_content,
  default_special_content = EXCLUDED.default_special_content;

-- =====================================================
-- 2. ダンパー配置依頼 (senpaku/evoltz)
-- =====================================================
INSERT INTO email_templates (template_id, display_name, category, company, contact, email, subject_format, template_text, has_special_content, has_sub_options, default_special_content, created_by)
VALUES (
  'senpaku',
  'ダンパー配置依頼（evoltz）',
  '設計',
  '株式会社evoltz',
  'ご担当者様',
  'evoltz@chihiro.co.jp',
  '【ダンパー配置依頼】{customerName}様邸',
  '{company}
{contact}

いつもお世話になっております。
Gハウス設計の{staffName}です。

下記物件のダンパー配置検討をお願いいたします。

━━━━━━━━━━━━━━━━━━━━━━━━
■ 依頼内容
━━━━━━━━━━━━━━━━━━━━━━━━
【物件名】　{customerName}様邸
【内容】　　ダンパー配置検討依頼

━━━━━━━━━━━━━━━━━━━━━━━━
■ 添付図面
━━━━━━━━━━━━━━━━━━━━━━━━
・平面図
・立面図
・配置図（PDF）
・基礎伏図
・耐力壁図
・金物図

━━━━━━━━━━━━━━━━━━━━━━━━

配置図ご確認後、問題がなければ本設計をお願いいたします。

お忙しいところ恐れ入りますが、
ご確認のほどよろしくお願いいたします。

──────────────────────────
株式会社Gハウス
設計部　{staffName}
TEL: {staffPhone}
Email: {staffEmail}
──────────────────────────',
  false,
  false,
  NULL,
  NULL
)
ON CONFLICT (template_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  company = EXCLUDED.company,
  contact = EXCLUDED.contact,
  email = EXCLUDED.email,
  subject_format = EXCLUDED.subject_format,
  template_text = EXCLUDED.template_text,
  has_special_content = EXCLUDED.has_special_content;

-- =====================================================
-- 3. 換気システム依頼 (panasonic)
-- =====================================================
INSERT INTO email_templates (template_id, display_name, category, company, contact, email, subject_format, template_text, has_special_content, has_sub_options, default_special_content, created_by)
VALUES (
  'panasonic',
  '換気図面作成依頼（パナソニック）',
  '設計',
  'パナソニックリビング近畿株式会社',
  '北浦様',
  'kitaura.seiga@jp.panasonic.com',
  '【換気図面作成依頼】{customerName}様邸',
  '{company}
{contact}

いつもお世話になっております。
Gハウス設計の{staffName}です。

下記物件の換気図面作成をお願いいたします。

━━━━━━━━━━━━━━━━━━━━━━━━
■ 依頼内容
━━━━━━━━━━━━━━━━━━━━━━━━
【物件名】　{customerName}様邸
【期日】　　{dueDate}
【内容】　　新規換気図面作成依頼

━━━━━━━━━━━━━━━━━━━━━━━━
■ 添付図面
━━━━━━━━━━━━━━━━━━━━━━━━
・平面図
・立面図

※ファサードにフードが出ないようにお願いいたします
※外部フードはすべてFD付きでお願いいたします

━━━━━━━━━━━━━━━━━━━━━━━━

お忙しいところ恐れ入りますが、
ご確認のほどよろしくお願いいたします。

──────────────────────────
株式会社Gハウス
設計部　{staffName}
TEL: {staffPhone}
Email: {staffEmail}
──────────────────────────',
  false,
  false,
  NULL,
  NULL
)
ON CONFLICT (template_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  company = EXCLUDED.company,
  contact = EXCLUDED.contact,
  email = EXCLUDED.email,
  subject_format = EXCLUDED.subject_format,
  template_text = EXCLUDED.template_text,
  has_special_content = EXCLUDED.has_special_content;

-- =====================================================
-- 4. 地盤調査依頼 (ground_survey)
-- =====================================================
INSERT INTO email_templates (template_id, display_name, category, company, contact, email, subject_format, template_text, has_special_content, has_sub_options, default_special_content, created_by)
VALUES (
  'ground_survey',
  '地盤調査依頼',
  '設計',
  '地盤調査業者',
  '',
  '',
  '【地盤調査依頼】{customerName}様邸',
  '{company}
{contact}

いつもお世話になっております。
Gハウス設計の{staffName}です。

下記物件の地盤調査をお願いいたします。

━━━━━━━━━━━━━━━━━━━━━━━━
■ 依頼内容
━━━━━━━━━━━━━━━━━━━━━━━━
【物件名】　{customerName}様邸
【期日】　　{dueDate}
【内容】　　地盤調査依頼

━━━━━━━━━━━━━━━━━━━━━━━━
■ 添付図面
━━━━━━━━━━━━━━━━━━━━━━━━
・配置図（寸法記載あり）
・平面図
・立面図
・依頼書

━━━━━━━━━━━━━━━━━━━━━━━━

お忙しいところ恐れ入りますが、
ご確認のほどよろしくお願いいたします。

──────────────────────────
株式会社Gハウス
設計部　{staffName}
TEL: {staffPhone}
Email: {staffEmail}
──────────────────────────',
  false,
  true,
  NULL,
  NULL
)
ON CONFLICT (template_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  company = EXCLUDED.company,
  contact = EXCLUDED.contact,
  email = EXCLUDED.email,
  subject_format = EXCLUDED.subject_format,
  template_text = EXCLUDED.template_text,
  has_special_content = EXCLUDED.has_special_content,
  has_sub_options = EXCLUDED.has_sub_options;

-- 地盤調査業者（エリア別）
DELETE FROM template_vendors WHERE template_id = 'ground_survey';
INSERT INTO template_vendors (template_id, vendor_id, company, contact, tel, email, created_by)
VALUES
  ('ground_survey', 'soilgiken', '株式会社ソイル技建', '前田様', '090-4034-9110', 'maeda@soilgiken.com', NULL),
  ('ground_survey', 'shinseijuki', '新生重機建設株式会社', '神田様', '072-729-4355', 'kanda@shinseijuki.co.jp', NULL),
  ('ground_survey', 'mplanning', 'エム・プランニング株式会社', '遠藤様', '090-8539-8889', 'endou@mp-ss.jp', NULL);

-- =====================================================
-- 5. 外部給排水経路図依頼 (plumbing)
-- =====================================================
INSERT INTO email_templates (template_id, display_name, category, company, contact, email, subject_format, template_text, has_special_content, has_sub_options, default_special_content, created_by)
VALUES (
  'plumbing',
  '外部給排水経路図依頼',
  '設計',
  '給排水設備業者',
  '',
  '',
  '【外部給排水経路図作成依頼】{customerName}様邸',
  '{company}
{contact}

いつもお世話になっております。
Gハウス設計の{staffName}です。

下記物件の外部給排水経路図作成をお願いいたします。

━━━━━━━━━━━━━━━━━━━━━━━━
■ 依頼内容
━━━━━━━━━━━━━━━━━━━━━━━━
【物件名】　{customerName}様邸
【期日】　　{dueDate}
【内容】　　外部給排水経路図作成依頼
　・給水経路
　・汚水排水経路
　・雨水排水経路

━━━━━━━━━━━━━━━━━━━━━━━━
■ 添付図面
━━━━━━━━━━━━━━━━━━━━━━━━
・配置図
・平面図
・立面図
・契約時の見積

━━━━━━━━━━━━━━━━━━━━━━━━

お忙しいところ恐れ入りますが、
ご確認のほどよろしくお願いいたします。

──────────────────────────
株式会社Gハウス
設計部　{staffName}
TEL: {staffPhone}
Email: {staffEmail}
──────────────────────────',
  false,
  true,
  NULL,
  NULL
)
ON CONFLICT (template_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  company = EXCLUDED.company,
  contact = EXCLUDED.contact,
  email = EXCLUDED.email,
  subject_format = EXCLUDED.subject_format,
  template_text = EXCLUDED.template_text,
  has_special_content = EXCLUDED.has_special_content,
  has_sub_options = EXCLUDED.has_sub_options;

-- 給排水業者（ファブレス案件用 + 自社監督案件用）
DELETE FROM template_vendors WHERE template_id = 'plumbing';
INSERT INTO template_vendors (template_id, vendor_id, company, contact, tel, email, created_by)
VALUES
  -- ファブレス案件用業者
  ('plumbing', 'spacebuild', '株式会社スペースビルド', '冨阪様', '090-1144-9504', 'spacetomisaka@carol.ocn.ne.jp', NULL),
  ('plumbing', 'daigo', '株式会社大五', '村田様', '090-1223-6957', 'murata-n@daigo-inc.co.jp', NULL),
  ('plumbing', 'kokoro', '株式会社こころ建築工房', '吉岡様', '090-6207-6659', 'h.yoshioka_839@nz-gp.com', NULL),
  ('plumbing', 'livtakumi', '株式会社リヴ匠建設', '別役様', '080-3845-1839', 'becchaku@takumi-kyoto.co.jp', NULL),
  ('plumbing', 'daikou', '大光建設株式会社', '南岡様', '090-1597-3656', 'nobuyuki@daikou-co.jp', NULL),
  -- 自社監督案件用業者
  ('plumbing', 'senmon', '株式会社専門設備', '村田様', '090-5667-7750', 'senmonsetibi6260@hera.eonet.ne.jp', NULL),
  ('plumbing', 'hirata', '株式会社平田設備工産', '林様', '090-2196-2687', 'h.hayashi@eco.ocn.ne.jp', NULL),
  ('plumbing', 'shinsei', '株式会社シンセイ設備', '石川様', '080-3031-3876', 'ishikawa@shinseisetubi.jp', NULL),
  ('plumbing', 'iwao', 'イワオ産業株式会社', '大上様', '080-2531-4718', 'iwaosan@vesta.ocn.ne.jp', NULL),
  ('plumbing', 'kashigi', '株式会社樫儀設備', '泉本様', '080-1479-5838', 'katagisetsubi@gmail.com', NULL);

-- =====================================================
-- 6. タスクマッピング
-- =====================================================
INSERT INTO task_template_mappings (task_key, template_id)
VALUES
  ('sash_request', 'ogura'),
  ('damper_request', 'senpaku'),
  ('ventilation_request', 'panasonic'),
  ('ground_survey', 'ground_survey'),
  ('plumbing', 'plumbing')
ON CONFLICT (task_key) DO UPDATE SET template_id = EXCLUDED.template_id;

-- =====================================================
-- 完了！
-- =====================================================
