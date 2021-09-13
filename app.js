// Imports
const createError = require('http-errors');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const keys = require('./config/keys');
const Bot = require('@zapevo/model_bots');
const mongoose = require('mongoose');
const fs = require('fs');
const scheduleCronJob = require('./helpers/setupcronjob');
const mongodbstatus = require('./helpers/mongodbstatus')();
const helpers = require('./helpers/helpers');

// Routs Imports
const indexRouter = require('./routes/index');

// Initialize App
const app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

// DB Config and Get Bot Settings and save to botSettings.json
// const db = keys.mongoURI;
helpers.checkMongoConnection()
    .then(() => {
      // Import Bot Settings
      Bot.findOne({
        name: keys.botName.toLowerCase().trim(),
      }).then((foundBot) => {
        if (foundBot) {
          console.log('Bot Configurations: ', foundBot);
          const url = path.join(__dirname, 'botSettings.json');
          fs.writeFileSync(url, JSON.stringify(foundBot));
          console.log('Bot Settings Saved to botSettings.json');
          scheduleCronJob(foundBot.scheduleTime, 3);
        } else {
          console.log(`Bot not found: ${keys.botName}`);
          process.exit(0);
        }
      });
    });

// Middlewares
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({extended: false}));

// Configure Router
app.use('/', indexRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.send(err);
});

module.exports = app;
