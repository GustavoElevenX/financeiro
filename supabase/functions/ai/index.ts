const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { prompt } = await request.json()
    const apiKey = Deno.env.get('DEEPSEEK_API_KEY')
    const model = Deno.env.get('DEEPSEEK_MODEL') || 'deepseek-chat'

    if (!apiKey) {
      return Response.json({ error: 'DEEPSEEK_API_KEY ausente no backend' }, { status: 500, headers: corsHeaders })
    }

    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content:
              'Voce e um analista financeiro pessoal e familiar. Separe fatos, calculos, interpretacao, riscos, opcoes, recomendacao e decisao do usuario.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
      }),
    })

    if (!response.ok) {
      return Response.json({ error: 'Falha ao consultar DeepSeek' }, { status: response.status, headers: corsHeaders })
    }

    const data = await response.json()
    return Response.json({ content: data.choices?.[0]?.message?.content || '' }, { headers: corsHeaders })
  } catch {
    return Response.json({ error: 'Requisicao invalida' }, { status: 400, headers: corsHeaders })
  }
})
