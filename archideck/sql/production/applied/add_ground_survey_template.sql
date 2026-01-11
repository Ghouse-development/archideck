-- =====================================================
-- 地盤調査テンプレートの追加
-- =====================================================

-- 地盤調査テンプレート（複数業者選択）
INSERT INTO email_templates (template_id, display_name, category, company, contact, email, subject_format, template_text, has_special_content, has_sub_options, default_special_content, created_by)
VALUES
  ('ground_survey', '地盤調査依頼', '設計', '地盤調査業者', '', '',
   '{customerName}様邸　地盤調査依頼　期日{dueDate}',
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
Gハウス 設計部
{staffName}
──────────────────────────',
   false, true, NULL, NULL)
ON CONFLICT (template_id) DO NOTHING;

-- 地盤調査業者（エリア別）
INSERT INTO template_vendors (template_id, vendor_id, company, contact, tel, email, created_by)
VALUES
  ('ground_survey', 'soilgiken', '株式会社ソイル技建', '前田様', '090-4034-9110', 'maeda@soilgiken.com', NULL),
  ('ground_survey', 'shinseijuki', '新生重機建設株式会社', '神田様', '072-729-4355', 'kanda@shinseijuki.co.jp', NULL),
  ('ground_survey', 'mplanning', 'エム・プランニング株式会社', '遠藤様', '090-8539-8889', 'endou@mp-ss.jp', NULL)
ON CONFLICT (template_id, vendor_id) DO NOTHING;

-- タスクマッピングを追加
INSERT INTO task_template_mappings (task_key, template_id)
VALUES ('ground_survey', 'ground_survey')
ON CONFLICT (task_key) DO NOTHING;

-- =====================================================
-- 完了！
-- =====================================================
