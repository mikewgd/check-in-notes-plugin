#!/usr/bin/env node
import dotenv from 'dotenv';
import { google } from 'googleapis';
import fs from 'node:fs/promises';
import path from 'node:path';
import process2 from 'node:process';

dotenv.config({ path: path.join(process2.cwd(), './.env'), quiet: true });

const OAUTH_CLIENT_PATH = path.join(process2.cwd(), './secrets/oauth-client.json');
const TOKEN_PATH = path.join(process2.cwd(), './secrets/gmail-token.json');
const TEMPLATE_PATH = path.join(process2.cwd(), './templates/email.md');

async function getAuth() {
  const clientRaw = await fs.readFile(OAUTH_CLIENT_PATH, 'utf8');
  const parsed = JSON.parse(clientRaw);
  const { client_id, client_secret } = parsed.installed || parsed.web;

  const tokenRaw = await fs.readFile(TOKEN_PATH, 'utf8');
  const tokens = JSON.parse(tokenRaw);

  const client = new google.auth.OAuth2(client_id, client_secret);
  client.setCredentials(tokens);
  return client;
}

function extractOutputBlock(md) {
  const marker = '## Output:';
  const idx = md.indexOf(marker);
  if (idx === -1) return null;
  return md.slice(idx + marker.length).trim();
}

function parseEmailTemplate(template) {
  const subjectMatch = template.match(/\*\*SUBJECT:\*\*\s*(.+)/);
  const bodyParts = template.split(/\*\*BODY:\*\*\s*/);

  return {
    subjectTemplate: subjectMatch ? subjectMatch[1].trim() : null,
    bodyTemplate: bodyParts[1] ? bodyParts[1].trim() : null,
  };
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function mdToHtml(md) {
  const bolded = escapeHtml(md).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  return bolded.replace(/\n/g, '<br>\n');
}

function buildRawMessage({ to, subject, htmlBody, plainBody }) {
  const boundary = '----=_Part_' + Math.random().toString(36).slice(2);
  const lines = [
    ...(to ? [`To: ${to}`] : []),
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    plainBody,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    '',
    htmlBody,
    '',
    `--${boundary}--`,
  ];

  return Buffer.from(lines.join('\r\n'))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// demo: create the draft with no To: address and a generic greeting (no trainer name), so a demo
// can't be mistaken for a real send-ready email.
export async function draftEmail(date, { demo = false } = {}) {
  const filePath = path.join(process2.cwd(), `./check-ins/${date}.md`);

  let mdContent;
  try {
    mdContent = await fs.readFile(filePath, 'utf8');
  } catch (e) {
    return { success: false, data: `Could not read ${filePath}: ${e.message}` };
  }

  const output = extractOutputBlock(mdContent);
  if (!output) return { success: false, data: 'No "## Output:" block in check-in file.' };

  const template = await fs.readFile(TEMPLATE_PATH, 'utf8');
  const { subjectTemplate, bodyTemplate } = parseEmailTemplate(template);

  if (!subjectTemplate || !bodyTemplate) {
    return { success: false, data: 'templates/email.md is missing SUBJECT or BODY.' };
  }

  const { TRAINER_EMAIL: to, TRAINER_NAME: trainerName } = process2.env;
  if (!demo && (!to || !trainerName)) {
    return { success: false, data: 'Set TRAINER_EMAIL and TRAINER_NAME in .env.' };
  }

  const [y, m, d] = date.split('-');
  const displayDate = `${m}/${d}/${y}`;
  const subject = subjectTemplate.replace('[date]', displayDate);
  const body = bodyTemplate.replace('[TRAINER_NAME]', demo ? 'there' : trainerName);
  const filledBody = body.replace('[output]', output);
  const htmlBody = `<div style="font-family: sans-serif;">${mdToHtml(filledBody)}</div>`;

  const auth = await getAuth();
  const gmail = google.gmail({ version: 'v1', auth });

  const raw = buildRawMessage({ to: demo ? null : to, subject, htmlBody, plainBody: filledBody });

  try {
    const res = await gmail.users.drafts.create({
      userId: 'me',
      requestBody: { message: { raw } },
    });
    return { success: true, data: `Draft created (id: ${res.data.id}). Open Gmail → Drafts to review.` };
  } catch (e) {
    return { success: false, data: `Failed to create draft: ${e.message}` };
  }
}

const inputArg = process2.argv[2];
if (inputArg) {
  draftEmail(inputArg, { demo: process2.argv[3] === 'demo' }).then((r) => {
    console.log(r);
    if (!r.success) process2.exit(1);
  });
}
