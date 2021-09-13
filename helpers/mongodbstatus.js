// require mongoose module
const mongoose = require('mongoose');

// require chalk module to give colors to console text
const chalk = require('chalk');

// require database URL
const dbURL = require('../config/keys').mongoURI;

const connected = chalk.bold.cyan;
const error = chalk.bold.yellow;
const disconnected = chalk.bold.red;
const termination = chalk.bold.magenta;

// export this function and imported by app.js
module.exports = function() {
  // mongoose.connect(dbURL, {
  //   useNewUrlParser: true,
  //   useFindAndModify: false,
  // });

  mongoose.connection.on('connected', function() {
    console.log(connected('MongoDB Connected on: ', dbURL));
  });

  mongoose.connection.on('error', function(err) {
    console.log(error('MongoDB Connection Error:  ' + err));
  });

  mongoose.connection.on('disconnected', function() {
    console.log(disconnected('MongoDB Disconnected...'));
  });

  process.on('SIGINT', function() {
    mongoose.connection.close(function() {
      console.log(termination('MongoDB Disconnected due to application termination...'));
      process.exit(0);
    });
  });
};
