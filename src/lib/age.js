const MS_YEAR = 365.2425 * 24 * 60 * 60 * 1000

/** Полных лет с даты рождения (YYYY-MM-DD) на сейчас. */
export function ageNumber(birthdate, now = new Date()) {
  const [y, m, d] = String(birthdate).split('-').map(Number)
  if (!y || !m || !d) return null
  let age = now.getFullYear() - y
  const monthDay = (now.getMonth() + 1) * 100 + now.getDate()
  if (monthDay < m * 100 + d) age -= 1
  return age >= 0 && age < 130 ? age : null
}

const RU_FORMS = ['год', 'года', 'лет']

export function ruYears(n) {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return `${n} ${RU_FORMS[0]}`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} ${RU_FORMS[1]}`
  return `${n} ${RU_FORMS[2]}`
}

/** «20 лет» / «20 years» по дате рождения. */
export function ageText(birthdate, lang, now = new Date()) {
  const age = ageNumber(birthdate, now)
  if (age === null) return ''
  return lang === 'ru' ? ruYears(age) : `${age} years`
}

/**
 * Подстановки в тексте «обо мне»: {{age}} и {{age_number}}.
 * Считается в браузере, поэтому дата обновляется сама, без правок текста.
 */
export function fillAge(text, birthdate, lang, now = new Date()) {
  const age = ageNumber(birthdate, now)
  if (age === null) return text
  return String(text)
    .replaceAll('{{age_number}}', String(age))
    .replaceAll('{{age}}', ageText(birthdate, lang, now))
}
