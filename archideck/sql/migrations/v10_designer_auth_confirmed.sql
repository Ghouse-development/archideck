-- v10: 担当者のログイン確認フラグを追加
-- 2026-01-10

-- auth_confirmedカラムを追加（デフォルトfalse）
ALTER TABLE designers ADD COLUMN IF NOT EXISTS auth_confirmed BOOLEAN DEFAULT false;

-- コメント
COMMENT ON COLUMN designers.auth_confirmed IS 'ユーザーがログインに成功したかどうか（招待ボタン表示制御用）';
