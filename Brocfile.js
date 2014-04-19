var fs  = require('fs');
var util = require('util');
var path = require('path');
var pickFiles = require('broccoli-static-compiler');
//var compileES6 = require('broccoli-es6-concatenator');
var transpileES6 = require('broccoli-es6-module-transpiler');
var mergeTrees = require('broccoli-merge-trees');
var defeatureify = require('broccoli-defeatureify');
var concat = require('broccoli-concat');
var uglifyJavaScript = require('broccoli-uglify-js');
var helpers = require('broccoli-kitchen-sink-helpers')
var Writer = require('broccoli-writer');

var globalWrapInEval = false;

var Writer = require('broccoli-writer');

Mover.prototype = Object.create(Writer.prototype);
Mover.prototype.constructor = Mover;
function Mover (inputTree, options) {
  if (!(this instanceof Mover)) return new Mover(inputTree, options);

  this.inputTree = inputTree;
  this.srcFile   = options.srcFile;
  this.destFile  = options.destFile;
  this.copy      = options.copy;
};

Mover.prototype.write = function (readTree, destDir) {
  var self = this

  return readTree(this.inputTree).then(function (srcDir) {
    helpers.copyRecursivelySync(srcDir, destDir);
    helpers.copyRecursivelySync(
      path.join(destDir, self.srcFile),
      path.join(destDir, self.destFile));

    if (!self.copy) { fs.unlinkSync(path.join(destDir, self.srcFile)); }
  })
};

var moveFile = Mover;

function defeatureifyConfig(stripDebug) {
  var configJson = JSON.parse(fs.readFileSync("features.json").toString());

  return {
    enabled: configJson.features,
    debugStatements: configJson.debugStatements,
    namespace: configJson.namespace,
    enableStripDebug: stripDebug
  };
}

function vendoredPackage(packageName) {
  var libTree = pickFiles('packages/' + packageName + '/lib', {
    files: ['main.js'],
    srcDir: '/',
    destDir: '/' + packageName
  });

  return {lib: moveFile(libTree, {
    srcFile: packageName + '/main.js',
    destFile: '/' + packageName + '.js'
  })};
};

function concatES6(sourceTrees, inputFiles, destFile) {
  if (util.isArray(sourceTrees)) {
    sourceTrees = mergeTrees(sourceTrees, {overwrite: true});
  }

  if (typeof inputFiles === 'string') {
    inputFiles = [inputFiles];
  }
  inputFiles.unshift('loader.js');

  sourceTrees = transpileES6(sourceTrees, {
    moduleName: true
  });
  sourceTrees = defeatureify(sourceTrees, defeatureifyConfig());

  return concat(mergeTrees([loader, sourceTrees]), {
    inputFiles: inputFiles,
    outputFile: destFile
  });
}

var testConfig = pickFiles('tests', {
  srcDir: '/',
  files: ['**/*.*'],
  destDir: '/tests'
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

var loader = vendoredPackage('loader').lib;

var packages = {
  // vendored packages
  //'loader':                     {trees: vendoredPackage('loader'),           requirements: []},
  'rsvp':                       {trees: vendoredPackage('rsvp'),             requirements: []},
  'metamorph':                  {trees: vendoredPackage('metamorph'),        requirements: []},
  'backburner':                 {trees: vendoredPackage('backburner'),       requirements: []},
  'router':                     {trees: vendoredPackage('router'),           requirements: []},
  'route-recognizer':           {trees: vendoredPackage('route-recognizer'), requirements: []},

  'container':                  {trees: null,  requirements: []},
  'ember-metal':                {trees: null,  requirements: ['backburner']},
  'ember-debug':                {trees: null,  requirements: ['ember-metal'], skipTests: true},
  'ember-runtime':              {trees: null,  requirements: ['container', 'rsvp', 'ember-metal']},
  'ember-views':                {trees: null,  requirements: ['ember-runtime']},
  'ember-extension-support':    {trees: null,  requirements: ['ember-application']},
  'ember-testing':              {trees: null,  requirements: ['ember-application', 'ember-routing']},
  'ember-handlebars-compiler':  {trees: null,  requirements: ['ember-views']},
  'ember-handlebars':           {trees: null,  requirements: ['metamorph', 'ember-views', 'ember-handlebars-compiler']},
  'ember-routing':              {trees: null,  requirements: ['router', 'route-recognizer', 'ember-runtime', 'ember-views', 'ember-handlebars']},
  'ember-application':          {trees: null,  requirements: ['ember-routing']}
};

function es6Package(packageName) {
  var pkg = packages[packageName],
      libTree;

  if (pkg['trees']) {
    return pkg['trees'];
  }

  var dependencyTrees = packageDependencyTree(packageName);

  var libTree = pickFiles('packages_es6/' + packageName + '/lib', {
    srcDir: '/',
    destDir: packageName
  });

  libTree = moveFile(libTree, {
    srcFile: packageName + '/main.js',
    destFile: packageName + '.js'
  });

  var testTree = pickFiles('packages_es6/' + packageName + '/tests', {
    srcDir: '/',
    destDir: '/' + packageName + '/tests'
  });

  var compiledLib = concatES6([dependencyTrees, libTree], '**/*.js', '/dist/' + packageName + '.js')
  var compiledTrees = [compiledLib];

  var compiledTest;
  if (!pkg.skipTests) {
    compiledTest = concatES6(testTree, '**/*.js', '/dist/' + packageName + '-tests.js');

    compiledTrees.push(compiledTest);
  }

  compiledTrees = mergeTrees(compiledTrees);

  pkg['trees'] = { lib: libTree, compiledTree: compiledTrees};
  if (!pkg.skipTests) { pkg['trees'].tests = testTree; }

  return pkg.trees 
}

function packageDependencyTree(packageName) {
  var dependencyTrees = packages[packageName]['dependencyTrees'];

  if (dependencyTrees) {
    return dependencyTrees;
  } else {
    dependencyTrees = [];
  }

  var requiredDependencies = packages[packageName]['requirements'];
  var libTrees = [];

  requiredDependencies.forEach(function(dependency) {
    libTrees.concat(packageDependencyTree(dependency));
    libTrees.push(es6Package(dependency).lib);
  }, this);

  return packages[packageName]['dependencyTrees'] = mergeTrees(libTrees, {overwrite: true});
}

var sourceTrees          = [];
var testTrees            = [];
var compiledPackageTrees = [];

for (var packageName in packages) {
  es6Package(packageName);
  var packagesTrees = packages[packageName]['trees'];

  if (packagesTrees.lib) {
    sourceTrees.push(packagesTrees.lib);
  }

  if (packagesTrees.compiledTree) {
    compiledPackageTrees.push(packagesTrees.compiledTree);
  }

  if (packagesTrees.tests) {
    testTrees.push(packagesTrees.tests);
  }
}

compiledPackageTrees = mergeTrees(compiledPackageTrees);
var compiledSource = concatES6(sourceTrees, '**/*.js', '/dist/ember.js');
var compiledTests = concatES6(testTrees, '**/*.js', '/dist/ember-tests.js');
var distTrees = [compiledSource, compiledTests, testConfig, bowerFiles];
distTrees.push(compiledPackageTrees);

distTrees = mergeTrees(distTrees);

module.exports = distTrees;
