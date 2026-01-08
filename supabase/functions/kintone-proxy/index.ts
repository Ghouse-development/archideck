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

    // Supabaseクライアント作成
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseKey) {
      return new Response(
        JSON.stringify({ success: false, error: '環境変数が設定されていません' }),
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
        JSON.stringify({ success: false, error: 'DB読み取りエラー: ' + settingsError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!settings || settings.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'kintone設定が見つかりません', hint: '設定を保存してください' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const config = settings[0]

    // 値を正規化
    let domain = (config.domain || '').trim()
    const appId = parseInt((config.app_id || '').toString().trim(), 10)
    const apiToken = (config.api_token || '').trim()

    // ドメインからhttps://を除去
    domain = domain.replace(/^https?:\/\//, '')

    // 設定の検証
    if (!domain || isNaN(appId) || !apiToken) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'kintone設定が不完全です',
          debug: { domain, appId, hasToken: !!apiToken }
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // kintone APIのベースURL
    const kintoneBaseUrl = `https://${domain}/k/v1`

    // kintone APIヘッダー
    const kintoneHeaders: Record<string, string> = {
      'X-Cybozu-API-Token': apiToken,
    }

    let response: Response

    switch (action) {
      case 'test': {
        // 接続テスト: レコード1件取得を試みる（権限が最小限で済む）
        const testUrl = `${kintoneBaseUrl}/records.json`
        const testBody = JSON.stringify({
          app: appId,
          query: 'limit 1'
        })

        response = await fetch(testUrl, {
          method: 'GET',
          headers: {
            ...kintoneHeaders,
            'Content-Type': 'application/json',
          },
        })

        // GETでダメならPOSTで試す（kintone REST APIはGET/POSTどちらも対応）
        if (!response.ok) {
          // records.json GET with query params
          const params = new URLSearchParams()
          params.append('app', appId.toString())
          params.append('query', 'limit 1')

          response = await fetch(`${kintoneBaseUrl}/records.json?${params.toString()}`, {
            method: 'GET',
            headers: kintoneHeaders,
          })
        }
        break
      }

      case 'getRecords': {
        const query = data?.query || ''
        const params = new URLSearchParams()
        params.append('app', appId.toString())
        if (query) params.append('query', query)

        response = await fetch(`${kintoneBaseUrl}/records.json?${params.toString()}`, {
          method: 'GET',
          headers: kintoneHeaders,
        })
        break
      }

      case 'getAllRecords': {
        // 500件制限を回避してすべてのレコードを取得
        const allRecords: any[] = []
        let offset = 0
        const limit = 500
        const maxOffset = 10000 // kintone APIの制限
        let hasMore = true
        let hitLimit = false
        let pageCount = 0
        let lastError: string | null = null
        let retryCount = 0
        const maxRetries = 3

        while (hasMore) {
          pageCount++
          // order byを追加して一貫したページネーションを保証
          const baseQuery = data?.query || ''
          const orderClause = 'order by $id asc'
          const query = baseQuery
            ? `${baseQuery} ${orderClause} limit ${limit} offset ${offset}`
            : `${orderClause} limit ${limit} offset ${offset}`

          const params = new URLSearchParams()
          params.append('app', appId.toString())
          params.append('query', query)

          try {
            const res = await fetch(`${kintoneBaseUrl}/records.json?${params.toString()}`, {
              method: 'GET',
              headers: kintoneHeaders,
            })

            if (!res.ok) {
              const errorText = await res.text()
              let errorDetail = errorText
              try {
                const errorJson = JSON.parse(errorText)
                errorDetail = errorJson.message || errorJson.error || errorText
              } catch {}

              // リトライ可能なエラーの場合
              if (res.status >= 500 && retryCount < maxRetries) {
                retryCount++
                await new Promise(resolve => setTimeout(resolve, 1000 * retryCount))
                continue
              }

              return new Response(
                JSON.stringify({
                  success: false,
                  error: `kintone API エラー (${res.status})`,
                  details: errorDetail,
                  debug: {
                    page: pageCount,
                    offset,
                    recordsRetrieved: allRecords.length,
                    query
                  }
                }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              )
            }

            retryCount = 0 // 成功したらリトライカウントをリセット
            const result = await res.json()
            const records = result.records || []
            allRecords.push(...records)

            if (records.length < limit) {
              hasMore = false
            } else {
              offset += limit
              // 10,000件制限チェック
              if (offset >= maxOffset) {
                hasMore = false
                hitLimit = true
              }
            }
          } catch (fetchError) {
            // ネットワークエラーなどの場合、リトライ
            if (retryCount < maxRetries) {
              retryCount++
              lastError = fetchError.message
              await new Promise(resolve => setTimeout(resolve, 1000 * retryCount))
              continue
            }

            return new Response(
              JSON.stringify({
                success: false,
                error: `ネットワークエラー: ${fetchError.message}`,
                details: lastError,
                debug: {
                  page: pageCount,
                  offset,
                  recordsRetrieved: allRecords.length
                }
              }),
              { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }
        }

        return new Response(
          JSON.stringify({
            success: true,
            data: {
              records: allRecords,
              totalCount: allRecords.length,
              pageCount,
              hitLimit,
              warning: hitLimit ? '10,000件を超えるレコードがあります。一部が取得できていない可能性があります。' : null
            }
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'getRecord': {
        const params = new URLSearchParams()
        params.append('app', appId.toString())
        params.append('id', data.recordId.toString())

        response = await fetch(`${kintoneBaseUrl}/record.json?${params.toString()}`, {
          method: 'GET',
          headers: kintoneHeaders,
        })
        break
      }

      case 'addRecord': {
        response = await fetch(`${kintoneBaseUrl}/record.json`, {
          method: 'POST',
          headers: {
            ...kintoneHeaders,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            app: appId,
            record: data.record,
          }),
        })
        break
      }

      case 'updateRecord': {
        response = await fetch(`${kintoneBaseUrl}/record.json`, {
          method: 'PUT',
          headers: {
            ...kintoneHeaders,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            app: appId,
            id: parseInt(data.recordId, 10),
            record: data.record,
          }),
        })
        break
      }

      case 'getFieldMappings': {
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
      }

      default:
        return new Response(
          JSON.stringify({ success: false, error: '不明なアクション: ' + action }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }

    // レスポンス処理
    const responseText = await response.text()

    if (!response.ok) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `kintone API エラー (${response.status})`,
          details: responseText,
          debug: {
            url: `https://${domain}/k/v1/...`,
            appId,
            status: response.status
          }
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 成功
    let result
    try {
      result = JSON.parse(responseText)
    } catch {
      result = { raw: responseText }
    }

    return new Response(
      JSON.stringify({ success: true, data: result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
