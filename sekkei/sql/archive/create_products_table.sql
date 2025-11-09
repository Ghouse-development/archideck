-- =====================================================
-- 商品マスタテーブルの作成
-- =====================================================

CREATE TABLE IF NOT EXISTS products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- デフォルト商品を投入
INSERT INTO products (name, display_order) VALUES
  ('LIFE', 1),
  ('LIFE+', 2),
  ('HOURS', 3),
  ('LACIE', 4),
  ('LIFEリミ', 5),
  ('LIFE+リミ', 6)
ON CONFLICT (name) DO NOTHING;

-- 確認
SELECT * FROM products ORDER BY display_order;
