-- =====================================================
-- サンプル業者データ投入
-- =====================================================
--
-- このSQLは、業者カテゴリとサンプル業者データを投入します。
--
-- ⚠️ 実行前に確認:
-- 1. create_new_tables.sql を先に実行済みであること
-- 2. vendor_categories テーブルと vendors_v2 テーブルが存在すること
--
-- 実行手順:
-- 1. Supabase SQL Editorを開く
-- 2. このSQLを全てコピー&ペースト
-- 3. 「Run」をクリック
--

-- =====================================================
-- ステップ1: 業者カテゴリを投入
-- =====================================================

INSERT INTO vendor_categories (name, display_order) VALUES
  ('設備', 1),
  ('サッシ', 2),
  ('太陽光', 3),
  ('蓄電池', 4),
  ('構造', 5),
  ('照明', 6),
  ('建具', 7),
  ('アイアン', 8),
  ('その他', 9)
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- ステップ2: サンプル業者データを投入
-- =====================================================

-- カテゴリIDを取得して業者を登録
DO $$
DECLARE
  cat_setsubi UUID;
  cat_sash UUID;
  cat_solar UUID;
  cat_battery UUID;
  cat_structure UUID;
  cat_light UUID;
  cat_tategu UUID;
  cat_iron UUID;
BEGIN
  -- カテゴリIDを取得
  SELECT id INTO cat_setsubi FROM vendor_categories WHERE name = '設備';
  SELECT id INTO cat_sash FROM vendor_categories WHERE name = 'サッシ';
  SELECT id INTO cat_solar FROM vendor_categories WHERE name = '太陽光';
  SELECT id INTO cat_battery FROM vendor_categories WHERE name = '蓄電池';
  SELECT id INTO cat_structure FROM vendor_categories WHERE name = '構造';
  SELECT id INTO cat_light FROM vendor_categories WHERE name = '照明';
  SELECT id INTO cat_tategu FROM vendor_categories WHERE name = '建具';
  SELECT id INTO cat_iron FROM vendor_categories WHERE name = 'アイアン';

  -- 設備業者
  INSERT INTO vendors_v2 (company, contact, tel, email, category_id, subject_format, template_text)
  VALUES
    ('パナソニック株式会社', '営業担当', '06-0000-0000', 'panasonic@example.com', cat_setsubi,
     '【Gハウス】換気設備図面依頼 - {customer}様邸',
     'いつもお世話になっております。

下記物件の換気設備図面を作成いただきたく、ご連絡いたしました。

■ 物件情報
お客様名: {customer}
商品: {spec}
担当者: {staff}

■ 依頼内容
換気設備図面の作成をお願いいたします。

よろしくお願いいたします。'),

    ('〇〇設備株式会社', '設備担当', '06-1111-1111', 'setsubi@example.com', cat_setsubi,
     '【Gハウス】給排水設備図面依頼 - {customer}様邸',
     'いつもお世話になっております。

給排水設備図面の作成をお願いいたします。

■ 物件情報
お客様名: {customer}
商品: {spec}

よろしくお願いいたします。')
  ON CONFLICT DO NOTHING;

  -- サッシ業者
  INSERT INTO vendors_v2 (company, contact, tel, email, category_id, subject_format, template_text)
  VALUES
    ('YKKAP株式会社', 'サッシ担当', '06-2222-2222', 'ykkap@example.com', cat_sash,
     '【Gハウス】サッシプレゼン依頼 - {customer}様邸',
     'いつもお世話になっております。

サッシプレゼンをお願いいたします。

■ 物件情報
お客様名: {customer}
商品: {spec}

よろしくお願いいたします。'),

    ('株式会社LIXIL', 'サッシ営業', '06-3333-3333', 'lixil@example.com', cat_sash,
     '【Gハウス】サッシプレゼン依頼 - {customer}様邸',
     'いつもお世話になっております。

サッシプレゼンをお願いいたします。')
  ON CONFLICT DO NOTHING;

  -- 太陽光業者
  INSERT INTO vendors_v2 (company, contact, tel, email, category_id, subject_format, template_text)
  VALUES
    ('〇〇太陽光システム', '太陽光担当', '06-4444-4444', 'solar@example.com', cat_solar,
     '【Gハウス】太陽光システム依頼 - {customer}様邸',
     'いつもお世話になっております。

太陽光システムのご提案をお願いいたします。

■ 物件情報
お客様名: {customer}
商品: {spec}

よろしくお願いいたします。')
  ON CONFLICT DO NOTHING;

  -- 蓄電池業者
  INSERT INTO vendors_v2 (company, contact, tel, email, category_id, subject_format, template_text)
  VALUES
    ('エボルツ販売株式会社', 'エボルツ担当', '06-5555-5555', 'evoltz@example.com', cat_battery,
     '【Gハウス】エボルツ蓄電池依頼 - {customer}様邸',
     'いつもお世話になっております。

エボルツ蓄電池のご提案をお願いいたします。')
  ON CONFLICT DO NOTHING;

  -- 構造設計事務所
  INSERT INTO vendors_v2 (company, contact, tel, email, category_id, subject_format, template_text)
  VALUES
    ('〇〇構造設計事務所', '構造設計士', '06-6666-6666', 'structure@example.com', cat_structure,
     '【Gハウス】構造計算依頼 - {customer}様邸',
     'いつもお世話になっております。

構造計算をお願いいたします。

■ 物件情報
お客様名: {customer}
商品: {spec}

よろしくお願いいたします。')
  ON CONFLICT DO NOTHING;

  -- 照明業者
  INSERT INTO vendors_v2 (company, contact, tel, email, category_id, subject_format, template_text)
  VALUES
    ('〇〇照明プランニング', '照明担当', '06-7777-7777', 'light@example.com', cat_light,
     '【Gハウス】照明プラン依頼 - {customer}様邸',
     'いつもお世話になっております。

照明プランをお願いいたします。')
  ON CONFLICT DO NOTHING;

  -- 建具業者
  INSERT INTO vendors_v2 (company, contact, tel, email, category_id, subject_format, template_text)
  VALUES
    ('〇〇建具工房', '建具職人', '06-8888-8888', 'tategu@example.com', cat_tategu,
     '【Gハウス】建具プレゼン依頼 - {customer}様邸',
     'いつもお世話になっております。

建具プレゼンをお願いいたします。')
  ON CONFLICT DO NOTHING;

  -- アイアン業者
  INSERT INTO vendors_v2 (company, contact, tel, email, category_id, subject_format, template_text)
  VALUES
    ('〇〇アイアンワークス', 'アイアン職人', '06-9999-9999', 'iron@example.com', cat_iron,
     '【Gハウス】アイアン階段手摺依頼 - {customer}様邸',
     'いつもお世話になっております。

アイアン階段手摺をお願いいたします。')
  ON CONFLICT DO NOTHING;

END $$;

-- =====================================================
-- 確認
-- =====================================================

-- カテゴリ数を確認
SELECT
  'カテゴリ数' as item,
  COUNT(*) as count
FROM vendor_categories;

-- 業者数を確認
SELECT
  '業者数' as item,
  COUNT(*) as count
FROM vendors_v2;

-- カテゴリ別の業者数
SELECT
  COALESCE(vc.name, '未分類') as category_name,
  COUNT(v.id) as vendor_count
FROM vendors_v2 v
LEFT JOIN vendor_categories vc ON v.category_id = vc.id
GROUP BY vc.name
ORDER BY vendor_count DESC;

SELECT '✅ サンプル業者データ投入完了' as result;
