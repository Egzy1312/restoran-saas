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
    // Next.js apps koriste 'output: standalone' (next.config.js) - minimalan
    // node_modules footprint, bitno na serveru sa malo RAM-a. 'next start' NE
    // radi ispravno sa standalone-om (upozorenje pri pokretanju) - mora ici
    // direktno preko generisanog server.js. Statika/public se kopira u njega
    // preko "postbuild" skripte u package.json (mora se pokrenuti nakon svakog builda).
    {
      name: 'restoran-admin',
      cwd: __dirname + '/admin',
      script: '.next/standalone/server.js',
      env: { NODE_ENV: 'production', PORT: '3005' },
    },
    {
      name: 'restoran-pwa',
      cwd: __dirname + '/pwa',
      script: '.next/standalone/server.js',
      env: { NODE_ENV: 'production', PORT: '3002' },
    },
    {
      name: 'restoran-kds',
      cwd: __dirname + '/kds',
      script: '.next/standalone/server.js',
      env: { NODE_ENV: 'production', PORT: '3003' },
    },
    {
      name: 'restoran-waiter',
      cwd: __dirname + '/waiter',
      script: '.next/standalone/server.js',
      env: { NODE_ENV: 'production', PORT: '3004' },
    },
  ],
};
