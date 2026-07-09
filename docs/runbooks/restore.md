# Runbook — Backup & Restore

Blueprint §2.14. RPO 24 h (MVP), RTO < 2 h.

## Backup strategy

| Env | Mechanism | Cadence |
|---|---|---|
| Prod (Atlas M10+) | Atlas continuous backups | continuous |
| Prod (Atlas M0 free) | scheduled `mongodump` to a second location via GitHub Action | daily |
| Local | none needed (docker volume `mongo-data`) | — |

## Daily dump (Atlas M0 fallback)

```bash
mongodump --uri "$MONGO_URI" --archive="courtbook-$(date +%F).gz" --gzip
```

Store the archive off-cluster (GitHub Action artifact, S3-compatible bucket, etc.).

## Restore

1. Provision a fresh cluster / DB (or drop the corrupt one).
2. Restore the latest good archive:
   ```bash
   mongorestore --uri "$MONGO_URI" --archive="courtbook-YYYY-MM-DD.gz" --gzip --drop
   ```
3. **Recreate indexes.** Indexes are created by mongoose autoIndex at app start
   today (§5.3 migrate-mongo deferred). After a restore, boot one API instance
   and confirm the sacred booking index exists:
   ```bash
   mongosh "$MONGO_URI" --eval '
     db.bookings.getIndexes().find(i =>
       i.name === "courtId_1_date_1_startMin_1" && i.unique && i.partialFilterExpression)
       ? print("OK: booking uniqueness index present")
       : (print("MISSING booking uniqueness index — recreate before serving"), quit(1))'
   ```
   If missing, recreate exactly (blueprint §5.2):
   ```js
   db.bookings.createIndex(
     { courtId: 1, date: 1, startMin: 1 },
     { unique: true, partialFilterExpression: { status: { $in: ["pending_payment", "confirmed"] } } })
   ```
4. Redeploy the API (Render instant rollback or fresh deploy).
5. Smoke test: `GET /api/v1/health` → `db:"up"`; create + cancel a test booking.

## Known restore gotcha

Mongoose **cannot** replace a same-name index with different options
(learned in dev, M3). If a restore leaves a stale index (e.g. the old *sparse*
idempotency index), drop and recreate it manually — autoIndex will not fix it.
