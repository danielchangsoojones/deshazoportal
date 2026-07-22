import { createServer } from 'node:http'
import { request as httpsRequest } from 'node:https'
import handler from 'serve-handler'

const port = Number(process.env.PORT) || 3000
const apiPrefix = '/deshazo-api'
const apiHost = 'deshazo-api.belovedrobot.com'

function rewriteCookie(cookie) {
  return cookie
    .replace(/;\s*Domain=[^;]+/gi, '')
    .replace(/;\s*Path=\/api(?=;|$)/i, `; Path=${apiPrefix}`)
}

function proxyDeshazoApi(request, response) {
  const apiPath = `/api${request.url.slice(apiPrefix.length) || '/'}`
  const headers = { ...request.headers, host: apiHost }
  delete headers.connection

  const upstreamRequest = httpsRequest(
    {
      protocol: 'https:',
      hostname: apiHost,
      method: request.method,
      path: apiPath,
      headers,
    },
    (upstreamResponse) => {
      const responseHeaders = { ...upstreamResponse.headers }
      const cookies = upstreamResponse.headers['set-cookie']
      if (cookies) responseHeaders['set-cookie'] = cookies.map(rewriteCookie)

      response.writeHead(upstreamResponse.statusCode || 502, responseHeaders)
      upstreamResponse.pipe(response)
    },
  )

  upstreamRequest.on('error', (error) => {
    console.error('DeShazo API proxy error:', error.message)
    if (!response.headersSent) {
      response.writeHead(502, { 'content-type': 'application/json' })
    }
    response.end(JSON.stringify({ error: 'DeShazo API is unavailable.' }))
  })

  request.pipe(upstreamRequest)
}

const server = createServer((request, response) => {
  if (request.url === apiPrefix || request.url?.startsWith(`${apiPrefix}/`)) {
    proxyDeshazoApi(request, response)
    return
  }

  // Always revalidate the SPA shell and route responses so a deployment cannot
  // leave an open browser tab pointing at JavaScript chunks from an older build.
  // Vite asset filenames are content-hashed and remain safe to cache indefinitely.
  if (request.url?.startsWith('/assets/')) {
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
  } else {
    response.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
    response.setHeader('Pragma', 'no-cache')
    response.setHeader('Expires', '0')
  }

  handler(request, response, {
    public: 'dist',
    rewrites: [{ source: '**', destination: '/index.html' }],
  })
})

server.listen(port, '0.0.0.0', () => {
  console.log(`DeShazo portal listening on port ${port}`)
})
