-- =====================================================
-- tasksテーブルにhas_email_buttonカラムを追加
-- =====================================================
--
-- このSQLは、タスクごとにメールボタンを表示するかどうかを
-- 設定できるようにするためのカラムを追加します。
--
-- 実行手順:
-- 1. Supabase SQL Editorを開く
-- 2. このSQLを全てコピー&ペースト
-- 3. 「Run」をクリック
--

-- has_email_buttonカラムを追加
ALTER TABLE tasks
ADD COLUMN IF NOT EXISTS has_email_button BOOLEAN DEFAULT true;

-- 既存のタスクにデフォルト値を設定
UPDATE tasks
SET has_email_button = true
WHERE has_email_button IS NULL;

-- 確認
SELECT
  task_name,
  category,
  display_order,
  has_email_button
FROM tasks
ORDER BY display_order;

SELECT '✅ has_email_buttonカラム追加完了' as result;
