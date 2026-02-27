import http from 'node:http';

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.statusCode = 200;
    res.end('ok');
    return;
  }

  res.statusCode = 404;
  res.end('not found');
});

server.listen(3101, '127.0.0.1');

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
