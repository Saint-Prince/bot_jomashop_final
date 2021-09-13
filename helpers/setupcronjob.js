const schedule = require('node-schedule');
const helpers = require('./helpers');

module.exports = (dateObject, delayInDays) => {
  // Extract Hours and Minutes from bot.scheduleTime in server time zone
  const hours = dateObject.getHours();
  const minutes = dateObject.getMinutes();

  // Setup Cron job at scheduleTime
  const job = schedule.scheduleJob(`0 ${minutes} ${hours} * * *`,
      (fireDate) => {
        helpers.runBot();
      });
  console.log(`Cron job configured at ${hours}:${minutes}...`);
};
