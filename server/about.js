import { cleanBlock, isValidDate } from './util.js'

const MAX_ABOUT_CHARS = 8000

/**
 * В тексте можно писать подстановки:
 *   {{age}}        — возраст со словом: «20 лет» / «20 years»
 *   {{age_number}} — только число
 * Возраст считается в браузере по дате рождения, поэтому обновляется сам.
 */
export const DEFAULT_ABOUT = {
  ru: `Я **Котаз**, фурри-разработчик. Живу в городе Ярославль, мне {{age}}. Занимаюсь веб-разработкой и начал увлекаться микроэлектроникой. Любопытный и переменчивый, поэтому от меня можно ожидать чего угодно. Кроме того, что нужно.

Из игр в основном играю в [Minecraft](https://www.minecraft.net), [League of Legends](https://www.leagueoflegends.com), [RimWorld](https://store.steampowered.com/app/294100/RimWorld/), [Cities: Skylines](https://store.steampowered.com/app/255710/Cities_Skylines/), [Satisfactory](https://store.steampowered.com/app/526870/Satisfactory/) и [Factorio](https://www.factorio.com). Люблю казуальные игры и песочницы, но при достаточном усилии меня можно затянуть куда угодно.`,
  en: `I'm **Kotaz**, a furry developer. I live in Yaroslavl and I'm {{age}} old. I do web development and have recently gotten into microelectronics. Curious and changeable, so you can expect anything from me. Except what you need.

As for games, I mostly play [Minecraft](https://www.minecraft.net), [League of Legends](https://www.leagueoflegends.com), [RimWorld](https://store.steampowered.com/app/294100/RimWorld/), [Cities: Skylines](https://store.steampowered.com/app/255710/Cities_Skylines/), [Satisfactory](https://store.steampowered.com/app/526870/Satisfactory/) and [Factorio](https://www.factorio.com). I like casual games and sandboxes, but with enough effort you can pull me in almost anywhere.`,
}

export function createAbout(ctx) {
  const { config, db } = ctx
  const read = db.prepare('SELECT value FROM settings WHERE key = ?')
  const write = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
  )

  function seed() {
    for (const [key, value] of [
      ['about_ru', DEFAULT_ABOUT.ru],
      ['about_en', DEFAULT_ABOUT.en],
      ['birthdate', config.defaultBirthdate],
    ]) {
      db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run(key, value)
    }
  }

  const get = () => ({
    ru: read.get('about_ru')?.value ?? DEFAULT_ABOUT.ru,
    en: read.get('about_en')?.value ?? DEFAULT_ABOUT.en,
    birthdate: read.get('birthdate')?.value ?? config.defaultBirthdate,
  })

  function set(input) {
    const ru = cleanBlock(typeof input?.ru === 'string' ? input.ru : '')
    const en = cleanBlock(typeof input?.en === 'string' ? input.en : '')
    const birthdate = typeof input?.birthdate === 'string' ? input.birthdate.trim() : ''
    if (Array.from(ru).length > MAX_ABOUT_CHARS || Array.from(en).length > MAX_ABOUT_CHARS) return { error: 'text_too_long' }
    if (!isValidDate(birthdate) || new Date(`${birthdate}T00:00:00Z`) > new Date()) return { error: 'bad_birthdate' }
    write.run('about_ru', ru)
    write.run('about_en', en)
    write.run('birthdate', birthdate)
    return { value: get() }
  }

  return { seed, get, set }
}

export async function publicAboutRoutes(app, ctx) {
  app.get('/about', async (_req, reply) => {
    reply.header('Cache-Control', 'public, max-age=60')
    return ctx.about.get()
  })
}

export async function adminAboutRoutes(app, ctx) {
  app.get('/about', async () => ctx.about.get())
  app.put('/about', async (req, reply) => {
    const result = ctx.about.set(req.body)
    if (result.error) return reply.code(400).send({ error: result.error })
    return result.value
  })
}
