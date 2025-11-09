-- =====================================================
-- 全ての状態を確認するSQL
-- =====================================================

-- 1. designersテーブルのデータ確認
SELECT '=== DESIGNERS テーブル ===' as section;
SELECT COUNT(*) as total_count FROM designers;
SELECT category, COUNT(*) as count FROM designers GROUP BY category;
SELECT * FROM designers ORDER BY category, name LIMIT 5;

-- 2. RLS状態確認
SELECT '=== RLS状態 ===' as section;
SELECT tablename, rowsecurity FROM pg_tables
WHERE tablename IN ('designers', 'projects', 'email_templates', 'template_vendors', 'task_template_mappings');

-- 3. ポリシー確認
SELECT '=== ポリシー ===' as section;
SELECT tablename, policyname, roles, cmd, qual FROM pg_policies
WHERE tablename IN ('designers', 'projects', 'email_templates', 'template_vendors', 'task_template_mappings')
ORDER BY tablename, policyname;

-- 4. email_templatesテーブル確認
SELECT '=== EMAIL TEMPLATES ===' as section;
SELECT COUNT(*) as total_count FROM email_templates;
SELECT template_id, subject FROM email_templates;

-- 5. template_vendorsテーブル確認
SELECT '=== TEMPLATE VENDORS ===' as section;
SELECT COUNT(*) as total_count FROM template_vendors;

-- 6. projectsテーブル確認
SELECT '=== PROJECTS ===' as section;
SELECT COUNT(*) as total_count FROM projects;
