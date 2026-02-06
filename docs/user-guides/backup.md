# Backup and Restore

This guide outlines a backup strategy for Open Archiver to protect your archived emails and configuration.

## What to Backup

Open Archiver stores data across multiple components:

| Component | Contains | Backup Required? |
|-----------|----------|------------------|
| Storage folder | Raw .eml files and attachments | **Yes** - Primary data |
| PostgreSQL | Metadata, config, users, audit logs | **Yes** - Critical |
| Meilisearch | Full-text search index | Optional - Can rebuild |
| Redis/Valkey | Job queues | No - Ephemeral |

### Storage Folder (Critical)

The storage folder contains all raw email files (.eml) and attachments. This is your primary data and cannot be recreated.

**Location depends on your `STORAGE_TYPE`:**

- **Local storage**: `{STORAGE_LOCAL_ROOT_PATH}/open-archiver/`
- **S3 storage**: `{STORAGE_S3_BUCKET}/open-archiver/`

**Folder structure:**
```
open-archiver/
├── {SourceName}-{SourceId}/
│   ├── emails/
│   │   ├── INBOX/
│   │   │   ├── msg_12345.eml
│   │   │   └── msg_12346.eml
│   │   └── Sent/
│   │       └── msg_67890.eml
│   └── attachments/
│       ├── a1b2c3d-document.pdf
│       └── e4f5g6h-image.png
└── {AnotherSource}-{SourceId}/
    └── ...
```

### PostgreSQL Database (Critical)

The database stores:
- Email metadata (sender, recipients, dates, subjects, hashes)
- Ingestion source configurations and credentials
- User accounts and roles
- API keys
- Attachment records
- Audit logs

### Meilisearch Index (Optional)

The search index can be rebuilt from the database and storage files by triggering a re-index. Backing it up speeds up recovery but is not essential.

## Backup Commands

### PostgreSQL Backup

```bash
# Using pg_dump
pg_dump -h localhost -U openarchiver -d openarchiver > backup_$(date +%Y%m%d_%H%M%S).sql

# Or with Docker
docker exec openarchiver-postgres pg_dump -U openarchiver openarchiver > backup_$(date +%Y%m%d_%H%M%S).sql
```

### Storage Folder Backup

**Local to cloud (using rclone):**
```bash
# Configure rclone for your cloud provider first
rclone sync /path/to/storage/open-archiver remote:bucket/open-archiver-backup
```

**Local to local:**
```bash
rsync -av /path/to/storage/open-archiver /backup/location/
```

**If using S3 storage:**
```bash
# Enable versioning on your S3 bucket for point-in-time recovery
aws s3api put-bucket-versioning --bucket your-bucket --versioning-configuration Status=Enabled

# Or sync to another bucket
aws s3 sync s3://source-bucket/open-archiver s3://backup-bucket/open-archiver
```

### Meilisearch Backup (Optional)

```bash
# Create a dump via API
curl -X POST "http://localhost:7700/dumps" -H "Authorization: Bearer YOUR_API_KEY"

# Or copy the data directory
cp -r /path/to/meilisearch/data /backup/location/meilisearch
```

## Automated Backup Script

Here's an example script for automated backups:

```bash
#!/bin/bash
set -e

BACKUP_DIR="/backup/openarchiver/$(date +%Y%m%d)"
STORAGE_PATH="/path/to/storage"
DB_HOST="localhost"
DB_USER="openarchiver"
DB_NAME="openarchiver"

mkdir -p "$BACKUP_DIR"

echo "Backing up PostgreSQL..."
pg_dump -h "$DB_HOST" -U "$DB_USER" "$DB_NAME" | gzip > "$BACKUP_DIR/database.sql.gz"

echo "Backing up storage folder..."
rsync -av "$STORAGE_PATH/open-archiver/" "$BACKUP_DIR/storage/"

echo "Backup complete: $BACKUP_DIR"

# Optional: Upload to cloud
# rclone sync "$BACKUP_DIR" remote:openarchiver-backups/$(date +%Y%m%d)

# Optional: Remove backups older than 30 days
# find /backup/openarchiver -type d -mtime +30 -exec rm -rf {} +
```

## Restore Procedure

### 1. Restore PostgreSQL

```bash
# Drop and recreate database (if needed)
psql -h localhost -U postgres -c "DROP DATABASE IF EXISTS openarchiver;"
psql -h localhost -U postgres -c "CREATE DATABASE openarchiver OWNER openarchiver;"

# Restore from backup
psql -h localhost -U openarchiver -d openarchiver < backup.sql

# Or with gzipped backup
gunzip -c backup.sql.gz | psql -h localhost -U openarchiver -d openarchiver
```

### 2. Restore Storage Folder

```bash
rsync -av /backup/location/open-archiver/ /path/to/storage/open-archiver/
```

### 3. Rebuild Meilisearch Index (if not backed up)

After restoring the database and storage, restart Open Archiver. The search index will need to be rebuilt:

1. Go to **Admin > Jobs** in the dashboard
2. Or trigger re-indexing via API (enterprise feature)

## Backup Best Practices

1. **Test your backups** - Periodically restore to a test environment
2. **Use encryption** - Encrypt backups at rest, especially if storing in the cloud
3. **Follow 3-2-1 rule** - 3 copies, 2 different media types, 1 offsite
4. **Automate** - Use cron jobs or scheduled tasks for regular backups
5. **Monitor** - Set up alerts for backup failures
6. **Document** - Keep restore procedures documented and accessible

## Backup Frequency Recommendations

| Data | Frequency | Retention |
|------|-----------|-----------|
| PostgreSQL | Daily | 30 days |
| Storage folder | Daily (incremental) | Keep all |
| Meilisearch | Weekly (optional) | 2 versions |

For high-volume environments, consider more frequent database backups or continuous replication.
