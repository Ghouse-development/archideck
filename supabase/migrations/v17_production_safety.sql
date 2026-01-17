-- v17_production_safety.sql
-- 本番投入前のセーフティ対応マイグレーション

-- 1. 論理削除用のdeleted_atカラムを追加
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 2. deleted_atにインデックスを追加（フィルタリング高速化）
CREATE INDEX IF NOT EXISTS idx_projects_deleted_at ON projects(deleted_at) WHERE deleted_at IS NOT NULL;

-- 3. kintone同期の最終成功時刻を記録（障害検知用）
ALTER TABLE kintone_settings ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ;
ALTER TABLE kintone_settings ADD COLUMN IF NOT EXISTS last_sync_status TEXT;
ALTER TABLE kintone_settings ADD COLUMN IF NOT EXISTS sync_error_count INTEGER DEFAULT 0;

-- 4. 監査ログの拡充（change_historyテーブルがある場合）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'change_history') THEN
    ALTER TABLE change_history ADD COLUMN IF NOT EXISTS tenant_id UUID;
    ALTER TABLE change_history ADD COLUMN IF NOT EXISTS user_ip INET;
    ALTER TABLE change_history ADD COLUMN IF NOT EXISTS old_data JSONB;
    ALTER TABLE change_history ADD COLUMN IF NOT EXISTS new_data JSONB;
    ALTER TABLE change_history ADD COLUMN IF NOT EXISTS changed_fields TEXT[];
  END IF;
END $$;

-- 5. designersテーブルにソフトデリート用カラム追加
ALTER TABLE designers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE designers ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- 6. プロジェクトの更新日時インデックス（リアルタイム同期高速化）
CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON projects(updated_at DESC);

-- 7. RLSポリシー確認用コメント
-- 注意: 本番投入前に以下を確認すること
-- - projects テーブルのRLSが有効か
-- - tenant_id による分離が正しく機能しているか
-- - kintone_settings が管理者のみ読み取り可能か

COMMENT ON COLUMN projects.deleted_at IS '論理削除日時。NULLでないレコードは削除済み扱い';
COMMENT ON COLUMN kintone_settings.last_sync_at IS 'kintone同期の最終成功日時';
COMMENT ON COLUMN kintone_settings.sync_error_count IS '連続同期失敗回数（正常同期でリセット）';
