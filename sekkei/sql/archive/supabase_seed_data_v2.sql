-- =====================================================
-- 初期データ投入SQL v2.0（メールテンプレート）
-- created_byはNULLで挿入（システムデフォルトとして扱う）
-- =====================================================

-- メールテンプレートの挿入（設計カテゴリ）
INSERT INTO email_templates (template_id, display_name, category, company, contact, email, subject_format, template_text, has_special_content, has_sub_options, default_special_content, created_by)
VALUES
  -- パナソニックリビング近畿（換気図面）
  ('panasonic', 'パナソニックリビング近畿（換気図面）', '設計', 'パナソニックリビング近畿株式会社', '北浦さま', 'kitaura.seiga@jp.panasonic.com',
   '{customerName}様 新規換気図面作成依頼　期日{dueDate}',
   E'{company}\n{contact}\n\nいつもお世話になっております。\n新規換気図面作成お願いいたします。\n詳細下記参照お願いいたします。\n\n【お客様名】　{customerName}\n【　内容　】　新規換気図面作成依頼\n【　期日　】　{dueDate}',
   false, false, NULL, NULL),

  -- 給排水設備業者
  ('plumbing', '給排水設備業者（給排水設備図面）', '設計', '給排水設備業者', '', '',
   '{customerName}様邸　新規給排水設備経路図作成依頼　期日{dueDate}中',
   E'{company}　\n{contact}\n\nいつもお世話になっております。\n新規給排水設備経路図作成をお願いいたします。\n詳細下記参照お願いいたします。\n\n【お客様名】　{customerName}\n【　内容　】　新規給排水設備経路図作成依頼\n【　期日　】　{dueDate}\n作成の際に**凡例の記載**も合わせてお願いいたします。',
   false, true, NULL, NULL),

  -- 小倉サンダイン（サッシプレゼン）
  ('ogura', '小倉サンダイン（サッシプレゼン）', '設計', '小倉サンダイン株式会社', E'井上さま\n野間さま\n金ケ江さま', 's_inoue@ogura-sundine.com; s.noma@ogura-sundine.com; ju-taku9@ogura-sundine.com',
   '{customerName}様邸　新規サッシプレゼン作成依頼　期日{dueDate}',
   E'{company}\n{contact}\n\nいつもお世話になっております。\n新規サッシプレゼン関係作成お願いいたします。\n詳細下記参照お願いいたします。\n法22条地域になります。\n\n【お客様名】　{customerName}\n【　内容　】　{specialContent}\n【　期日　】　{dueDate}',
   true, false, 'サッシプレゼン、開口部リスト、玄関プレゼン(C10　カームブラック)', NULL),

  -- 千博産業（evoltz配置図）
  ('senpaku', '千博産業（evoltz配置図）', '設計', '千博産業株式会社', 'ご担当者様', 'evoltz@chihiro.co.jp',
   '{customerName}様 新規evoltz配置図作成依頼　期日{dueDate}',
   E'{company}\n{contact}\n\nいつもお世話になっております。\n新規evoltz配置図作成お願いいたします。\n詳細下記参照お願いいたします。\n\n【お客様名】　{customerName}\n【　内容　】　新規evoltz配置図作成依頼\n【　期日　】　{dueDate}中',
   false, false, NULL, NULL),

  -- IC: 建具プレゼン・見積（Panasonic 近畿）
  ('ic_panasonic_tategu', '建具プレゼン・見積（Panasonic 近畿）', 'IC', 'パナソニックリビング近畿株式会社', E'堤 様\n（CC）北浦 星河 様', 'tsutsumi.yoshiaki@jp.panasonic.com; kitaura.seiga@jp.panasonic.com',
   '{customerName}様邸　建具プレゼン・見積作成依頼　期日{dueDate}',
   E'{company}\n{contact}\n\nお世話になっております。\n株式会社Gハウス　設計部ICの{staffName}と申します。\n\n【新規依頼】{customerName}\n【納期希望】{dueDate}\n\n建具プレゼン・見積の作成をお願いいたします。\n\n{specialContent}',
   true, false, NULL, NULL),

  -- IC: 照明プラン
  ('ic_lighting', '照明プラン（まとめ：ODELIC/DAIKO/KOIZUMI/Panasonic）', 'IC', '照明メーカー各社', '', '',
   '{customerName}様邸　照明プラン作成依頼　期日{dueDate}',
   E'{company}\n{contact}\n\nお世話になっております。\n株式会社Gハウス　設計部ICの{staffName}と申します。\n\n【新規物件】{customerName}\n【希望納期】{dueDate}\n\n下記お客様からのご要望になります。\n{specialContent}\n\nお忙しいところ恐れ入りますが、よろしくお願いいたします。',
   true, true, NULL, NULL),

  -- IC: アイアン階段・手摺（Nくらふと）
  ('ic_ncraft_iron', 'アイアン階段・手摺（Nくらふと）', 'IC', '株式会社Nくらふと', '中村 様', 'info@n-craft.net',
   '{customerName}様邸　アイアン階段／手摺　見積・図面作成依頼　期日{dueDate}',
   E'{company}\n{contact}\n\nお世話になっております。\n株式会社Gハウス　設計部ICの{staffName}と申します。\n\n【新規物件】{customerName}\n【納期希望】{dueDate}\n\n見積・図面の作成をお願い致します。\nあわせてJWデータもいただけますと幸いです。\n\n【階高】2980㎜\n【階段】15段 ひな壇階段\n【共通】中桟1本（ブラック）\n（1）階段手摺（3段目〜8段目）\n（2）吹き抜け部 手摺\n\n{specialContent}\n\nお忙しいところ恐れ入りますが、よろしくお願いいたします。',
   true, false, NULL, NULL),

  -- IC: 設備PB・見積
  ('ic_equipment_pb', '設備PB・見積（まとめ：Panasonic/タカラスタンダード/TOTO/LIXIL）', 'IC', '設備メーカー各社', '', '',
   '{customerName}様邸　設備PB見積作成依頼　期日{dueDate}',
   E'{company}\n{contact}\n\nお世話になっております。\n株式会社Gハウス　設計部ICの{staffName}と申します。\n\n【物件名】{customerName}\n【希望納期】{dueDate}\n\n設備PB、お見積りの作成をお願いいたします。\n添付資料のご確認をお願いいたします。\n\n{specialContent}\n\nお忙しいところ恐れ入りますが、よろしくお願いいたします。',
   true, true, NULL, NULL);

