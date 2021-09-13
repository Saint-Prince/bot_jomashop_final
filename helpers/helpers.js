const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const keys = require('../config/keys');
const Bot = require('@zapevo/model_bots');
const bot = require('../bot');
const RunLog = require('../models/Runlog');
const slack = require('./slack');

module.exports.runBot = async () => {
  const botSettings = await this.getBotSettings();
  // Check if Bot is enabled
  if (botSettings.enabled) {
    // Set Last run record in db for bot
    await setLastRun();
    // Change bot Status to RUNNING
    await setBotStatus('RUNNING');
    // Run the bot
    const returnedRunLog = await bot.run();
    // Save Run Log
    await saveRunLog(returnedRunLog);
    // Once Bot is finished, set bot status to IDLE
    await setBotStatus('IDLE');
  } else {
    console.log(`Unable to run bot. ${botSettings.name} is set to disabled...`);
  }
};

module.exports.checkMongoConnection = async () => {
  if (mongoose.connection.readyState == 0) {
    const db = keys.mongoURI;
    await mongoose.connect(db, {
      useNewUrlParser: true,
      useFindAndModify: false,
      useUnifiedTopology: true,
    });
  }
};

module.exports.getBotSettings = async () => {
  const url = path.resolve(__dirname, '../botSettings.json');
  return JSON.parse(fs.readFileSync(url, 'utf8'));
};

const setBotStatus = async (newstatus) => {
  await this.checkMongoConnection();
  const bot = await this.getBotSettings();
  await Bot.findByIdAndUpdate(bot._id, {status: newstatus}).exec();
  console.log(`Bot Status set to: ${newstatus}...`);
};

const setLastRun = async () => {
  await this.checkMongoConnection();
  const bot = await this.getBotSettings();
  await Bot.findByIdAndUpdate(bot._id, {lastRun: new Date()}).exec();
  console.log(`Last Run for Bot Set...`);
};

const saveRunLog = async (log) => {
  await this.checkMongoConnection();
  const newRunLog = new RunLog(log);
  await newRunLog.save();
  if (log.runStatus == 'FAIL') {
    await slack.sendToSlack(log.errorText);
  };
  console.log(`Run Log Saved...`);
};
