#!/usr/bin/env bash
# Dnevni backup PostgreSQL baze - pokrece se preko cron-a na serveru (vidi
# README.md "Produkcija na cPanel-u"). Cuva zadnjih BACKUP_RETENTION_DAYS
# dana lokalno u ~/backups/db/. NAPOMENA: ovo stiti od slucajnog brisanja/
# lose migracije, NE od potpunog gubitka servera - za to treba i offsite
# kopija (npr. rclone na cloud storage), nije podeseno ovdje.
set -euo pipefail

DB_NAME="${PGDATABASE:-restaurantba2_restoran}"
DB_USER="${PGUSER:-restaurantba2_Egzy}"
BACKUP_DIR="$HOME/backups/db"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILE="$BACKUP_DIR/${DB_NAME}_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

pg_dump -h 127.0.0.1 -U "$DB_USER" "$DB_NAME" | gzip > "$FILE"

echo "Backup sacuvan: $FILE ($(du -h "$FILE" | cut -f1))"

# Obrisi backupe starije od RETENTION_DAYS
find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -mtime +"$RETENTION_DAYS" -delete

echo "Trenutni backupi:"
ls -lh "$BACKUP_DIR"