-- 給排水設備業者のサブオプション（業者リスト）
INSERT INTO template_vendors (template_id, vendor_id, company, contact, tel, email, created_by)
VALUES
  ('plumbing', 'spacebuild', '株式会社スペースビルド', '冨阪さま', '090 1144 9504', 'spacetomisaka@carol.ocn.ne.jp', NULL),
  ('plumbing', 'daigo', '株式会社　大五', '村田さま', '090 1223 6957', 'murata-n@daigo-inc.co.jp', NULL),
  ('plumbing', 'kokoro', '株式会社こころ建築工房', '吉岡さま', '090-6207-6659', 'h.yoshioka_839@nz-gp.com', NULL),
  ('plumbing', 'rivu', '株式会社リヴ匠建設', '別役さま', '080-3845-1839', 'becchaku@takumi-kyoto.co.jp', NULL),
  ('plumbing', 'daikou', '大光建設株式会社', '南岡さま', '090-1597-3656', 'nobuyuki@daikou-co.jp', NULL),
  ('plumbing', 'senmon', '株式会社　専門設備', '村田さま', '090-5667-7750', 'senmonsetubi6260@hera.eonet.ne.jp', NULL),
  ('plumbing', 'hirata', '株式会社　平田設備工産', '林さま', '090-2196-2687', 'h.hayashi@eco.ocn.ne.jp', NULL),
  ('plumbing', 'shinsei', '株式会社　シンセイ設備', '石川さま', '080-3031-3876', 'ishikawa@shinseisetubi.jp', NULL),
  ('plumbing', 'iwao', 'イワオ産業　株式会社', '大上さま', '080-2531-4718', 'iwaosan@vesta.ocn.ne.jp', NULL),
  ('plumbing', 'katagi', '株式会社樫儀設備', '泉本さま', '080-1479-5838', 'katagisetsubi@gmail.com', NULL);

-- IC: 照明プランのサブオプション
INSERT INTO template_vendors (template_id, vendor_id, company, contact, tel, email, created_by)
VALUES
  ('ic_lighting', 'odelic', 'オーデリック株式会社', '伊藤 美由紀 様', '080-1006-1562', 'myito@odelic.co.jp', NULL),
  ('ic_lighting', 'daiko', '大光電機株式会社', '石井 大輝 様', '090-4301-6438', 'daiki_ishii@lighting-daiko.co.jp', NULL),
  ('ic_lighting', 'koizumi', 'コイズミ照明株式会社', '吉岡 まひろ 様', '080-2437-2623', 'ma-yoshioka@koizumi.co.jp', NULL),
  ('ic_lighting', 'panasonic', 'パナソニック（エレクトリックワークス社）', '中 知美 様', '090-3280-7300', 'naka.tomomi@jp.panasonic.com', NULL);

-- IC: 設備PB・見積のサブオプション
INSERT INTO template_vendors (template_id, vendor_id, company, contact, tel, email, created_by)
VALUES
  ('ic_equipment_pb', 'panasonic', 'パナソニックリビング近畿株式会社', '瀬尾 様', '070-782-4226', 'seo.ayumi@jp.panasonic.com', NULL),
  ('ic_equipment_pb', 'takaden', 'タカラスタンダード（株式会社たけでん）', '大西 大 様', '080-2468-1924', 'ohnishi@takeden.co.jp', NULL),
  ('ic_equipment_pb', 'daiman', '株式会社大萬（TOTO）', '中野 祐一朗 様', '080-3842-4687', 'y.nakano@kk-daiman.co.jp', NULL),
  ('ic_equipment_pb', 'lixil', '株式会社クワタ（LIXIL）', '中野 遼 様', '070-6947-1233', 'ryo.nakano@lixil.com', NULL);

-- デフォルトのタスク-テンプレート紐づけ（推奨設定）
INSERT INTO task_template_mappings (task_key, template_id)
VALUES
  ('ventilation', 'panasonic'),
  ('plumbing', 'plumbing'),
  ('sash', 'ogura'),
  ('solar', 'senpaku'),
  ('evoltz', 'senpaku');
