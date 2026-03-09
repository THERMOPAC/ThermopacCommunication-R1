import { google } from 'googleapis';
import { db } from './db';
import { googleAdsTokens } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

const redirectUri = process.env.GOOGLE_REDIRECT_URI || "https://thermopac-communication-thermopacllp.replit.app/auth/google/callback";
const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

const GOOGLE_ADS_SCOPES = [
  'https://www.googleapis.com/auth/adwords',
  'profile',
  'email'
];

export function getGoogleAdsAuthUrl(userId: number): string {
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required');
  }

  const authClient = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  const stateData = {
    service: 'google-ads',
    userId: userId
  };
  const state = encodeURIComponent(JSON.stringify(stateData));

  return authClient.generateAuthUrl({
    access_type: 'offline',
    scope: GOOGLE_ADS_SCOPES,
    prompt: 'consent',
    include_granted_scopes: true,
    redirect_uri: redirectUri,
    state: state
  });
}

export async function exchangeGoogleAdsCode(code: string): Promise<any> {
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required');
  }

  const authClient = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  const { tokens } = await authClient.getToken({ code, redirect_uri: redirectUri });
  return tokens;
}

export async function saveGoogleAdsTokens(userId: number, tokens: any): Promise<void> {
  const existing = await db.select().from(googleAdsTokens).where(eq(googleAdsTokens.userId, userId));

  if (existing.length > 0) {
    await db.update(googleAdsTokens)
      .set({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || existing[0].refreshToken,
        tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        updatedAt: new Date()
      })
      .where(eq(googleAdsTokens.userId, userId));
  } else {
    await db.insert(googleAdsTokens).values({
      userId,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    });
  }
}

export async function getGoogleAdsTokens(userId: number): Promise<{ accessToken: string; refreshToken: string; tokenExpiry: Date | null } | null> {
  const tokens = await db.select().from(googleAdsTokens).where(eq(googleAdsTokens.userId, userId));
  if (tokens.length === 0) return null;
  return tokens[0];
}

export async function refreshGoogleAdsToken(userId: number): Promise<string> {
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required');
  }

  const stored = await getGoogleAdsTokens(userId);
  if (!stored || !stored.refreshToken) {
    throw new Error('No refresh token available. Please reconnect your Google Ads account.');
  }

  const authClient = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  authClient.setCredentials({ refresh_token: stored.refreshToken });

  const { credentials } = await authClient.refreshAccessToken();

  await db.update(googleAdsTokens)
    .set({
      accessToken: credentials.access_token!,
      tokenExpiry: credentials.expiry_date ? new Date(credentials.expiry_date) : null,
      updatedAt: new Date()
    })
    .where(eq(googleAdsTokens.userId, userId));

  return credentials.access_token!;
}

export async function deleteGoogleAdsTokens(userId: number): Promise<void> {
  await db.delete(googleAdsTokens).where(eq(googleAdsTokens.userId, userId));
}

export async function getValidAccessToken(userId: number): Promise<string> {
  const stored = await getGoogleAdsTokens(userId);
  if (!stored) {
    throw new Error('Google Ads not connected. Please connect your account first.');
  }

  if (stored.tokenExpiry && new Date(stored.tokenExpiry) < new Date()) {
    console.log('[GoogleAds] Token expired, refreshing...');
    return await refreshGoogleAdsToken(userId);
  }

  return stored.accessToken;
}
