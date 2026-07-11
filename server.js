const express = require('express');
const compression = require('compression');
const path = require('path');
const VERSION = require('./version.json');
const { db } = require('./src/db');
const { PORT, ROOT_DIR, LOG_RETENTION_DAYS } = require('./src/config');
const {
  authMiddleware,
  blacklistCheckLimiter,
  corsMiddleware,
  generalLimiter,
  jsonParser,
  logLimiter,
  loginLimiter,
  requireTrustedAdminOrigin,
  securityHeaders
} = require('./src/middleware');
const { cleanExpiredBans, cleanOldLogs, createGeoService } = require('./src/utils');
const createPublicRouter = require('./src/routes/public');
const createAdminRouter = require('./src/routes/admin');
const createHealthRouter = require('./src/routes/health');

const app = express();
const geoService = createGeoService(db);

app.use(compression());
app.set('trust proxy', 1);
app.use(securityHeaders);
app.use(corsMiddleware);
app.use(jsonParser);
app.use(createHealthRouter({ db }));

cleanOldLogs(db);
setInterval(() => cleanOldLogs(db), 60 * 60 * 1000);

cleanExpiredBans(db);
setInterval(() => cleanExpiredBans(db), 10 * 60 * 1000);

setInterval(() => {
  try { db.pragma('wal_checkpoint(PASSIVE)'); } catch (e) {}
}, 30 * 60 * 1000);

const { router: adminRouter, cleanExpiredLoginAttempts } = createAdminRouter({ db, authMiddleware, loginLimiter });
setInterval(cleanExpiredLoginAttempts, 60 * 60 * 1000);

app.use('/api/admin', requireTrustedAdminOrigin);
app.use(createPublicRouter({
  db,
  authMiddleware,
  generalLimiter,
  logLimiter,
  blacklistCheckLimiter,
  geoService
}));
app.use(adminRouter);

app.use((req, res, next) => {
  if (req.path === '/service-worker.js') {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  } else if (/\.(png|ico|json)$/.test(req.path)) {
    res.setHeader('Cache-Control', 'public, max-age=604800');
  } else if (req.path === '/' || req.path.endsWith('.html')) {
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=3600');
  }
  next();
});

app.post(['/admin', '/admin/'], (req, res) => {
  return res.redirect(303, '/admin/');
});
app.use('/admin', express.static(path.join(ROOT_DIR, 'admin'), { etag: true, maxAge: '1h' }));
app.use(express.static(path.join(ROOT_DIR, 'public'), { etag: true }));

app.listen(PORT, () => {
  console.log(`HHT Backend ${VERSION.version} running on port ${PORT}`);
  console.log(`Log retention: ${LOG_RETENTION_DAYS} days`);
  console.log('Rate limiting: enabled');
  console.log('Trust proxy: enabled');
});
