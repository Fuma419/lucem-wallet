#!/usr/bin/env node
/**
 * Local static preview for build/ — same behavior as `serve build` but prints
 * the wallet entry URL (mainPopup.html) in the "Accepting connections" line.
 */
const http = require('http');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');
const chalk = require('chalk');
const compression = require('compression');
const handler = require('serve-handler');

const compress = promisify(compression());

const root = path.join(__dirname, '..');
const buildDir = path.join(root, 'build');
const serveJsonPath = path.join(buildDir, 'serve.json');

const preferredPort = parseInt(
  process.argv[2] || process.env.PORT || '3000',
  10
);

let config = { public: buildDir };
if (fs.existsSync(serveJsonPath)) {
  try {
    const fromFile = JSON.parse(fs.readFileSync(serveJsonPath, 'utf8'));
    config = { ...fromFile, public: buildDir };
  } catch (e) {
    console.error('Invalid build/serve.json:', e.message);
    process.exit(1);
  }
}

const httpLog = (...message) =>
  console.info(chalk.bgBlue.bold(' HTTP '), ...message);

const server = http.createServer((request, response) => {
  const run = async () => {
    const requestTime = new Date();
    const formattedTime = `${requestTime.toLocaleDateString()} ${requestTime.toLocaleTimeString()}`;
    const ipAddress =
      request.socket.remoteAddress?.replace('::ffff:', '') ?? 'unknown';
    httpLog(
      chalk.dim(formattedTime),
      chalk.yellow(ipAddress),
      chalk.cyan(`${request.method ?? 'GET'} ${request.url ?? '/'}`)
    );
    await compress(request, response);
    await handler(request, response, config);
    const responseTime = Date.now() - requestTime.getTime();
    httpLog(
      chalk.dim(formattedTime),
      chalk.yellow(ipAddress),
      chalk[response.statusCode < 400 ? 'green' : 'red'](
        `Returned ${response.statusCode} in ${responseTime} ms`
      )
    );
  };
  run().catch((error) => {
    console.error(error);
    if (!response.headersSent) {
      response.statusCode = 500;
      response.end('Internal Server Error');
    }
  });
});

/**
 * Bind to preferredPort, or if busy (e.g. webpack-dev-server on 3000), use an ephemeral port.
 */
function listenWithFallback(httpServer, port) {
  return new Promise((resolve, reject) => {
    const tryListen = (p) => {
      const onError = (err) => {
        httpServer.removeListener('error', onError);
        if (err.code === 'EADDRINUSE' && p !== 0) {
          console.warn(
            chalk.yellow(
              `Port ${port} is already in use (e.g. npm start). Using a free port instead — set PORT=… to pick one.`
            )
          );
          tryListen(0);
        } else {
          reject(err);
        }
      };
      httpServer.on('error', onError);
      httpServer.listen(p, () => {
        httpServer.removeListener('error', onError);
        resolve(httpServer.address().port);
      });
    };
    tryListen(port);
  });
}

listenWithFallback(server, preferredPort)
  .then((actualPort) => {
    console.info(
      chalk.bgMagenta.bold(' INFO '),
      `Accepting connections at http://localhost:${actualPort}/mainPopup.html`
    );
  })
  .catch((err) => {
    console.error(chalk.red('Failed to start preview server:'), err.message);
    process.exit(1);
  });

function shutdown() {
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
