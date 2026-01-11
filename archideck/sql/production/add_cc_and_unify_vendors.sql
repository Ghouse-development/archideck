-- =====================================================
-- CC機能追加 & 全業者をtemplate_vendors経由に統一
-- =====================================================

-- 1. template_vendorsテーブルにCC列を追加
ALTER TABLE template_vendors ADD COLUMN IF NOT EXISTS cc_email TEXT;

-- 2. サッシ（ogura）業者を追加
INSERT INTO template_vendors (template_id, vendor_id, company, contact, tel, email, cc_email, created_by)
VALUES (
  'ogura',
  'ogura_sundine',
  '小倉サンダイン株式会社',
  '井上様',
  '',
  's_inoue@ogura-sundine.com',
  's.noma@ogura-sundine.com; ju-taku9@ogura-sundine.com',
  NULL
)
ON CONFLICT (template_id, vendor_id) DO UPDATE SET
  company = EXCLUDED.company,
  contact = EXCLUDED.contact,
  email = EXCLUDED.email,
  cc_email = EXCLUDED.cc_email;

-- 3. 換気（panasonic）業者を追加
INSERT INTO template_vendors (template_id, vendor_id, company, contact, tel, email, cc_email, created_by)
VALUES (
  'panasonic',
  'panasonic_kinki',
  'パナソニックリビング近畿株式会社',
  '北浦様',
  '',
  'kitaura.seiga@jp.panasonic.com',
  NULL,
  NULL
)
ON CONFLICT (template_id, vendor_id) DO UPDATE SET
  company = EXCLUDED.company,
  contact = EXCLUDED.contact,
  email = EXCLUDED.email,
  cc_email = EXCLUDED.cc_email;

-- 4. ダンパー（senpaku/evoltz）業者を追加
INSERT INTO template_vendors (template_id, vendor_id, company, contact, tel, email, cc_email, created_by)
VALUES (
  'senpaku',
  'evoltz',
  '株式会社evoltz',
  'ご担当者様',
  '',
  'evoltz@chihiro.co.jp',
  NULL,
  NULL
)
ON CONFLICT (template_id, vendor_id) DO UPDATE SET
  company = EXCLUDED.company,
  contact = EXCLUDED.contact,
  email = EXCLUDED.email,
  cc_email = EXCLUDED.cc_email;

-- 5. テンプレートのhas_sub_optionsをtrueに変更（業者選択UIを有効化）
UPDATE email_templates
SET has_sub_options = true
WHERE template_id IN ('ogura', 'panasonic', 'senpaku');

-- =====================================================
-- 完了！
-- =====================================================
