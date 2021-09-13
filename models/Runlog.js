const mongoose = require('mongoose');
const moment = require('moment');

// Schema Setup
const runlogSchema = new mongoose.Schema({
  bot: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Bot',
  },
  startTime: {
    type: Date,
  },
  endTime: {
    type: Date,
  },
  successPages: Number,
  errorPages: Number,
  runStatus: String,
  errorText: String,
  updatedPrices: Number,
});

// Calculate and Return Duration of bot run in minutes
runlogSchema.virtual('duration').get(function () {
  // if (this.startTime && this.endTime) {
  const start = moment(this.startTime);
  const end = moment(this.endTime);
  const duration = end.diff(start, 'minutes');
  return duration;
  // } else {
  // return 'ERROR';
  // }
});

// Calculate and Return Total No of Pages Crawled
runlogSchema.virtual('crawledPages').get(function () {
  // if (this.successPages && this.errorPages) {
  const noofCrawledPages = this.successPages + this.errorPages;
  return noofCrawledPages;
  // } else {
  // return 'ERROR';
  // }
});

// Calculate and Return Speed per Hour
runlogSchema.virtual('speed').get(function() {
  // if (this.startTime && this.endTime && this.successPages && this.errorPages) {
  const start = moment(this.startTime);
  const end = moment(this.endTime);
  const duration = end.diff(start, 'minutes');
  // const durationInHours = duration / 60;
  const noofCrawledPages = this.successPages + this.errorPages;
  const crawlSpeed = Math.round(noofCrawledPages / duration);
  return crawlSpeed;
  // } else {
  // return 'ERROR';
  // }
});

runlogSchema.set('toObject', {virtuals: true});
runlogSchema.set('toJSON', {virtuals: true});

module.exports = mongoose.model('Runlog', runlogSchema);
