// Supabase Edge Function: kintone API Proxy
// CORS制限を回避してkintone APIにアクセスするためのプロキシ

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { action, data } = body

    // Supabaseクライアント作成（Service Role Keyを使用してRLSをバイパス）
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: '環境変数が設定されていません',
          debug: { url: !!supabaseUrl, key: !!supabaseKey }
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // kintone設定を取得
    const { data: settings, error: settingsError } = await supabase
      .from('kintone_settings')
      .select('*')
      .eq('is_active', true)
      .limit(1)

    if (settingsError) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'DB読み取りエラー: ' + settingsError.message,
          code: settingsError.code,
          details: settingsError.details
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!settings || settings.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'kintone設定が見つかりません。設定画面で保存してください。',
          hint: 'kintone_settingsテーブルにis_active=trueのレコードがありません'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const config = settings[0]

    // 設定の検証
    if (!config.domain || !config.app_id || !config.api_token) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'kintone設定が不完全です',
          missing: {
            domain: !config.domain,
            app_id: !config.app_id,
            api_token: !config.api_token
          }
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const kintoneUrl = `https://${config.domain}/k/v1`
    const headers = {
      'X-Cybozu-API-Token': config.api_token,
      'Content-Type': 'application/json',
    }

    let response

    switch (action) {
      case 'test':
        // 接続テスト: アプリ情報を取得
        response = await fetch(`${kintoneUrl}/app.json?id=${config.app_id}`, {
          method: 'GET',
          headers,
        })
        break

      case 'getRecords':
        // レコード一覧取得
        const query = data?.query || ''
        const fields = data?.fields || []
        const params = new URLSearchParams({
          app: config.app_id,
          ...(query && { query }),
        })
        if (fields.length > 0) {
          fields.forEach((f: string) => params.append('fields', f))
        }
        response = await fetch(`${kintoneUrl}/records.json?${params}`, {
          method: 'GET',
          headers,
        })
        break

      case 'getRecord':
        // 単一レコード取得
        response = await fetch(`${kintoneUrl}/record.json?app=${config.app_id}&id=${data.recordId}`, {
          method: 'GET',
          headers,
        })
        break

      case 'addRecord':
        // レコード追加
        response = await fetch(`${kintoneUrl}/record.json`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            app: config.app_id,
            record: data.record,
          }),
        })
        break

      case 'updateRecord':
        // レコード更新
        response = await fetch(`${kintoneUrl}/record.json`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            app: config.app_id,
            id: data.recordId,
            record: data.record,
          }),
        })
        break

      case 'getFieldMappings':
        // フィールドマッピング情報を返す
        return new Response(
          JSON.stringify({
            success: true,
            mappings: {
              customer: config.field_customer || '',
              sales: config.field_sales || '',
              design: config.field_design || '',
              ic: config.field_ic || '',
              construction: config.field_construction || '',
            }
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

      default:
        return new Response(
          JSON.stringify({ success: false, error: '不明なアクション: ' + action }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }

    if (!response.ok) {
      const errorText = await response.text()
      return new Response(
        JSON.stringify({
          success: false,
          error: `kintone API エラー: ${response.status}`,
          details: errorText
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const result = await response.json()
    return new Response(
      JSON.stringify({ success: true, data: result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message, stack: error.stack }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
