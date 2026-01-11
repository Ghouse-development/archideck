-- =====================================================
-- 名称の揺らぎを統一
-- =====================================================

-- 1. ダンパー/evoltzテンプレートの会社名を統一
-- 「千博産業株式会社」→「株式会社evoltz」
UPDATE email_templates
SET
  display_name = 'ダンパー配置依頼（evoltz）',
  company = '株式会社evoltz'
WHERE template_id = 'senpaku';

-- 2. template_vendorsのevoltz業者を更新
UPDATE template_vendors
SET company = '株式会社evoltz'
WHERE vendor_id = 'evoltz';

-- 3. vendors_v2テーブルがある場合も更新
UPDATE vendors_v2
SET company = '株式会社evoltz'
WHERE company LIKE '%千博%' OR company LIKE '%evoltz%';

-- 4. vendor_categoriesのエボルツ表記を統一（evoltzに）
UPDATE vendor_categories
SET name = 'evoltz'
WHERE name = 'エボルツ';

-- 5. tasksテーブルの表示名を統一
UPDATE tasks
SET task_name = 'evoltz依頼'
WHERE task_key = 'evoltz';

-- =====================================================
-- 完了！
-- =====================================================
