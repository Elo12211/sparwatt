// Validates a token against the list stored in VALID_TOKENS env var
// VALID_TOKENS is a comma-separated list of tokens set in Vercel env vars
// Webhook adds new tokens by calling /api/add-token

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  var token = req.query.token || (req.body && req.body.token);
  if(!token){
    return res.status(400).json({ valid: false, error: 'No token' });
  }

  // Always valid: master test token
  var masterToken = "d002860aa39ab528f92d823d";
  if(token === masterToken){
    return res.status(200).json({ valid: true });
  }

  // Check against VALID_TOKENS env var (comma-separated)
  var validTokens = (process.env.VALID_TOKENS || '').split(',').map(t => t.trim()).filter(Boolean);
  var isValid = validTokens.indexOf(token) > -1;

  return res.status(200).json({ valid: isValid });
};
