// Emulira termalni printer - sluša TCP i dumpuje sirove primljene bajtove.
const net = require('net');
const port = Number(process.argv[2] || 19100);
const label = process.argv[3] || 'printer';

const server = net.createServer((socket) => {
  const chunks = [];
  socket.on('data', (d) => chunks.push(d));
  socket.on('end', () => {
    const buf = Buffer.concat(chunks);
    console.log(`[${label}] primio ${buf.length} bajtova:`);
    console.log(buf.toString('latin1').replace(/[\x00-\x08\x0b-\x1f]/g, '·'));
    console.log('---');
  });
});

server.listen(port, '127.0.0.1', () => console.log(`[${label}] slusa na 127.0.0.1:${port}`));
