module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages, profile } = req.body;

  if (!messages || !profile) {
    return res.status(400).json({ error: 'Missing messages or profile' });
  }

  let priceInfo = 'Live priser utilgjengelig akkurat nå.';
  try {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const priceRes = await fetch(
      `https://www.hvakosterstrommen.no/api/v1/prices/${year}/${month}-${day}_NO1.json`
    );
    if (priceRes.ok) {
      const prices = await priceRes.json();
      const now = today.getHours();
      const currentPrice = prices[now] && prices[now].NOK_per_kWh;
      const minPrice = Math.min(...prices.map(function(p){ return p.NOK_per_kWh; }));
      const maxPrice = Math.max(...prices.map(function(p){ return p.NOK_per_kWh; }));
      const cheapHours = prices
        .filter(function(p){ return p.NOK_per_kWh <= minPrice * 1.2; })
        .map(function(p){ return new Date(p.time_start).getHours() + ':00'; })
        .join(', ');
      priceInfo = 'Live strompris akkurat na: ' + (currentPrice * 100).toFixed(1) + ' ore/kWh. Billigste timer i dag: ' + cheapHours + '. Dyreste pris: ' + (maxPrice * 100).toFixed(1) + ' ore/kWh.';
    }
  } catch (e) {
    priceInfo = 'Live priser utilgjengelig akkurat na.';
  }

  const place = profile.placeName || profile.q3 || 'Norge';

  const systemPrompt = 'Du er SparWatt-assistenten — en vennlig og kunnskapsrik norsk stromradgiver. Du hjelper denne spesifikke brukeren med a spare penger pa strom basert pa deres bolig og situasjon.\n\nBRUKERPROFIL:\n- Boligtype: ' + (profile.q1||'') + '\n- Storrelse: ' + (profile.q2||'') + '\n- Antall i husstanden: ' + (profile.q4||profile.q3||'') + '\n- Oppvarming: ' + (profile.q5||profile.q4||'') + '\n- Manedlig forbruk: ' + (profile.q6||profile.q5||'') + '\n- Stromavtale: ' + (profile.q7||'') + '\n- Leverandor: ' + (profile.q11provider||'ukjent') + '\n- Paslag: ' + (profile.q11markup ? profile.q11markup + ' ore/kWh' : 'ukjent') + '\n- Sted: ' + place + '\n- Ekstra info: ' + (profile.q10||profile.q6extra||profile.q6||'Ingen') + '\n\nLIVE STROMPRISINFORMASJON:\n' + priceInfo + '\n\nINSTRUKSJONER:\n- Svar alltid pa norsk, kort og konkret\n- Bruk brukerens profil aktivt — ikke gi generiske rad\n- Referer til live-priser og stedet nar relevant\n- Gi konkrete kronebel\u00f8p og estimater nar mulig\n- Vennlig men direkte — ingen unodvendig fluff\n- Maks 3-4 setninger per svar med mindre brukeren ber om mer';

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + process.env.GROQ_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama3-8b-8192',
        messages: [{ role: 'system', content: systemPrompt }].concat(messages),
        max_tokens: 400,
        temperature: 0.7
      })
    });

    if (!groqRes.ok) {
      const err = await groqRes.text();
      return res.status(500).json({ error: 'Groq error', details: err });
    }

    const data = await groqRes.json();
    const reply = data.choices[0].message.content;
    return res.status(200).json({ reply: reply });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
