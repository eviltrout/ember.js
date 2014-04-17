var fs  = require('fs');
var pickFiles = require('broccoli-static-compiler');
var compileES6 = require('broccoli-es6-concatenator');
var mergeTrees = require('broccoli-merge-trees');
var defeatureify = require('broccoli-defeatureify');
var uglifyJavaScript = require('broccoli-uglify-js');

 
var configJson = JSON.parse(fs.readFileSync("features.json").toString());

var defeatureifyConfig = {
  enabled: configJson.features,
  debugStatements: configJson.debugStatements,
  namespace: configJson.namespace,
  enableStripDebug: configJson.enableStripDebug
};

function moduleNameToPath(modulePath) {
  var pathParts = modulePath.split('/');
  var outputPathParts = [];

  if (pathParts[0] !== 'packages_es6') {
    outputPathParts = ['packages_es6', pathParts[0]]
    if (pathParts[1] !== 'tests') { 
      outputPathParts.push('lib');
    }
    if (pathParts.length === 1) {
      outputPathParts.push('main');
    } else {
      outputPathParts = outputPathParts.concat(pathParts.slice(1))
    }
  } else {
    outputPathParts.push(modulePath);
  }

  return outputPathParts.join('/') + '.js';
}

function pathToModuleName(path) {
  var moduleName = path.slice(0,-3);

  moduleName = moduleName
                .replace('packages_es6/', '')
                .replace('lib/', '')
                .replace(/\/main$/, '');

  return moduleName;
}

var legacyFilesToAppend = [
  'packages_es6/ember-metal/lib/vendor/backburner.amd.js',
  'packages_es6/ember-routing/lib/vendor/router.amd.js',
  'packages_es6/ember-routing/lib/vendor/route-recognizer.amd.js',
  'rsvp/main.js',
  'metamorph/main.js',
];

var testConfig = pickFiles('tests', {
  srcDir: '/',
  files: ['**/*.*'],
  destDir: '/tests'
});

//['container',     'ember-metal',               'ember-debug',
// 'ember-runtime', 'ember-views',               'ember-extension-support',
// 'ember-testing', 'ember-handlebars-compiler', 'ember-handlebars',
// 'ember-routing', 'ember-application']
//.forEach(function(packageName) {
//  packages.push(pickFiles('packages_es6/' + packageName, {
//    srcDir: '/',
//    destDir: '/'
//  }))
//});

var loader = pickFiles('packages/loader/lib', {
  files: ['main.js'],
  srcDir: '/',
  destDir: '/loader'
});

var rsvp = pickFiles('packages/rsvp/lib', {
  files: ['main.js'],
  srcDir: '/',
  destDir: '/rsvp'
});

var metamorph = pickFiles('packages/metamorph/lib', {
  files: ['main.js'],
  srcDir: '/',
  destDir: '/metamorph'
});

var bowerFiles = [
  pickFiles('bower_components/qunit/qunit', {
    srcDir: '/',
    destDir: '/qunit'
  }),

  pickFiles('bower_components/jquery', {
    files: ['jquery.js'],
    srcDir: '/',
    destDir: '/jquery'
  }),

  pickFiles('bower_components/handlebars', {
    files: ['handlebars.js'],
    srcDir: '/',
    destDir: '/handlebars'
  }),
];

bowerFiles = mergeTrees(bowerFiles);

var packages = pickFiles('packages_es6', {
  srcDir: '/',
  destDir: 'packages_es6'
});

var sourceTrees = [packages, loader, rsvp, metamorph];
sourceTrees = mergeTrees(sourceTrees, {overwrite: true});

var packagesJs = compileES6(sourceTrees, {
  loaderFile: 'loader/main.js',
  ignoredModules: [ ],
  inputFiles: [ 'packages_es6/**/lib/**/*.js' ],
  legacyFilesToAppend: legacyFilesToAppend,
  wrapInEval: false,
  outputFile: '/dist/ember.js',
  moduleNameToPath: moduleNameToPath,
  pathToModuleName: pathToModuleName
});

var testsJs = compileES6(sourceTrees, {
  loaderFile: 'loader/main.js',
  ignoredModules: [ ],
  inputFiles: [ 'packages_es6/**/*.js' ],
  legacyFilesToAppend: legacyFilesToAppend,
  wrapInEval: true,
  outputFile: '/dist/ember-tests.js',
  moduleNameToPath: moduleNameToPath,
  pathToModuleName: pathToModuleName
});

var defeaturedJs = defeatureify(mergeTrees([testsJs], {overwrite: true}), defeatureifyConfig);

module.exports = mergeTrees([defeaturedJs, testConfig, bowerFiles]);
