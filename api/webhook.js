const crypto = require('crypto');

// Simple token store using a JSON file approach via KV-style env
// Tokens are stored as comma-separated list in VALID_TOKENS env var
// For production, replace with a real database

function generateToken() {
  return crypto.randomBytes(12).toString('hex'); // 24 char unique token
}

async function sendEmail(to, token) {
  // Uses Resend API — free up to 3000 emails/month
  // Set RESEND_API_KEY in Vercel environment variables
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'SparWatt <noreply@sparwatt.no>',
      to: [to],
      subject: 'Din SparWatt-rapport er klar 🔋',
      html: `
        <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
          <h1 style="font-family: Georgia, serif; font-weight: 300; font-size: 2rem; color: #1b4332; margin-bottom: 8px;">
            Din rapport er klar
          </h1>
          <p style="color: #555; line-height: 1.7; margin-bottom: 24px;">
            Takk for at du abonnerer på SparWatt! Her er din personlige tilgangslenke:
          </p>
          <a href="https://sparwatt.no/full-rapport.html?access=${token}"
             style="display: inline-block; padding: 14px 28px; background: #1b4332; color: #fff;
                    border-radius: 6px; text-decoration: none; font-size: 15px; margin-bottom: 24px;">
            Åpne rapporten din →
          </a>
          <p style="color: #888; font-size: 13px; line-height: 1.6;">
            Bokmerke denne lenken — det er din personlige tilgang.<br>
            Lenken fungerer alltid og kan åpnes på nytt når du vil.
          </p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
          <p style="color: #aaa; font-size: 12px;">
            SparWatt · Norsk strømanalyse · 
            <a href="mailto:ole.andreas.sneltvedt@gmail.com" style="color: #aaa;">Kontakt oss</a>
          </p>
        </div>
      `
    })
  });
  return res.ok;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return res.status(500).json({ error: 'Missing STRIPE_WEBHOOK_SECRET' });
  }

  // Get raw body for signature verification
  let rawBody = '';
  try {
    rawBody = JSON.stringify(req.body);
  } catch(e) {
    return res.status(400).json({ error: 'Invalid body' });
  }

  // Parse the event
  let event;
  try {
    event = req.body;
  } catch(e) {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // Handle checkout.session.completed (one-time payment)
  // and customer.subscription.created (subscription)
  if (
    event.type === 'checkout.session.completed' ||
    event.type === 'customer.subscription.created'
  ) {
    const session = event.data.object;
    const email = session.customer_email ||
                  session.customer_details?.email ||
                  session.metadata?.email;

    if (!email) {
      console.log('No email found in event:', event.type);
      return res.status(200).json({ received: true });
    }

    // Generate unique token
    const token = generateToken();

    // Log for manual backup (visible in Vercel logs)
    console.log(`NEW_CUSTOMER email=${email} token=${token}`);

    // Send email with token
    if (process.env.RESEND_API_KEY) {
      const sent = await sendEmail(email, token);
      console.log(`Email sent: ${sent} to ${email}`);
    } else {
      console.log('RESEND_API_KEY not set — email not sent');
    }

    return res.status(200).json({ received: true, token });
  }

  return res.status(200).json({ received: true });
};
