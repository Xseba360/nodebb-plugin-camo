'use strict';

var NodeBB = module.parent;
var Settings = NodeBB.require("./settings");
var SocketAdmin = NodeBB.require('./socket.io/admin');

var controllers = require('./lib/controller');

var plugin = {};

var settings;
var camoUrl;
var camo;
var local;

var defaultSettings = {
    host: "",
    key: "",
    type: "path",
    http: 0,
    useCamoProxy: 0,
    port: 8082
};

// Kill worker when nodebb closes/crashes.
process.on("uncaughtException", killWorker);
process.on("SIGINT", killWorker);
process.on("SIGHUP", killWorker);
process.on("SIGUSR2", killWorker);
process.on("SIGTERM", killWorker);

plugin.init = function(params, callback) {
  var router = params.router;
  var hostMiddleware = params.middleware;
  var hostControllers = params.controllers;

  settings = new Settings('camo', '1.0.0', defaultSettings, sync);

  router.get('/admin/plugins/camo', hostMiddleware.admin.buildHeader, controllers.renderAdminPage);
  router.get('/api/admin/plugins/camo', controllers.renderAdminPage);

  SocketAdmin.settings.syncCamo = function (socket, data, next) {
    settings.sync(sync);
    next();
  };

  function sync() {
    console.log("Settings saved for Camo.");

    camoUrl = require('camo-url')({
      host: settings.get('host'),
      key: settings.get('key'),
      type: settings.get('type')
    });

    if (settings.get('useCamoProxy')) {
      killWorker();

      console.log("Starting Camo worker...");
      var options = {silent: true, env: {
        'CAMO_KEY': settings.get('key') || 'banana',
        'PORT': settings.get('port') || '8082'
      }};

      local = false;
      camo = require("child_process").spawn('node', ['/node_modules/camo/server'], options);

      camo.stdout.on('data', function (data) { console.log('CAMO PROXY SAYS: ' + data); });
      camo.stderr.on('data', function (data) { if (local) console.log('CAMO PROXY ERROR: ' + data); });
      camo.on('close', function (code) {
        if (!local) {
          local = true;
          camo = require("child_process").fork(__dirname + '/node_modules/camo/server', [], options);
        }else{
          console.log('CAMO PROXY exited with code ' + code);
        }
      });
	  camo.on('disconnect', function() {
        camo.exit();
      });
    }
  }

  callback();
};

plugin.addAdminNavigation = function(header, callback) {
  header.plugins.push({
    route: '/plugins/camo',
    icon: 'fa-image',
    name: 'Camo'
  });

  callback(null, header);
};

plugin.parseRaw = function(content, callback) {
  content = content.replace(/<img[^>]+src=['"](http[^s][^'"]+)['"][^>]*>/gi, function (match, url) {
    return match.replace(url, camoUrl(url));
  });
  callback(null, content);
};

plugin.parsePost = function(data, callback) {
  plugin.parseRaw(data.postData.content, function(err, content){
    data.postData.content = content;
    callback(null, data);
  });
};

plugin.reload = function (data, next) {
  killWorker();
  next();
};

function killWorker() {
  try {
    if (camo && camo.pid) {
      camo.kill();
      console.log("Closed Camo worker.");
    }
  }catch(e){
  }
}

module.exports = plugin;
