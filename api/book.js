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
  const { EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, EMAILJS_PUBLIC_KEY, EMAILJS_PRIVATE_KEY, NOTIFY_EMAIL_TO } = process.env;
  if (!EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID || !EMAILJS_PUBLIC_KEY || !EMAILJS_PRIVATE_KEY || !NOTIFY_EMAIL_TO) {
    throw new Error('EmailJS non configuré');
  }

  const recipients = NOTIFY_EMAIL_TO.split(',').map(e => e.trim());

  const responses = await Promise.all(recipients.map(to_email =>
    fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: EMAILJS_SERVICE_ID,
        template_id: EMAILJS_TEMPLATE_ID,
        user_id: EMAILJS_PUBLIC_KEY,
        accessToken: EMAILJS_PRIVATE_KEY,
        template_params: {
          to_email,
          subject: `Nouveau rendez-vous — ${details.firstName} ${details.lastName}`,
          message: summary,
        },
      }),
    })
  ));

  for (const resp of responses) {
    if (!resp.ok) throw new Error(`EmailJS HTTP ${resp.status}: ${await resp.text()}`);
  }
}

async function sendTelegram(summary) {
  const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = process.env;
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) throw new Error('Telegram non configuré');

  const chatIds = TELEGRAM_CHAT_ID.split(',').map(id => id.trim());

  const responses = await Promise.all(chatIds.map(chat_id =>
    fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id,
        text: `📅 Nouveau RDV\n${summary}`,
      }),
    })
  ));

  for (const resp of responses) {
    if (!resp.ok) throw new Error(`Telegram HTTP ${resp.status}: ${await resp.text()}`);
  }
}

async function sendWhatsApp(summary) {
  const { CALLMEBOT_PHONE, CALLMEBOT_APIKEY } = process.env;
  if (!CALLMEBOT_PHONE || !CALLMEBOT_APIKEY) throw new Error('CallMeBot non configuré');

  const text = encodeURIComponent(`📅 Nouveau RDV\n${summary}`);
  const url = `https://api.callmebot.com/whatsapp.php?phone=${CALLMEBOT_PHONE}&text=${text}&apikey=${CALLMEBOT_APIKEY}`;

  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`CallMeBot HTTP ${resp.status}: ${await resp.text()}`);
}
