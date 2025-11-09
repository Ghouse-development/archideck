-- =====================================================
-- RLSポリシーを修正して全ユーザーがデータを取得できるようにする
-- =====================================================

-- 既存のポリシーを削除
DROP POLICY IF EXISTS "designers_select_policy" ON designers;
DROP POLICY IF EXISTS "projects_select_policy" ON projects;
DROP POLICY IF EXISTS "email_templates_select_policy" ON email_templates;
DROP POLICY IF EXISTS "template_vendors_select_policy" ON template_vendors;
DROP POLICY IF EXISTS "task_template_mappings_select_policy" ON task_template_mappings;

-- 新しいポリシー: 認証済みユーザーは全てのデータを閲覧可能
CREATE POLICY "designers_select_policy" ON designers
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "projects_select_policy" ON projects
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "projects_insert_policy" ON projects
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "projects_update_policy" ON projects
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "projects_delete_policy" ON projects
  FOR DELETE
  TO authenticated
  USING (true);

CREATE POLICY "email_templates_select_policy" ON email_templates
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "template_vendors_select_policy" ON template_vendors
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "task_template_mappings_select_policy" ON task_template_mappings
  FOR SELECT
  TO authenticated
  USING (true);

-- 確認
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
