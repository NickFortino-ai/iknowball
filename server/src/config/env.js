import 'dotenv/config'

export const env = {
  PORT: parseInt(process.env.PORT || '3001', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  ODDS_API_KEY: process.env.ODDS_API_KEY,
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5173',
  ENABLE_ODDS_SYNC: process.env.ENABLE_ODDS_SYNC === 'true',
  ENABLE_GAME_SCORING: process.env.ENABLE_GAME_SCORING === 'true',
  ENABLE_PICK_LOCK: process.env.ENABLE_PICK_LOCK === 'true',
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
  SMTP_HOST: process.env.SMTP_HOST || 'smtp.gmail.com',
  SMTP_PORT: parseInt(process.env.SMTP_PORT || '587', 10),
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  SMTP_FROM: process.env.SMTP_FROM || 'admin@iknowball.club',
  ENABLE_FUTURES_SYNC: process.env.ENABLE_FUTURES_SYNC === 'true',
  ENABLE_LIVE_SCORES: process.env.ENABLE_LIVE_SCORES === 'true',
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  ENABLE_WEEKLY_RECAP: process.env.ENABLE_WEEKLY_RECAP === 'true',
  ENABLE_RECORD_CALC: process.env.ENABLE_RECORD_CALC === 'true',
  ENABLE_INJURY_SYNC: process.env.ENABLE_INJURY_SYNC === 'true',
  ENABLE_NBA_DFS: process.env.ENABLE_NBA_DFS === 'true',
  APPLE_BUNDLE_ID: process.env.APPLE_BUNDLE_ID || 'com.iknowball.app',
  APPLE_IAP_ENVIRONMENT: process.env.APPLE_IAP_ENVIRONMENT || 'Production',
  STRIPE_MONTHLY_PRICE_ID: process.env.STRIPE_MONTHLY_PRICE_ID,
  STRIPE_YEARLY_PRICE_ID: process.env.STRIPE_YEARLY_PRICE_ID,
  // Apple Push Notifications (APNs) — key-based auth (token provider). The
  // .p8 private key content (multi-line PEM block) goes in APNS_KEY. Defaults
  // to production APNs gateway; flip APNS_PRODUCTION=false for sandbox
  // (development device builds) if ever needed.
  APNS_KEY_ID: process.env.APNS_KEY_ID,
  APNS_TEAM_ID: process.env.APNS_TEAM_ID,
  APNS_BUNDLE_ID: process.env.APNS_BUNDLE_ID || 'com.iknowball.app',
  APNS_KEY: process.env.APNS_KEY,
  APNS_PRODUCTION: process.env.APNS_PRODUCTION !== 'false',

  // Firebase Cloud Messaging (FCM) — Android native push. Store the entire
  // service account JSON (downloaded from Firebase console → Service
  // accounts → Generate new private key) as a single env var. Lesson from
  // the APNs PEM-marker incident — single-var JSON avoids the multi-line
  // env escaping bug class entirely.
  FIREBASE_SERVICE_ACCOUNT_JSON: process.env.FIREBASE_SERVICE_ACCOUNT_JSON,

  // Google Play Billing — Android IAP verification + subscription state.
  // Same single-var JSON pattern as the FCM credential above; the entire
  // service account JSON (downloaded from Cloud Console → IAM → Service
  // Accounts → Keys → Add Key → JSON) goes here as one value.
  GOOGLE_SERVICE_ACCOUNT_JSON: process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
}
