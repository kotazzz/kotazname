import { cleanBlock, cleanLine, charLength } from './util.js'

/**
 * Проекты с главной страницы. Хранятся в БД и редактируются в админке.
 * Сортировка на сайте: по году (новые сверху), затем по position.
 */
const SEED = [
  ['soundshader', 2026, 'Waves', 'https://github.com/kotazzz/soundshader',
    'Движок звука на шейдерах: браузерный редактор и headless-рендер в Node с параллельным экспортом в воркерах.',
    'A sound engine on shaders: browser editor and headless render in Node with parallel export in workers.'],
  ['kossa', 2026, 'Receipt', 'https://github.com/kotazzz/kossa',
    'Самодельная нефискальная касса на RP2040-Zero, ESP32-S3 с экраном 480×272 (LVGL), мембранной клавиатурой и термопринтером QR701.',
    'A homemade non-fiscal cash register on RP2040-Zero, ESP32-S3 with a 480×272 screen (LVGL), membrane keyboard and QR701 thermal printer.'],
  ['kotoproto-os', 2026, 'Cpu', 'https://github.com/kotazzz/kotoproto-os',
    'Прошивка моего сьюта протогена (ESP32, панель P3 64×32, HUD на SSD1306). Есть симулятор на ПК с браузерным UI.',
    'Firmware for my protogen suit (ESP32, P3 64×32 panel, SSD1306 HUD). Comes with a PC simulator with a browser UI.'],
  ['MCPied', 2026, 'Blocks', 'https://github.com/kotazzz/mcpied',
    'Мод NeoForge для Minecraft 1.21.1. Пока идёт мир, поднимает локальный MCP-сервер, через который ассистент может смотреть мир и менять блоки, сущности, предметы и команды.',
    'A NeoForge mod for Minecraft 1.21.1. While the world runs, it hosts a local MCP server through which an assistant can inspect the world and change blocks, entities, items and commands.'],
  ['kotazname', 2026, 'Globe', 'https://github.com/kotazzz/kotazname',
    'Сайт-визитка на React/Vite. Вы тут.',
    'A calling-card site on React/Vite. You are here.'],
  ['silently', 2026, 'Ghost', 'https://github.com/kotazzz/silentlymod',
    'Мод NeoForge для Minecraft 1.21.1. Рядом с игроком происходят мелкие необъяснимые события: звуки, взгляды, двери, таблички, инвентарь.',
    'A NeoForge mod for Minecraft 1.21.1. Small inexplicable events happen around the player: sounds, gazes, doors, signs, inventory.'],
  ['valen', 2026, 'Heart', 'https://github.com/kotazzz/valen',
    'Discord-бот для анонимных валентинок на сервере: текст и картинки, цвета embed, лимиты, кулдаун 72 часа, статистика. Slash-команды, Docker.',
    'A Discord bot for anonymous valentines on a server: text and images, embed colors, limits, 72-hour cooldown, stats. Slash commands, Docker.'],
  ['todsite', 2026, 'Skull', 'https://github.com/kotazzz/todsite',
    'Сайт для ARG в жанре цифрового хоррора по лору Minecraft-сервера. Привет, DSTM!',
    'A site for a digital-horror ARG based on a Minecraft server lore. Hi, DSTM!'],
  ['koshop', 2026, 'Store', 'https://github.com/kotazzz/koshop',
    'Мод NeoForge 1.21.1. Добавляет кастомизируемый магазин предметов с опциональной интеграцией LM Currency.',
    'A NeoForge 1.21.1 mod. Adds a customizable item shop with optional LM Currency integration.'],
  ['deepspectrum', 2026, 'RadioTower', 'https://github.com/kotazzz/deepspectrum',
    'Игра на Godot 4.7, где нужно ловить и настраивать радиосигналы. Вдохновлено VotV.',
    'A Godot 4.7 game about catching and tuning radio signals. Inspired by VotV.'],
  ['krpg-language', 2025, 'FileCode2', 'https://github.com/kotazzz/krpg-language',
    'Расширение VS Code для языка KRPG: подсветка синтаксиса и поддержка языка.',
    'VS Code extension for the KRPG language: syntax highlighting and language support.'],
  ['rekotazy (Kotazy Language)', 2025, 'Braces', 'https://github.com/kotazzz/rekotazy',
    'Минималистичный интерпретируемый язык на Python со скобочными блоками, def/ret, циклами и стандартной библиотекой.',
    'A minimalistic interpreted language in Python with bracket blocks, def/ret, loops and a standard library.'],
  ['micropaste', 2025, 'ClipboardList', 'https://github.com/kotazzz/micropaste',
    'Паста-сервис на Go с Docker, hot-reload (air) и Justfile.',
    'A paste service in Go with Docker, hot-reload (air) and Justfile.'],
  ['ГИПРО-64 (GIPRO)', 2025, 'Landmark', 'https://github.com/kotazzz/GIPRO',
    'Псевдо «язык программирования» в советской стилистике, на Python, с покрытием тестами и лицензией.',
    'A pseudo "programming language" in Soviet styling, in Python, with test coverage and a license.'],
  ['komuzik', 2025, 'Music', 'https://github.com/kotazzz/komuzik',
    'Telegram-бот для скачивания видео (240p–1080p) и аудио с YouTube. Другие площадки, предпросмотр, плейлисты, inline-режим, обложки, статистика.',
    'A Telegram bot for downloading video (240p–1080p) and audio from YouTube. Other platforms, previews, playlists, inline mode, embedded covers, usage stats.'],
  ['yui_r', 2025, 'Bot', 'https://github.com/kotazzz/yui_r',
    'Многофункциональный Discord-бот на Python и Disnake: верификация через модальные окна, административные роли, модульные cogs.',
    'A multifunctional Discord bot in Python and Disnake: verification via modal windows, administrative roles, modular cogs.'],
  ['KRPG', 2024, 'Swords', 'https://github.com/kotazzz/krpg',
    'Текстовая RPG на Python со своим скриптовым языком.',
    'A text RPG in Python with its own scripting language.'],
  ['krpgscript', 2024, 'Terminal', 'https://github.com/kotazzz/krpgscript',
    'Скриптовый язык для KRPG.',
    'A scripting language for KRPG.'],
]

