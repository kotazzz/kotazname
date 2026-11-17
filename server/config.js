import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Подхватывает .env из корня проекта. Уже заданные переменные окружения не затирает. */
export function loadDotEnv() {
  try {
    process.loadEnvFile(path.join(ROOT, '.env'))
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}

const list = (value, fallback) =>
  String(value || fallback)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

const int = (value, fallback) => {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

const MB = 1024 * 1024

export function loadConfig(env = process.env) {
  const production = env.NODE_ENV === 'production'
  const dataDir = path.resolve(ROOT, env.DATA_DIR || 'data')
  const origins = list(env.SITE_ORIGINS, 'https://kotaz.name,https://kotaz.ru')
  const adminOrigins = list(env.ADMIN_ORIGINS, 'https://kotaz.name')

  return {
    production,
    host: env.HOST || '0.0.0.0',
    port: int(env.PORT, 8787),
    dataDir,
    distDir: path.resolve(ROOT, env.DIST_DIR || 'dist'),
    musicDir: path.resolve(env.MUSIC_DIR || path.join(dataDir, 'music')),
    uploadsDir: path.join(dataDir, 'uploads'),
    timezone: env.APP_TIMEZONE || 'Europe/Moscow',

    // Откуда разрешены запросы, меняющие состояние. WebAuthn привязан к ADMIN_ORIGINS и RP_ID.
    origins,
    adminOrigins,
    rpId: env.RP_ID || 'kotaz.name',
    rpName: env.RP_NAME || 'kot_az',
    adminSetupToken: env.ADMIN_SETUP_TOKEN || '',
    appSecret: env.APP_SECRET || '',

    // Прокси перед приложением (Caddy в docker-сети). Только их заголовку X-Forwarded-For верим.
    trustProxy: list(env.TRUST_PROXY, '127.0.0.1,::1,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16'),

    steamKey: env.STEAM_API_KEY || '',
    steamId: env.STEAM_ID || '76561198968143951',
    githubUser: env.GITHUB_USER || 'kotazzz',
    githubToken: env.GITHUB_TOKEN || '',
    defaultBirthdate: env.BIRTHDATE || '2005-12-12',

    limits: {
      nameChars: 32,
      messageChars: 4096,
      fileBytes: int(env.MAX_FILE_MB, 100) * MB,
      // Сколько байт вложений принимаем за сутки и всего, чтобы не забили диск.
      uploadsPerDayBytes: int(env.MAX_UPLOADS_DAY_MB, 3000) * MB,
      uploadsTotalBytes: int(env.MAX_UPLOADS_TOTAL_MB, 30000) * MB,
      messagesPerDayTotal: int(env.MAX_MESSAGES_DAY, 300),
      messagesPerDayPerIp: int(env.MAX_MESSAGES_DAY_IP, 10),
      powBits: int(env.POW_BITS, 16),
    },
  }
}
