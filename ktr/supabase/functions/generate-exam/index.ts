import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { prompt, imageBase64 } = await req.json()
    const apiKey = Deno.env.get('GEMINI_API_KEY')

    let contents = [];
    if (imageBase64) {
       contents = [{
         parts: [
           { text: prompt },
           { inline_data: { mime_type: "image/jpeg", data: imageBase64 } }
         ]
       }];
    } else {
       contents = [{ parts: [{ text: prompt }] }];
    }

    // CHỐT HẠ: Dùng siêu phẩm gemini-2.5-flash có sẵn trong tài khoản của bạn
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents })
      }
    )

    const data = await response.json()
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})