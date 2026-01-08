# Supabase Edge Functions

## kintone-proxy

kintone APIへのプロキシ関数。CORS制限を回避してブラウザからkintoneにアクセス可能にします。

### デプロイ手順

1. **Supabase CLIのインストール**
   ```bash
   npm install -g supabase
   ```

2. **ログイン**
   ```bash
   supabase login
   ```

3. **プロジェクトにリンク**
   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   ```
   ※ YOUR_PROJECT_REF は Supabase ダッシュボードの Settings > General から確認

4. **Edge Functionをデプロイ**
   ```bash
   supabase functions deploy kintone-proxy
   ```

5. **デプロイ確認**
   Supabase ダッシュボード > Edge Functions で `kintone-proxy` が表示されていればOK

### 使用方法

フロントエンドから以下のように呼び出します：

```javascript
// 接続テスト
const result = await callKintoneProxy('test');

// レコード取得
const records = await fetchKintoneRecords('', ['邸名', '営業担当']);

// レコード追加
await addKintoneRecord({ フィールドコード: { value: '値' } });

// レコード更新
await updateKintoneRecord(recordId, { フィールドコード: { value: '新しい値' } });
```

### 対応アクション

| action | 説明 |
|--------|------|
| `test` | 接続テスト（アプリ情報取得） |
| `getRecords` | レコード一覧取得 |
| `getRecord` | 単一レコード取得 |
| `addRecord` | レコード追加 |
| `updateRecord` | レコード更新 |
| `getFieldMappings` | フィールドマッピング取得 |

### 必要なDB設定

`kintone_settings` テーブルに以下のカラムが必要：
- domain
- app_id
- api_token
- field_sales
- field_design
- field_ic
- field_construction
- is_active
