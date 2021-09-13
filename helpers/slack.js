const Slack = require('../models/Slack');
const helpers = require('./helpers');
const axios = require('axios');

module.exports.sendToSlack = (errorText) =>
  new Promise(async (resolve, reject) => {
    try {
      // Connect to MongoDB if not connected already
      await helpers.checkMongoConnection();

      // Get Slack Information from MongoDB
      const allSlacks = await Slack.find();

      if (allSlacks.length > 0) {
        const slackInfo = allSlacks[0];
        const bot = await helpers.getBotSettings();
        const botName = 'Bot ' + bot.name.charAt(0).toUpperCase() + bot.name.slice(1);
        const data = {
          text: `*${botName}*\n${slackInfo.message}\nError: ${errorText}`,
        };

        // Send message to Slack webHook
        await axios.post(slackInfo.webHook, data);

        return resolve(true);
      } else {
        console.log('No Slack Info Found In Database...');
      }

      resolve(true);
    } catch (error) {
      console.log(`sendToSlack Error: ${error.name}, ${error.message}`);
      reject(error);
    }
  });
