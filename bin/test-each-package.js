#!/usr/bin/env node

var RSVP  = require('rsvp');
var spawn = require('child_process').spawn;
var chalk = require('chalk');

function run(queryString) {
  return new RSVP.Promise(function(resolve, reject) {
    var child = spawn('phantomjs', ['bin/qunit-runner.js', './live-dist/tests/index.html?' + queryString]);
    var result = {output: [], errors: [], code: null};

    child.stdout.on('data', function (data) {
      var string = data.toString();

      result.output.push(string);
      console.log(string);
    });

    child.stderr.on('data', function (data) {
      var string = data.toString();

      result.errors.push(string);
      console.error(chalk.red(string));
    });

    child.on('close', function (code) {
      result.code = code;

      if (code === 0) {
        resolve(result);
      } else {
        reject(result);
      }
    });
  });
}

function runInSequence(tasks) {
  var length = tasks.length;
  var current = RSVP.Promise.resolve();
  var results = new Array(length);

  for (var i = 0; i < length; ++i) {
    current = results[i] = current.then(tasks[i]);
  }

  return RSVP.Promise.all(results);
};

var packages = ['container', 'ember-metal', 'ember-runtime', 'ember-views', 'ember-handlebars', 'ember-handlebars-compiler',
  'ember-routing', 'ember-application', 'ember', 'ember-extension-support', 'ember-testing'];

var packageFunctions = [];
packages.forEach(function(packageName) {
  packageFunctions.push(function() {
    return run('package=' + packageName);
  });
  packageFunctions.push(function() {
    return run('package=' + packageName + '&enableoptionalfeatures=true')
  });
});

runInSequence(packageFunctions)
  .then(function() {
    console.log(chalk.green('Passed!'));
    process.exit(0);
  })
  .catch(function() {
    console.error(chalk.red('Failed!'));
    process.exit(1);
  });
