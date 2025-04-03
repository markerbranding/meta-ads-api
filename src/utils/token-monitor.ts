import nodemailer from 'nodemailer';
import dayjs from 'dayjs';
import { getMetaClients } from '../meta/config/meta-clients.config';

export async function checkTokenExpirations(): Promise<void> {
  const clients = getMetaClients();
  const today = dayjs();
  const soonToExpire: string[] = [];

  for (const [name, config] of Object.entries(clients)) {
    const expires = config.tokenExpiresAt;
    if (!expires) continue;

    const diffDays = dayjs(expires).diff(today, 'day');
    if (diffDays <= 7) {
      soonToExpire.push(`🔴 ${name} — expira en ${diffDays} días (📅 ${expires})`);
    }
  }

  if (soonToExpire.length === 0) {
    console.log('✅ Todos los tokens están vigentes');
    return;
  }

  const body = `🚨 Los siguientes tokens de página expiran pronto:\n\n${soonToExpire.join('\n\n')}`;
  await sendEmailAlert(body);
}

async function sendEmailAlert(body: string) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  await transporter.sendMail({
    from: `"Meta Ads API" <${process.env.EMAIL_USER}>`,
    to: process.env.NOTIFY_EMAIL,
    subject: '⚠️ Tokens de página por expirar',
    text: body,
  });

  console.log('📧 Alerta enviada por correo');
}