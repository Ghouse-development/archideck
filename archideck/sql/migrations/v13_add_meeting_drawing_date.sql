-- v13: 会議図面渡し日カラムを追加
-- kintoneフィールド: 日付_IC_会議_図面_渡し日_予定手入力

-- projects テーブルに meeting_drawing_date カラムを追加
ALTER TABLE projects ADD COLUMN IF NOT EXISTS meeting_drawing_date DATE;

-- インデックスを追加（カレンダー検索の最適化）
CREATE INDEX IF NOT EXISTS idx_projects_meeting_drawing_date ON projects(meeting_drawing_date);

COMMENT ON COLUMN projects.meeting_drawing_date IS 'IC会議図面渡し日（kintone連携）';
