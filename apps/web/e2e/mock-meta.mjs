// A stand-in for Meta's Graph API during end-to-end tests. Records every call so tests can
// read what Wes sent with GET /_calls. Never used outside tests.
import { createServer } from 'node:http';

const calls = [];
const port = Number(process.env.MOCK_META_PORT ?? 4200);

createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/healthz') return res.end('ok');
  if (req.method === 'GET' && req.url === '/_calls') {
    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify(calls));
  }
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const json = (req.headers['content-type'] ?? '').includes('json');
    calls.push({ path: req.url, body: json ? JSON.parse(raw || '{}') : '(file)' });
    res.setHeader('content-type', 'application/json');
    res.end(
      JSON.stringify(
        req.url?.endsWith('/media')
          ? { id: 'media-1' }
          : { messages: [{ id: `wamid.${calls.length}` }] },
      ),
    );
  });
}).listen(port, '127.0.0.1');
