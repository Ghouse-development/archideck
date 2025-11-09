-- =====================================================
-- 旧template_vendorsから新vendors_v2へのデータ移行
-- =====================================================
--
-- このSQLは、template_vendorsテーブルの18件の業者データを
-- vendors_v2テーブルに移行します。
--
-- 実行手順:
-- 1. Supabase SQL Editorを開く
-- 2. このSQLを全てコピー&ペースト
-- 3. 「Run」をクリック
--

-- =====================================================
-- 業者データ移行（18件）
-- =====================================================

-- カテゴリIDを取得
DO $$
DECLARE
  cat_setsubi UUID;
  cat_other UUID;
BEGIN
  -- カテゴリIDを取得
  SELECT id INTO cat_setsubi FROM vendor_categories WHERE name = '設備';
  SELECT id INTO cat_other FROM vendor_categories WHERE name = 'その他';

  -- 給排水設備業者（10件）
  INSERT INTO vendors_v2 (company, contact, tel, email, category_id, subject_format, template_text)
  VALUES
    ('株式会社樫儀設備', '泉本さま', '080-1479-5838', 'katagisetsubi@gmail.com', cat_setsubi,
     '{customerName}様邸 給排水設備図面作成依頼 期日{dueDate}',
     'いつもお世話になっております。
新規給排水設備経路図作成をお願いいたします。

【お客様名】{customerName}
【期日】{dueDate}

よろしくお願いいたします。'),

    ('株式会社シンセイ設備', '石川さま', '080-3031-3876', 'ishikawa@shinseisetubi.jp', cat_setsubi,
     '{customerName}様邸 給排水設備図面作成依頼 期日{dueDate}',
     'いつもお世話になっております。
新規給排水設備経路図作成をお願いいたします。'),

    ('株式会社リヴ匠建設', '別役さま', '080-3845-1839', 'becchaku@takumi-kyoto.co.jp', cat_setsubi,
     '{customerName}様邸 給排水設備図面作成依頼 期日{dueDate}',
     'いつもお世話になっております。'),

    ('株式会社こころ建築工房', '吉岡さま', '090-6207-6659', 'h.yoshioka_839@nz-gp.com', cat_setsubi,
     '{customerName}様邸 給排水設備図面作成依頼 期日{dueDate}',
     'いつもお世話になっております。'),

    ('株式会社平田設備工産', '林さま', '090-2196-2687', 'h.hayashi@eco.ocn.ne.jp', cat_setsubi,
     '{customerName}様邸 給排水設備図面作成依頼 期日{dueDate}',
     'いつもお世話になっております。'),

    ('大光建設株式会社', '南岡さま', '090-1597-3656', 'nobuyuki@daikou-co.jp', cat_setsubi,
     '{customerName}様邸 給排水設備図面作成依頼 期日{dueDate}',
     'いつもお世話になっております。'),

    ('株式会社大五', '村田さま', '090-1223-6957', 'murata-n@daigo-inc.co.jp', cat_setsubi,
     '{customerName}様邸 給排水設備図面作成依頼 期日{dueDate}',
     'いつもお世話になっております。'),

    ('株式会社スペースビルド', '冨阪さま', '090-1144-9504', 'spacetomisaka@carol.ocn.ne.jp', cat_setsubi,
     '{customerName}様邸 給排水設備図面作成依頼 期日{dueDate}',
     'いつもお世話になっております。'),

    ('イワオ産業株式会社', '大上さま', '080-2531-4718', 'iwaosan@vesta.ocn.ne.jp', cat_setsubi,
     '{customerName}様邸 給排水設備図面作成依頼 期日{dueDate}',
     'いつもお世話になっております。'),

    ('株式会社専門設備', '村田さま', '090-5667-7750', 'senmonsetubi6260@hera.eonet.ne.jp', cat_setsubi,
     '{customerName}様邸 給排水設備図面作成依頼 期日{dueDate}',
     'いつもお世話になっております。')
  ON CONFLICT DO NOTHING;

  -- 設備PB業者（4件）
  INSERT INTO vendors_v2 (company, contact, tel, email, category_id, subject_format, template_text)
  VALUES
    ('株式会社大萬（TOTO）', '中野 祐一朗 様', '080-3842-4687', 'y.nakano@kk-daiman.co.jp', cat_setsubi,
     '{customerName}様邸 設備PB見積作成依頼 期日{dueDate}',
     'お世話になっております。
設備PB、お見積りの作成をお願いいたします。'),

    ('株式会社クワタ（LIXIL）', '中野 遼 様', '070-6947-1233', 'ryo.nakano@lixil.com', cat_setsubi,
     '{customerName}様邸 設備PB見積作成依頼 期日{dueDate}',
     'お世話になっております。'),

    ('パナソニックリビング近畿株式会社', '瀬尾 様', '070-782-4226', 'seo.ayumi@jp.panasonic.com', cat_setsubi,
     '{customerName}様邸 設備PB見積作成依頼 期日{dueDate}',
     'お世話になっております。'),

    ('タカラスタンダード（株式会社たけでん）', '大西 大 様', '080-2468-1924', 'ohnishi@takeden.co.jp', cat_setsubi,
     '{customerName}様邸 設備PB見積作成依頼 期日{dueDate}',
     'お世話になっております。')
  ON CONFLICT DO NOTHING;

  -- 照明業者（4件）
  SELECT id INTO cat_other FROM vendor_categories WHERE name = '照明';
  IF cat_other IS NULL THEN
    INSERT INTO vendor_categories (name, display_order) VALUES ('照明', 6) RETURNING id INTO cat_other;
  END IF;

  INSERT INTO vendors_v2 (company, contact, tel, email, category_id, subject_format, template_text)
  VALUES
    ('パナソニック（エレクトリックワークス社）', '中 知美 様', '090-3280-7300', 'naka.tomomi@jp.panasonic.com', cat_other,
     '{customerName}様邸 照明プラン作成依頼 期日{dueDate}',
     'お世話になっております。'),

    ('コイズミ照明株式会社', '吉岡 まひろ 様', '080-2437-2623', 'ma-yoshioka@koizumi.co.jp', cat_other,
     '{customerName}様邸 照明プラン作成依頼 期日{dueDate}',
     'お世話になっております。'),

    ('オーデリック株式会社', '伊藤 美由紀 様', '080-1006-1562', 'myito@odelic.co.jp', cat_other,
     '{customerName}様邸 照明プラン作成依頼 期日{dueDate}',
     'お世話になっております。'),

    ('大光電機株式会社', '石井 大輝 様', '090-4301-6438', 'daiki_ishii@lighting-daiko.co.jp', cat_other,
     '{customerName}様邸 照明プラン作成依頼 期日{dueDate}',
     'お世話になっております。')
  ON CONFLICT DO NOTHING;

END $$;

-- =====================================================
-- 確認
-- =====================================================

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

SELECT '✅ 業者データ移行完了（18件）' as result;
