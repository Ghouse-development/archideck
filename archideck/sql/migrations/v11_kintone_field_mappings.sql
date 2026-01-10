-- v11: kintoneフィールドマッピングをDBに保存
-- 2026-01-10

-- field_mappings_jsonカラムを追加（全フィールドマッピングをJSON形式で保存）
ALTER TABLE kintone_settings ADD COLUMN IF NOT EXISTS field_mappings_json TEXT;

-- コメント
COMMENT ON COLUMN kintone_settings.field_mappings_json IS 'kintoneフィールドマッピング設定（JSON形式）';
