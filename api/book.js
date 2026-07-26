module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { firstName, lastName, email, phone, topic, date, time } = req.body || {};

  if (!firstName || !lastName || !email || !phone || !date || !time) {
    res.status(400).json({ error: 'Champs manquants' });
    return;
  }

  const summary = `${firstName} ${lastName} — ${date} à ${time}\nTél: ${phone}\nEmail: ${email}\nSujet: ${topic || '(non précisé)'}`;

  const results = await Promise.allSettled([
    sendEmail(summary, { firstName, lastName, email, phone, topic, date, time }),
    sendTelegram(summary),
    sendWhatsApp(summary),
  ]);

  const failures = results
    .map((r, i) => ({ r, name: ['email', 'telegram', 'whatsapp'][i] }))
    .filter(x => x.r.status === 'rejected');

  if (failures.length) {
    console.error('Notification failures:', failures.map(f => `${f.name}: ${f.r.reason}`));
  }

  res.status(200).json({
    ok: true,
    notified: {
      email: results[0].status === 'fulfilled',
      telegram: results[1].status === 'fulfilled',
      whatsapp: results[2].status === 'fulfilled',
    },
  });
}

async function sendEmail(summary, details) {
  const { RESEND_API_KEY, RESEND_FROM, NOTIFY_EMAIL_TO } = process.env;
  if (!RESEND_API_KEY || !RESEND_FROM || !NOTIFY_EMAIL_TO) throw new Error('Resend non configuré');

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: [NOTIFY_EMAIL_TO],
      subject: `Nouveau rendez-vous — ${details.firstName} ${details.lastName}`,
      text: summary,
    }),
  });

  if (!resp.ok) throw new Error(`Resend HTTP ${resp.status}: ${await resp.text()}`);
}

async function sendTelegram(summary) {
  const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = process.env;
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) throw new Error('Telegram non configuré');

  const resp = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: `📅 Nouveau RDV\n${summary}`,
    }),
  });

  if (!resp.ok) throw new Error(`Telegram HTTP ${resp.status}: ${await resp.text()}`);
}

async function sendWhatsApp(summary) {
  const { CALLMEBOT_PHONE, CALLMEBOT_APIKEY } = process.env;
  if (!CALLMEBOT_PHONE || !CALLMEBOT_APIKEY) throw new Error('CallMeBot non configuré');

  const text = encodeURIComponent(`📅 Nouveau RDV\n${summary}`);
  const url = `https://api.callmebot.com/whatsapp.php?phone=${CALLMEBOT_PHONE}&text=${text}&apikey=${CALLMEBOT_APIKEY}`;

  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`CallMeBot HTTP ${resp.status}: ${await resp.text()}`);
}
