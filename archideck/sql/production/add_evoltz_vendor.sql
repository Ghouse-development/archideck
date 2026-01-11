-- =====================================================
-- evoltz業者を登録
-- =====================================================

-- senpaku(ダンパー)テンプレートに業者を追加
INSERT INTO template_vendors (template_id, vendor_id, company, contact, tel, email, created_by)
VALUES
  ('senpaku', 'evoltz', '株式会社evoltz', 'ご担当者様', '', 'evoltz@chihiro.co.jp', NULL)
ON CONFLICT (template_id, vendor_id) DO UPDATE SET
  company = EXCLUDED.company,
  contact = EXCLUDED.contact,
  email = EXCLUDED.email;

-- =====================================================
-- 完了！
-- =====================================================
