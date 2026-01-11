-- =====================================================
-- 業者ごとのメール設定機能を追加
-- =====================================================

-- 1. template_vendorsテーブルにメール設定カラムを追加
ALTER TABLE template_vendors ADD COLUMN IF NOT EXISTS subject_format TEXT;
ALTER TABLE template_vendors ADD COLUMN IF NOT EXISTS template_text TEXT;
ALTER TABLE template_vendors ADD COLUMN IF NOT EXISTS signature TEXT;

-- 2. デフォルト署名（全社共通）
-- 署名は個別に設定しない場合、アプリ側でスタッフ情報から自動生成

-- =====================================================
-- 完了！
-- =====================================================
