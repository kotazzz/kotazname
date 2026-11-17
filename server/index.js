import path from 'node:path'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import compress from '@fastify/compress'
import multipart from '@fastify/multipart'
import rateLimit from '@fastify/rate-limit'
import serveStatic from '@fastify/static'
import { loadConfig, loadDotEnv } from './config.js'
import { openDb } from './db.js'
import { loadSecret } from './util.js'
import { createPow } from './pow.js'
import { addSecurityHeaders } from './security.js'
import { createAuth, authRoutes } from './auth.js'
import { createAbout, adminAboutRoutes, publicAboutRoutes } from './about.js'
import { createLinks, adminLinkRoutes, redirectLink } from './links.js'
import { adminMessageRoutes, publicMessageRoutes } from './messages.js'
import { createMusic, musicRoutes } from './music.js'
import { createProjects, adminProjectRoutes, publicProjectRoutes } from './projects.js'
import { createStats, statsRoutes } from './stats.js'
import { createGithub, createSteam, integrationRoutes } from './integrations.js'

const SLUG = /^[a-z0-9][a-z0-9_-]{0,31}$/

/** Собирает приложение. overrides — для тестов (порты, каталоги, БД в памяти). */
export async function build(overrides = {}) {
  // undefined-значения в overrides не должны затирать конфиг
  const clean = Object.fromEntries(Object.entries(overrides).filter(([, value]) => value !== undefined))
  const config = { ...loadConfig(), ...clean }
  const db = overrides.db ?? openDb(path.join(config.dataDir, 'kotaz.db'))
  mkdirSync(config.uploadsDir, { recursive: true })
  const secret = loadSecret(config)

  const app = Fastify({
    logger: overrides.logger ?? { level: config.production ? 'info' : 'warn' },
    trustProxy: config.trustProxy,
    bodyLimit: 1024 * 1024,
  })

  // Обработчики задаём ДО регистрации плагинов: avvio фиксирует их в дочерних
  // контекстах в момент исполнения плагина, а не в момент вызова register().
  app.setErrorHandler((error, req, reply) => {
    let status = Number(error.statusCode) || 500
    if (status < 400) status = 500
    let code = typeof error.code === 'string' && /^[a-z_]+$/.test(error.code) ? error.code : 'internal'
    if (typeof error.code === 'string' && error.code.startsWith('FST_')) code = status === 413 ? 'file_too_large' : 'bad_request'
    if (status >= 500) {
      req.log.error({ err: error.message, url: req.url }, 'request failed')
      code = 'internal'
    }
    reply.code(status).send({ error: code })
  })

  const ctx = { config, db, secret, log: app.log }
  ctx.pow = createPow({ secret, bits: config.limits.powBits })
  ctx.auth = createAuth(ctx)
  ctx.about = createAbout(ctx)
  ctx.links = createLinks(ctx)
  ctx.music = createMusic(ctx)
  ctx.projects = createProjects(ctx)
  ctx.stats = createStats(ctx)
  ctx.steam = createSteam(ctx)
  ctx.github = createGithub(ctx)

  // Первичные данные: тексты «обо мне», короткие ссылки на соцсети, каталог музыки, проекты.
  ctx.about.seed()
  ctx.links.seed()
  ctx.projects.seed()
  const tracks = ctx.music.load()

  await app.register(cookie)
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    keyGenerator: (req) => req.ip,
  })
  await app.register(multipart, { limits: { fileSize: config.limits.fileBytes, files: 1 } })
  await app.register(compress)
  addSecurityHeaders(app)

  // --- API --------------------------------------------------------------------------------
  const plug = (fn) => async (instance) => fn(instance, ctx)

  app.get('/api/health', async () => ({ ok: true, tracks }))

  await app.register(async (api) => {
    api.register(plug(authRoutes), { prefix: '/auth' })

    api.register(plug(publicMessageRoutes), { prefix: '/pub' })
    api.register(plug(publicAboutRoutes), { prefix: '/pub' })
    api.register(plug(publicProjectRoutes), { prefix: '/pub' })
    api.register(plug(statsRoutes), { prefix: '/pub' })
    api.register(plug(integrationRoutes), { prefix: '/pub' })
    api.register(plug(musicRoutes), { prefix: '/pub' })

    api.register(
      async (admin) => {
        admin.addHook('preHandler', ctx.auth.requireAdmin)
        admin.register(plug(adminMessageRoutes))
        admin.register(plug(adminLinkRoutes))
        admin.register(plug(adminAboutRoutes))
        admin.register(plug(adminProjectRoutes))
      },
      { prefix: '/admin' },
    )
  }, { prefix: '/api' })

  // --- Статика и SPA ----------------------------------------------------------------------
  // dist (сайт) и каталог музыки: sendFile ищет файл по корням по очереди.
  await app.register(serveStatic, {
    root: [config.distDir, config.musicDir],
    index: ['index.html'],
    cacheControl: false,
    setHeaders(reply, filePath) {
      if (/[/\\]assets[/\\]/.test(filePath)) {
        // Vite кладёт хэш в имя файла — можно кэшировать навсегда.
        reply.header('Cache-Control', 'public, max-age=31536000, immutable')
      } else if (filePath.endsWith('.html')) {
        reply.header('Cache-Control', 'no-cache')
      }
    },
  })

  // Не нашлось файла: сначала пробуем короткую ссылку, иначе отдаём SPA.
  app.setNotFoundHandler((req, reply) => {
    const isPage = (req.method === 'GET' || req.method === 'HEAD') && req.headers.accept?.includes('text/html')
    if (!isPage) return reply.code(404).send({ error: 'not_found' })
    const slug = req.raw.url.split('?')[0].replace(/^\/+|\/+$/g, '').toLowerCase()
    if (SLUG.test(slug) && !slug.includes('/') && redirectLink(ctx, req, reply, slug)) return reply
    return reply.sendFile('index.html')
  })

  return { app, ctx, db }
}

async function start() {
  loadDotEnv()
  const { app, ctx } = await build()
  const { config } = ctx

  if (!ctx.auth.isRegistered()) {
    const token = ctx.auth.setupToken()
    app.log.warn('Админка ещё не настроена. Токен первичной настройки: %s', token)
    app.log.warn('Откройте https://%s/admin и введите этот токен, затем зарегистрируйте passkey.', config.rpId)
  }

  try {
    await app.listen({ host: config.host, port: config.port })
  } catch (error) {
    app.log.error(error)
    process.exit(1)
  }

  const shutdown = () => {
    app.close().then(() => process.exit(0), () => process.exit(1))
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) await start()
