const mongoose = require('mongoose');

const SlackSchema = new mongoose.Schema({
  webHook: {
    type: String,
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
});

module.exports = mongoose.model('Slack', SlackSchema);