const ICON = /^[A-Z][A-Za-z0-9]{0,39}$/
const MAX_DESC = 700

export function createProjects(ctx) {
  const { db } = ctx

  function seed() {
    if (db.prepare("SELECT 1 FROM settings WHERE key = 'projects_seeded'").get()) return
    const insert = db.prepare(
      'INSERT INTO projects (year, name, icon, href, desc_ru, desc_en, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    const now = Date.now()
    SEED.forEach(([name, year, icon, href, descRu, descEn], index) =>
      insert.run(year, name, icon, href, descRu, descEn, index, now, now),
    )
    db.prepare("INSERT INTO settings (key, value) VALUES ('projects_seeded', '1')").run()
  }

  function validate(input) {
    const year = Number(input?.year)
    if (!Number.isInteger(year) || year < 2000 || year > 2100) return { error: 'bad_year' }
    const name = cleanLine(typeof input?.name === 'string' ? input.name : '')
    if (!name || charLength(name) > 80) return { error: 'bad_name' }
    const icon = cleanLine(typeof input?.icon === 'string' ? input.icon : '') || 'Folder'
    if (!ICON.test(icon)) return { error: 'bad_icon' }
    let href
    try {
      href = new URL(typeof input?.href === 'string' ? input.href.trim() : '')
    } catch {
      return { error: 'bad_url' }
    }
    if (!['http:', 'https:'].includes(href.protocol) || href.href.length > 2048) return { error: 'bad_url' }
    const descRu = cleanBlock(typeof input?.descRu === 'string' ? input.descRu : '')
    const descEn = cleanBlock(typeof input?.descEn === 'string' ? input.descEn : '')
    if (charLength(descRu) > MAX_DESC || charLength(descEn) > MAX_DESC) return { error: 'desc_too_long' }
    return { year, name, icon, href: href.href, descRu, descEn }
  }

  const toProject = (row) => ({
    id: row.id,
    year: row.year,
    name: row.name,
    icon: row.icon,
    href: row.href,
    descRu: row.desc_ru,
    descEn: row.desc_en,
  })

  return {
    seed,
    validate,
    list: () =>
      db
        .prepare('SELECT * FROM projects ORDER BY year DESC, position, id')
        .all()
        .map(toProject),
    byId: (id) => {
      const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id)
      return row ? toProject(row) : null
    },
  }
}

export async function publicProjectRoutes(app, ctx) {
  app.get('/projects', async (_req, reply) => {
    reply.header('Cache-Control', 'public, max-age=60')
    return { items: ctx.projects.list() }
  })
}

export async function adminProjectRoutes(app, ctx) {
  const { db, projects } = ctx

  app.get('/projects', async () => ({ items: projects.list() }))

  app.post('/projects', async (req, reply) => {
    const checked = projects.validate(req.body)
    if (checked.error) return reply.code(400).send({ error: checked.error })
    const now = Date.now()
    const max = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS next FROM projects').get().next
    const result = db
      .prepare('INSERT INTO projects (year, name, icon, href, desc_ru, desc_en, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(checked.year, checked.name, checked.icon, checked.href, checked.descRu, checked.descEn, max, now, now)
    return reply.code(201).send(projects.byId(result.lastInsertRowid))
  })

  app.put('/projects/:id', async (req, reply) => {
    const id = Number.parseInt(req.params.id, 10)
    if (!Number.isSafeInteger(id)) return reply.code(400).send({ error: 'bad_request' })
    const checked = projects.validate(req.body)
    if (checked.error) return reply.code(400).send({ error: checked.error })
    const result = db
      .prepare('UPDATE projects SET year = ?, name = ?, icon = ?, href = ?, desc_ru = ?, desc_en = ?, updated_at = ? WHERE id = ?')
      .run(checked.year, checked.name, checked.icon, checked.href, checked.descRu, checked.descEn, Date.now(), id)
    if (!result.changes) return reply.code(404).send({ error: 'not_found' })
    return projects.byId(id)
  })

  app.delete('/projects/:id', async (req, reply) => {
    const id = Number.parseInt(req.params.id, 10)
    if (!Number.isSafeInteger(id)) return reply.code(400).send({ error: 'bad_request' })
    const result = db.prepare('DELETE FROM projects WHERE id = ?').run(id)
    return result.changes ? { ok: true } : reply.code(404).send({ error: 'not_found' })
  })
}
