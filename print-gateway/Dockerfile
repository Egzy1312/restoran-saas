# Print Gateway Agent - namjenski se pokrece NA LOKALNOJ mrezi restorana
# (isti LAN kao termalni printeri, port 9100), NE u cloud-u. Ova slika je
# ovdje radi konzistentnosti i za restorane koji zele agenta na malom
# uredjaju (npr. Raspberry Pi sa Dockerom) umjesto golog Node procesa.
# NIJE ukljucena u root docker-compose.yml - vidi docker-compose.print-gateway.yml.
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
CMD ["node", "src/index.js"]
