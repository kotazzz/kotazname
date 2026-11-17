/** Тонкий клиент API: JSON, те же куки, коды ошибок наружу. */
export class ApiError extends Error {
  constructor(code, status) {
    super(code)
    this.code = code
    this.status = status
  }
}

async function request(path, { method = 'GET', body, headers } = {}) {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? headers : { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let data = null
  try {
    data = await response.json()
  } catch {
    // пустой или не-JSON ответ
  }
  if (!response.ok) {
    throw new ApiError(data?.error || `http_${response.status}`, response.status)
  }
  return data
}

export const api = {
  get: (path) => request(path),
  post: (path, body, headers) => request(path, { method: 'POST', body, headers }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  del: (path) => request(path, { method: 'DELETE' }),
}
