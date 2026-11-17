import ReactMarkdown from 'react-markdown'

/** Безопасный Markdown: сырой HTML не рендерится, ссылки — в новой вкладке. */
export default function Markdown({ children }) {
  return (
    <ReactMarkdown
      components={{
        a: ({ href, children: label }) => (
          <a href={href} target="_blank" rel="noreferrer ugc">
            {label}
          </a>
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  )
}
