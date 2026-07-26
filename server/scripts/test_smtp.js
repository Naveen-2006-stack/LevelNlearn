#!/usr/bin/env node
require('dotenv').config();
const nodemailer = require('nodemailer');

async function main() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true';
  const to = process.env.TEST_TO || user;

  if (!host || !user || !pass) {
    console.error('Missing SMTP configuration. Set SMTP_HOST, SMTP_USER, SMTP_PASS in server/.env');
    process.exit(2);
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });

  try {
    console.log('Verifying SMTP connection...');
    await transporter.verify();
    console.log('SMTP verified. Sending test message to', to);

    const info = await transporter.sendMail({
      from: `LevelNLearn <${user}>`,
      to,
      subject: 'LevelNLearn — SMTP test',
      text: 'This is a test message sent from LevelNLearn SMTP check.',
      html: '<p>This is a <strong>test</strong> message sent from LevelNLearn SMTP check.</p>',
    });

    console.log('Message sent. Provider response:');
    console.log(info);
    process.exit(0);
  } catch (err) {
    console.error('Failed to send test email:', err);
    process.exit(1);
  }
}

main();
