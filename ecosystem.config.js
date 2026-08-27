// PM2 process manager konfiguracija - koristi se na cPanel shared hostingu bez
// Docker-a (vidi README.md "Produkcija na cPanel-u bez Node.js App Manager-a").
// Svaki servis ima svoj port; Apache .htaccess po poddomenu proxy-ja na njega.
module.exports = {
  apps: [
    {
      name: 'restoran-api',
      cwd: __dirname + '/api',
      script: 'dist/main.js',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'restoran-ws',
      cwd: __dirname + '/websocket-gateway',
      script: 'dist/main.js',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'restoran-admin',
      cwd: __dirname + '/admin',
      script: 'node_modules/.bin/next',
      args: 'start',
      env: { NODE_ENV: 'production', PORT: '3005' },
    },
    {
      name: 'restoran-pwa',
      cwd: __dirname + '/pwa',
      script: 'node_modules/.bin/next',
      args: 'start',
      env: { NODE_ENV: 'production', PORT: '3002' },
    },
    {
      name: 'restoran-kds',
      cwd: __dirname + '/kds',
      script: 'node_modules/.bin/next',
      args: 'start',
      env: { NODE_ENV: 'production', PORT: '3003' },
    },
    {
      name: 'restoran-waiter',
      cwd: __dirname + '/waiter',
      script: 'node_modules/.bin/next',
      args: 'start',
      env: { NODE_ENV: 'production', PORT: '3004' },
    },
  ],
};
