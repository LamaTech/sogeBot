'use strict'

var chalk = require('chalk')
var constants = require('../constants')

function Notice () {
  this.lastNoticeSent = new Date().getTime()
  this.msgCountSent = global.parser.linesParsed

  if (global.configuration.get().systems.notice === true) {
    global.parser.register(this, '!notice add', this.addNotice, constants.OWNER_ONLY)
    global.parser.register(this, '!notice list', this.listNotices, constants.OWNER_ONLY)
    global.parser.register(this, '!notice get', this.getNotice, constants.OWNER_ONLY)
    global.parser.register(this, '!notice remove', this.delNotice, constants.OWNER_ONLY)
    global.parser.register(this, '!notice', this.help, constants.OWNER_ONLY)

    // start interval for posting notices
    var self = this
    setInterval(function () {
      self.sendNotice()
    }, 60000)
  }

  console.log('Notice system loaded and ' + (global.configuration.get().systems.notice === true ? chalk.green('enabled') : chalk.red('disabled')))
}

Notice.prototype.sendNotice = function () {
  var timeIntervalInMs = global.configuration.get().systems.noticeTimeInterval * 60 * 1000
  var noticeMinChatMsg = global.configuration.get().systems.noticeMinChatMsg
  var now = new Date().getTime()

  if (now - this.lastNoticeSent >= timeIntervalInMs && global.parser.linesParsed - this.msgCountSent >= noticeMinChatMsg) {
    global.botDB.findOne({type: 'notices'}).sort({ time: 1 }).exec(function (err, item) {
      if (err) console.log(err)
      if (typeof item !== 'undefined' && item !== null) {
        global.botDB.update({type: 'notices', _id: item._id}, {$set: {time: new Date().getTime()}}, {}, function () {
          global.client.action(global.configuration.get().twitch.owner, item.text)
        })
      }
    })

    // reset counters
    this.lastNoticeSent = new Date().getTime()
    this.msgCountSent = global.parser.linesParsed
  }
}

Notice.prototype.help = function () {
  var text = 'Usage: !notice add <text> | !notice get <id> | !notice remove <id> | !notice list'
  global.client.action(global.configuration.get().twitch.owner, text)
}

Notice.prototype.addNotice = function (self, sender, text) {
  if (text.length < 1) {
    global.client.action(global.configuration.get().twitch.owner, 'Notice error: Cannot add empty notice.')
    return
  }

  var data = {_type: 'notices', _text: text, time: new Date().getTime(), success: 'Notice was succesfully added', error: 'Sorry, ' + sender + ', this notice already exists.'}
  global.commons.insertIfNotExists(data)
}

Notice.prototype.listNotices = function () {
  global.botDB.find({type: 'notices'}, function (err, docs) {
    if (err) console.log(err)
    var ids = []
    docs.forEach(function (e, i, ar) { ids.push(e._id) })
    var output = (docs.length === 0 ? 'Notice list is empty.' : 'Notice ID list: ' + ids.join(', ') + '.')
    global.client.action(global.configuration.get().twitch.owner, output)
  })
}

Notice.prototype.getNotice = function (self, user, id) {
  if (id.length < 1) {
    global.client.action(global.configuration.get().twitch.owner, 'Notice error: Cannot get notice without id.')
    return
  }

  global.botDB.findOne({type: 'notices', _id: id}, function (err, docs) {
    if (err) console.log(err)
    var output = (typeof docs === 'undefined' || docs === null ? 'Notice#' + id + ' cannot be found.' : docs.text)
    global.client.action(global.configuration.get().twitch.owner, output)
  })
}

Notice.prototype.delNotice = function (self, sender, text) {
  var data = {_type: 'notices', _id: text.trim(), success: 'Notice was succesfully removed.', error: 'Notice cannot be found.'}
  if (data._id.length < 1) {
    global.client.action(global.configuration.get().twitch.owner, 'Sorry, ' + sender + ', Notice command is not correct, check !notice')
  } else {
    global.commons.remove(data)
  }
}

module.exports = new Notice()
