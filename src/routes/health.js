// Copyright (c) 2026 GeniusLv2006
// SPDX-License-Identifier: MPL-2.0

const express = require('express');
const VERSION = require('../../version.json');

function createHealthRouter({ db }) {
  const router = express.Router();

  router.get('/healthz', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');

    try {
      db.prepare('SELECT 1').get();
      return res.json({ status: 'ok', version: VERSION.version });
    } catch {
      return res.status(503).json({ status: 'unavailable' });
    }
  });

  return router;
}

module.exports = createHealthRouter;
