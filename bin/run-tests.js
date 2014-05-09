#!/usr/bin/env node

var RSVP  = require('rsvp');
var spawn = require('child_process').spawn;
var chalk = require('chalk');
var packages = require('../lib/packages');
var runInSequence = require('../lib/runInSequence');


function shouldPrint(inputString) {
  var skipStrings = [
    "*** WARNING: Method userSpaceScaleFactor",
    "CoreText performance note:",
  ]

  for (var i = 0; i < skipStrings.length; i++) {
    if (inputString.indexOf(skipStrings[i])) {
      return false;
    }
  }

  return true;
}

function run(queryString) {
  return new RSVP.Promise(function(resolve, reject) {
    var args = ['bin/qunit-runner.js', './live-dist/tests/index.html?' + queryString];

    console.log('Running: phantomjs ' + args.join(' '));

    var child = spawn('phantomjs', args);
    var result = {output: [], errors: [], code: null};

    child.stdout.on('data', function (data) {
      var string = data.toString();
      var lines = string.split('\n');

      lines.forEach(function(line) {
        if (line.indexOf('0 failed.')) {
          console.log(chalk.green(line));
        } else {
          console.log(line);
        }
      });
      result.output.push(string);
    });

    child.stderr.on('data', function (data) {
      var string = data.toString();

      if (shouldPrint(string)) {
        result.errors.push(string);
        console.error(chalk.red(string));
      }
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

var testFunctions = [];

function generateEachPackageTests() {
  Object.keys(packages).forEach(function(packageName) {
    if (packages[packageName].skipTests) { return; }

    testFunctions.push(function() {
      return run('package=' + packageName);
    });
    testFunctions.push(function() {
      return run('package=' + packageName + '&enableoptionalfeatures=true')
    });
  });
}

runInSequence(testFunctions)
  .then(function() {
    console.log(chalk.green('Passed!'));
    process.exit(0);
  })
  .catch(function() {
    console.error(chalk.red('Failed!'));
    process.exit(1);
  });
