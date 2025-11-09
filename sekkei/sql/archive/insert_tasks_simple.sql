-- =====================================================
-- タスクデータ投入（簡易版）
-- =====================================================

-- 設計用タスク（16個）
INSERT INTO tasks (task_key, task_name, category, display_order, has_state, state_options) VALUES
  ('meeting0', '0回目打合せ', '設計', 1, false, NULL),
  ('meeting1', '1回目打合せ', '設計', 2, false, NULL),
  ('meeting2', '2回目打合せ', '設計', 3, false, NULL),
  ('meeting3', '3回目打合せ', '設計', 4, false, NULL),
  ('quotation', '見積', '設計', 5, false, NULL),
  ('contract', '契約', '設計', 6, false, NULL),
  ('structure', '構造依頼', '設計', 7, true, '["", "依頼済", "保存済"]'),
  ('structure_doc', '構造図書類', '設計', 8, true, '["", "依頼済", "保存済"]'),
  ('ventilation', '換気図面', '設計', 9, true, '["", "依頼済", "保存済"]'),
  ('plumbing', '給排水設備図面', '設計', 10, true, '["", "依頼済", "保存済"]'),
  ('sash', 'サッシプレゼン', '設計', 11, true, '["", "依頼済", "保存済"]'),
  ('solar', '太陽光依頼', '設計', 12, true, '["", "依頼済", "保存済"]'),
  ('evoltz', 'エボルツ依頼', '設計', 13, true, '["", "依頼済", "保存済"]'),
  ('application', '確認申請', '設計', 14, false, NULL),
  ('approval', '確認済証', '設計', 15, false, NULL),
  ('delivery', '図面等納品', '設計', 16, false, NULL)
ON CONFLICT (task_key) DO NOTHING;

-- IC用タスク（8個）
INSERT INTO tasks (task_key, task_name, category, display_order, has_state, state_options) VALUES
  ('ic_meeting', '打合せ', 'IC', 1, false, NULL),
  ('ic_quotation', '見積', 'IC', 2, false, NULL),
  ('ic_contract', '契約', 'IC', 3, false, NULL),
  ('ic_equipment', '設備PB', 'IC', 4, false, NULL),
  ('ic_fabless', 'ファブレス', 'IC', 5, false, NULL),
  ('ic_lighting', '照明プラン', 'IC', 6, false, NULL),
  ('ic_tategu', '建具プレゼン', 'IC', 7, false, NULL),
  ('ic_iron', 'アイアン階段手摺', 'IC', 8, false, NULL)
ON CONFLICT (task_key) DO NOTHING;

-- 確認
SELECT '✅ タスクデータ投入完了' as result;
SELECT task_key, task_name, category, has_state FROM tasks ORDER BY category, display_order;
