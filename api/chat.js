export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages, profile } = req.body;

  if (!messages || !profile) {
    return res.status(400).json({ error: 'Missing messages or profile' });
  }

  // Fetch live Nordpool prices for NO1 (Oslo)
  let priceInfo = 'Kunne ikke hente live priser akkurat nå.';
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
      const currentPrice = prices[now]?.NOK_per_kWh;
      const minPrice = Math.min(...prices.map(p => p.NOK_per_kWh));
      const maxPrice = Math.max(...prices.map(p => p.NOK_per_kWh));
      const cheapHours = prices
        .filter(p => p.NOK_per_kWh <= minPrice * 1.2)
        .map(p => new Date(p.time_start).getHours() + ':00')
        .join(', ');
      priceInfo = `Live strømpris akkurat nå (NO1/Oslo): ${(currentPrice * 100).toFixed(1)} øre/kWh. Dagens billigste timer: ${cheapHours}. Dagens dyreste pris: ${(maxPrice * 100).toFixed(1)} øre/kWh.`;
    }
  } catch (e) {
    priceInfo = 'Live priser utilgjengelig akkurat nå.';
  }

  const systemPrompt = `Du er SparWatt-assistenten — en vennlig og kunnskapsrik norsk strømrådgiver. Du hjelper denne spesifikke brukeren med å spare penger på strøm basert på deres bolig og situasjon.

BRUKERPROFIL:
- Boligtype: ${profile.q1}
- Størrelse: ${profile.q2}
- Antall i husstanden: ${profile.q3}
- Oppvarming: ${profile.q4}
- Månedlig forbruk: ${profile.q5}
- Ekstra info fra brukeren: ${profile.q6 || 'Ingen'}

LIVE STRØMPRISINFORMASJON I DAG:
${priceInfo}

INSTRUKSJONER:
- Svar alltid på norsk, kort og konkret
- Bruk brukerens profil aktivt i svarene — ikke gi generiske råd
- Referer til live-priser når det er relevant
- Gi konkrete kronebeløp og estimater når mulig
- Vær vennlig men direkte — ingen unødvendig fluff
- Hvis noen spør om noe utenfor strøm/energi, si at du kun hjelper med strømsparing
- Maks 3-4 setninger per svar med mindre brukeren ber om mer detalj`;

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama3-8b-8192',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages
        ],
        max_tokens: 400,
        temperature: 0.7
      })
    });

    if (!groqRes.ok) {
      const err = await groqRes.text();
      return res.status(500).json({ error: 'Groq API error', details: err });
    }

    const data = await groqRes.json();
    const reply = data.choices[0].message.content;
    return res.status(200).json({ reply });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
