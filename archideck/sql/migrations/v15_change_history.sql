-- v15: 変更履歴テーブル（7日間保持）
-- 実行日: 2026-01-17

-- 変更履歴テーブル
CREATE TABLE IF NOT EXISTS change_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_name VARCHAR(100),        -- 変更したユーザー名
  change_type VARCHAR(50),       -- 'task_update', 'project_update', 'archive', etc.
  field_name VARCHAR(100),       -- 変更されたフィールド名
  old_value TEXT,                -- 変更前の値
  new_value TEXT,                -- 変更後の値
  description TEXT,              -- 変更の説明
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 検索用インデックス
CREATE INDEX IF NOT EXISTS idx_change_history_project_id ON change_history(project_id);
CREATE INDEX IF NOT EXISTS idx_change_history_created_at ON change_history(created_at);
CREATE INDEX IF NOT EXISTS idx_change_history_user_name ON change_history(user_name);

-- 7日以上経過した履歴を自動削除するための関数
CREATE OR REPLACE FUNCTION cleanup_old_change_history()
RETURNS void AS $$
BEGIN
  DELETE FROM change_history
  WHERE created_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

-- RLSを有効化（認証ユーザーのみアクセス可能）
ALTER TABLE change_history ENABLE ROW LEVEL SECURITY;

-- 認証済みユーザーは閲覧・挿入可能
CREATE POLICY "Allow authenticated users to read change_history"
ON change_history FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Allow authenticated users to insert change_history"
ON change_history FOR INSERT
TO authenticated
WITH CHECK (true);

-- コメント
COMMENT ON TABLE change_history IS '変更履歴（7日間保持）';
COMMENT ON COLUMN change_history.change_type IS 'task_update, project_update, archive, status_change等';

-- ============================================
-- 既存データの「無」→「無し」統一
-- ============================================
-- progressカラム内のJSONBデータを更新
-- 注意: このクエリは全案件のprogressを更新するため、バックアップを推奨

-- 「無」を「無し」に置換する関数
CREATE OR REPLACE FUNCTION replace_mu_in_progress()
RETURNS void AS $$
DECLARE
  proj RECORD;
  updated_progress JSONB;
  task_key TEXT;
  task_data JSONB;
BEGIN
  FOR proj IN SELECT id, progress FROM projects WHERE progress IS NOT NULL LOOP
    updated_progress := proj.progress;

    FOR task_key IN SELECT jsonb_object_keys(proj.progress) LOOP
      task_data := proj.progress->task_key;

      -- stateが「無」の場合、「無し」に変更
      IF task_data->>'state' = '無' THEN
        updated_progress := jsonb_set(
          updated_progress,
          ARRAY[task_key, 'state'],
          '"無し"'::jsonb
        );
      END IF;
    END LOOP;

    -- 更新があった場合のみUPDATE
    IF updated_progress != proj.progress THEN
      UPDATE projects SET progress = updated_progress WHERE id = proj.id;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 実行（コメントを外して実行）
-- SELECT replace_mu_in_progress();
