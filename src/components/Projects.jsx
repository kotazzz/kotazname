import { useEffect, useState } from 'react'
import * as icons from 'lucide-react'
import { ChevronDown, ExternalLink } from 'lucide-react'
import { api } from '@/lib/api'

const TITLE = { ru: 'Проекты', en: 'Projects' }
const MORE = { ru: ['Все проекты', 'Свернуть'], en: ['All projects', 'Show less'] }
const SHOWN = 6

/** Список проектов с иконками; сортируются на сервере по годам, редактируются в админке. */
export default function Projects({ lang }) {
  const [projects, setProjects] = useState(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    let alive = true
    api
      .get('/api/pub/projects')
      .then((data) => alive && setProjects(data.items))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  if (!projects?.length) return null
  const items = expanded ? projects : projects.slice(0, SHOWN)

  return (
    <section className="section rise" style={{ animationDelay: '0.4s' }} aria-label={TITLE[lang]}>
      <h2 className="section-title">{TITLE[lang]}</h2>
      <ul className="projects">
        {items.map((project) => {
          const Icon = icons[project.icon] ?? icons.Folder
          return (
            <li key={project.id} className="project">
              <span className="project-icon" aria-hidden="true">
                <Icon size={16} strokeWidth={1.8} />
              </span>
              <div className="project-body">
                <div className="project-head">
                  <span className="project-year">{project.year}</span>
                  <a className="project-name" href={project.href} target="_blank" rel="noreferrer">
                    {project.name}
                    <ExternalLink size={11} aria-hidden="true" />
                  </a>
                </div>
                <p className="project-desc">{lang === 'ru' ? project.descRu : project.descEn}</p>
              </div>
            </li>
          )
        })}
      </ul>
      {projects.length > SHOWN && (
        <button type="button" className="projects-more" onClick={() => setExpanded((value) => !value)}>
          {MORE[lang][expanded ? 1 : 0]}
          <ChevronDown size={14} className={expanded ? 'flip' : undefined} aria-hidden="true" />
        </button>
      )}
    </section>
  )
}
