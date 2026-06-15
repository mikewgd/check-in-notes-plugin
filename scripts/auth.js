#!/usr/bin/env node
import { google } from 'googleapis';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import process2 from 'node:process';

const SCOPES = ['https://www.googleapis.com/auth/gmail.compose'];
const OAUTH_CLIENT_PATH = path.join(process2.cwd(), './secrets/oauth-client.json');
const TOKEN_PATH = path.join(process2.cwd(), './secrets/gmail-token.json');
const REDIRECT_PORT = 53682;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}`;

async function loadClientCreds() {
  const raw = await fs.readFile(OAUTH_CLIENT_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  const creds = parsed.installed || parsed.web;
  if (!creds) throw new Error('oauth-client.json is missing "installed" or "web" block.');
  return creds;
}

function waitForCode() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url, REDIRECT_URI);
        const code = url.searchParams.get('code');
        const err = url.searchParams.get('error');

        if (err) {
          res.end(`Authorization error: ${err}. You can close this window.`);
          server.close();
          reject(new Error(err));
          return;
        }
        if (!code) {
          res.end('No code found. You can close this window.');
          return;
        }

        res.end('Authorization received. You can close this window.');
        server.close();
        resolve(code);
      } catch (e) {
        reject(e);
      }
    });
    server.on('error', reject);
    server.listen(REDIRECT_PORT);
  });
}

async function main() {
  const { client_id, client_secret } = await loadClientCreds();
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, REDIRECT_URI);

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });

  console.log('Open this URL in your browser to authorize Gmail draft access:\n');
  console.log(authUrl);
  console.log('\nWaiting for redirect...');

  const code = await waitForCode();
  const { tokens } = await oAuth2Client.getToken(code);

  if (!tokens.refresh_token) {
    throw new Error('No refresh_token returned. Revoke the app at https://myaccount.google.com/permissions and retry.');
  }

  await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  console.log(`Token saved to ${TOKEN_PATH}`);
}

main().catch((err) => {
  console.error('Auth failed:', err.message);
  process2.exit(1);
});
