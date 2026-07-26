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
    sendSMS(summary),
    sendWhatsApp(summary),
  ]);

  const failures = results
    .map((r, i) => ({ r, name: ['email', 'sms', 'whatsapp'][i] }))
    .filter(x => x.r.status === 'rejected');

  if (failures.length) {
    console.error('Notification failures:', failures.map(f => `${f.name}: ${f.r.reason}`));
  }

  res.status(200).json({
    ok: true,
    notified: {
      email: results[0].status === 'fulfilled',
      sms: results[1].status === 'fulfilled',
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

async function sendSMS(summary) {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_SMS_FROM, NOTIFY_PHONE_TO } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_SMS_FROM || !NOTIFY_PHONE_TO) throw new Error('Twilio SMS non configuré');

  await twilioMessage({ from: TWILIO_SMS_FROM, to: NOTIFY_PHONE_TO, body: `📅 Nouveau RDV\n${summary}` });
}

async function sendWhatsApp(summary) {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM, NOTIFY_WHATSAPP_TO } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_WHATSAPP_FROM || !NOTIFY_WHATSAPP_TO) throw new Error('Twilio WhatsApp non configuré');

  await twilioMessage({
    from: `whatsapp:${TWILIO_WHATSAPP_FROM}`,
    to: `whatsapp:${NOTIFY_WHATSAPP_TO}`,
    body: `📅 Nouveau RDV\n${summary}`,
  });
}

async function twilioMessage({ from, to, body }) {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env;
  const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');

  const params = new URLSearchParams({ From: from, To: to, Body: body });

  const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });

  if (!resp.ok) throw new Error(`Twilio HTTP ${resp.status}: ${await resp.text()}`);
}
