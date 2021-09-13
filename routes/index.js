const express = require('express');
const router = express.Router();
const helpers = require('../helpers/helpers');

router.get('/', async (req, res, next) => {
  const botSettings = await helpers.getBotSettings();
  res.status = 200;
  res.json(botSettings);
});

router.get('/status', (req, res, next) => {
  res.status = 200;
  res.json({
    status: 'BOT SERVER IS ACTIVE',
  });
});

router.get('/restart', (req, res, next) => {
  process.exit(0);
});

module.exports = router;
