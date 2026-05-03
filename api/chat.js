// /api/chat.js — SparWatt AI-rådgiver
// Bruker Groqs Llama 3.3 70B Versatile for høyeste kvalitet på norsk

export default async function handler(req, res) {
  // CORS for testing
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { message, profile = {}, context = 'rapport', systemHint = '' } = req.body || {};

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Mangler "message" i forespørselen' });
    }

    // Hent live strømpriser for brukerens prisområde
    const zone = profile.q3zone || profile.zone || 'NO1';
    let livePrices = '';
    try {
      const today = new Date();
      const y = today.getFullYear();
      const m = String(today.getMonth() + 1).padStart(2, '0');
      const d = String(today.getDate()).padStart(2, '0');
      const url = `https://www.hvakosterstrommen.no/api/v1/prices/${y}/${m}-${d}_${zone}.json`;
      const r = await fetch(url);
      if (r.ok) {
        const data = await r.json();
        const currentHour = new Date().getHours();
        const prices = data.map(p => p.NOK_per_kWh * 100);
        const nowPrice = prices[currentHour]?.toFixed(1) || '—';
        const avgPrice = (prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(1);
        const minPrice = Math.min(...prices).toFixed(1);
        const maxPrice = Math.max(...prices).toFixed(1);
        const minHour = prices.indexOf(Math.min(...prices));
        const maxHour = prices.indexOf(Math.max(...prices));
        livePrices = `\nLIVE STRØMPRISER I ${zone} I DAG:
- Pris akkurat nå (kl ${currentHour}): ${nowPrice} øre/kWh
- Snitt i dag: ${avgPrice} øre/kWh
- Billigst i dag: ${minPrice} øre kl ${minHour}
- Dyrest i dag: ${maxPrice} øre kl ${maxHour}`;
      }
    } catch (e) {
      // Hvis priser ikke kan hentes, fortsett uten
    }

    // Bygg profil-tekst basert på det vi vet om brukeren
    const profileLines = [];
    if (profile.bolig || profile.q1) profileLines.push(`Boligtype: ${profile.bolig || profile.q1}`);
    if (profile.størrelse || profile.q2) profileLines.push(`Størrelse: ${profile.størrelse || profile.q2}`);
    if (profile.område || profile.q3post) profileLines.push(`Område: ${profile.område || profile.q3post}`);
    if (profile.husstand || profile.q4) profileLines.push(`Husstand: ${profile.husstand || profile.q4}`);
    if (profile.oppvarming || profile.q5) profileLines.push(`Oppvarming: ${profile.oppvarming || profile.q5}`);
    if (profile.forbruk || profile.q6) profileLines.push(`Strømforbruk: ${profile.forbruk || profile.q6}`);
    if (profile.avtale || profile.q7) profileLines.push(`Strømavtale: ${profile.avtale || profile.q7}`);
    if (profile.solceller || profile.q8) profileLines.push(`Solceller: ${profile.solceller || profile.q8}`);
    if (profile.elbil || profile.q9ev) profileLines.push(`Elbil: ${profile.elbil || profile.q9ev}`);
    const profileText = profileLines.length ? '\nBRUKERENS PROFIL:\n' + profileLines.join('\n') : '';

    // System-prompt — tilpasset etter context
    let systemPrompt;
    if (context === 'analyse-skjema') {
      // Bruker er midt i skjemaet — kort, hjelpsom, ingen "klikk Neste"-mas
      systemPrompt = `Du er SparWatt AI, en norsk strømrådgiver. Brukeren er midt i en analyse og har spurt deg et spørsmål. 

Regler:
- Svar KORT (1-3 setninger maks)
- Svar KONKRET og NORSK
- Bruk profilen til å gi personlig svar når relevant
- IKKE be brukeren klikke "Neste" - bare svar på spørsmålet
- IKKE introduser deg selv eller si "Som strømrådgiver..."
- IKKE anbefal spesifikke strømleverandører ved navn (som Tibber, Vibb, Fortum, etc.). I stedet beskriv hva slags avtale brukeren bør se etter (f.eks. "spotprisavtale med 0 i påslag")
- IKKE anbefal spesifikke produktnavn (Easee, Tibber-app, etc.). Beskriv kategorien (f.eks. "smarte ladere")
- Vær varm og direkte, som en kunnskapsrik venn

${profileText}
${livePrices}
${systemHint ? '\nEKSTRA INSTRUKS: ' + systemHint : ''}`;
    } else {
      // Rapport-kontekst — kan være mer utdypende
      systemPrompt = `Du er SparWatt AI, en personlig norsk strømrådgiver. Brukeren har betalt for full rapport og forventer kvalitetssvar.

Regler:
- Svar på NORSK (ikke engelsk)
- Bruk brukerens profil til å gi PERSONLIGE råd (ikke generelle)
- Hold svarene konkrete - 2-5 setninger typisk
- Bruk live-prisene når relevant
- Bruk markdown-fet (med stjerner) for å fremheve viktige tall og begreper
- Ikke gjenta hele profilen tilbake - vis at du forstår den ved å gi spesifikke råd
- VIKTIG: Du er en NØYTRAL rådgiver. IKKE anbefal spesifikke strømleverandører ved navn (Tibber, Vibb, Fortum, Cheap Energy, Agva, etc.). Beskriv i stedet hva slags avtale som passer (f.eks. "en spotprisavtale med 0 i påslag og lavt månedsbeløp")
- IKKE anbefal spesifikke produktmerker (Easee, Tibber Pulse, etc.). Beskriv kategorien (f.eks. "en smart lader med pristoptimalisering")
- For hjelp til å sammenligne avtaler, henvis til strompris.no (offisiell tjeneste)
- For Norgespris, henvis til elhub.no
- Vær varm, direkte og hjelpsom

${profileText}
${livePrices}`;
    }

    // Kall Groq API
    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message }
        ],
        temperature: 0.7,
        max_tokens: 400,
        top_p: 0.9
      })
    });

    if (!groqResponse.ok) {
      const errorText = await groqResponse.text();
      console.error('Groq API error:', groqResponse.status, errorText);
      return res.status(500).json({
        error: 'AI-tjenesten er midlertidig utilgjengelig',
        reply: 'Beklager — jeg er litt treig akkurat nå. Prøv igjen om et øyeblikk.'
      });
    }

    const data = await groqResponse.json();
    const reply = data.choices?.[0]?.message?.content?.trim();

    if (!reply) {
      return res.status(500).json({
        error: 'Tomt svar fra AI',
        reply: 'Hmm, jeg fikk ikke formulert et godt svar denne gangen. Prøv å spørre på en annen måte.'
      });
    }

    return res.status(200).json({
      reply,
      message: reply,
      text: reply,
      model: 'llama-3.3-70b-versatile'
    });

  } catch (error) {
    console.error('Chat error:', error);
    return res.status(500).json({
      error: error.message || 'Ukjent feil',
      reply: 'Beklager — det oppsto en feil. Prøv igjen om litt.'
    });
  }
}
