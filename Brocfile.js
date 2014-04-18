var fs  = require('fs');
var path = require('path');
var pickFiles = require('broccoli-static-compiler');
var compileES6 = require('broccoli-es6-concatenator');
var mergeTrees = require('broccoli-merge-trees');
var defeatureify = require('broccoli-defeatureify');
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
};

Mover.prototype.write = function (readTree, destDir) {
  var self = this

  return readTree(this.inputTree).then(function (srcDir) {
    helpers.copyRecursivelySync(
      path.join(srcDir, self.srcFile),
      path.join(destDir, self.destFile))
  })
};

var moveFile = Mover;

function defeatureifyConfig() {
  var configJson = JSON.parse(fs.readFileSync("features.json").toString());

  return {
    enabled: configJson.features,
    debugStatements: configJson.debugStatements,
    namespace: configJson.namespace,
    enableStripDebug: configJson.enableStripDebug
  };
}

function vendoredPackage(packageName) {
 return {
   lib: pickFiles('packages/' + packageName + '/lib', {
     files: ['main.js'],
     srcDir: '/',
     destDir: '/' + packageName
   })
 };
};

var metalLegacyFiles = [ 'ember-metal/vendor/backburner.amd.js'];
var routingLegacyFiles = [
  'ember-routing/vendor/router.amd.js',
  'ember-routing/vendor/route-recognizer.amd.js'
];

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

var packages = {
  // vendored packages
  'loader':                     {trees: vendoredPackage('loader'),    requirements: []},
  'rsvp':                       {trees: vendoredPackage('rsvp'),      requirements: []},
  'metamorph':                  {trees: vendoredPackage('metamorph'), requirements: []},

  'container':                  {trees: null,  requirements: []},
  'ember-metal':                {trees: null,  requirements: [], legacyFiles: metalLegacyFiles},
  'ember-debug':                {trees: null,  requirements: ['ember-metal']},
  'ember-runtime':              {trees: null,  requirements: ['container', 'rsvp', 'ember-metal']},
  'ember-views':                {trees: null,  requirements: ['ember-runtime']},
  'ember-extension-support':    {trees: null,  requirements: ['ember-application']},
  'ember-testing':              {trees: null,  requirements: ['ember-application', 'ember-routing']},
  'ember-handlebars-compiler':  {trees: null,  requirements: ['ember-views']},
  'ember-handlebars':           {trees: null,  requirements: ['metamorph', 'ember-views', 'ember-handlebars-compiler']},
  'ember-routing':              {trees: null,  requirements: ['ember-runtime', 'ember-views', 'ember-handlebars'], legacyFiles: routingLegacyFiles},
  'ember-application':          {trees: null,  requirements: ['ember-routing']}
};

function es6Package(packageName) {
  if (packages[packageName]['trees']) {
    return packages[packageName]['trees'];
  }

  var dependencyTrees = packageDependencyTree(packageName);
  var loader = packages.loader.trees.lib;

  var packageLib = pickFiles('packages_es6/' + packageName + '/lib', {
    srcDir: '/',
    destDir: packageName
  });
  
  var packageMain = moveFile(packageLib, {
    srcFile: packageName + '/main.js',
    destFile: packageName + '.js'
  });

  var packageTree = compileES6(mergeTrees([loader, dependencyTrees, packageLib, packageMain], {overwrite: true}), {
    loaderFile: 'loader/main.js',
    ignoredModules: [ ],
    inputFiles: [ packageName + '.js', packageName + '/**/*.js' ],
    legacyFilesToAppend: packages[packageName]['legacyFiles'] || [],
    wrapInEval: globalWrapInEval,
    outputFile: '/dist/' + packageName + '.js',
  });
  packageTree = defeatureify(packageTree, defeatureifyConfig());

  var packageTest = pickFiles('packages_es6/' + packageName + '/tests', {
    srcDir: '/',
    destDir: packageName + '/tests'
  });

  //var testTree = compileES6(mergeTrees([dependencyTrees, packageTree, packageTest]), {
  //  loaderFile: 'loader/main.js',
  //  ignoredModules: [ ],
  //  inputFiles: [ packageName + '/**/*.js' ],
  //  wrapInEval: globalWrapInEval,
  //  outputFile: '/dist/' + packageName + '-tests.js',
  //});
  //testTree = defeatureify(testTree, defeatureifyConfig());

  var libTrees = mergeTrees([dependencyTrees, packageMain, packageLib], {overwrite: true})

  //return packages[packageName]['trees'] = { lib: packageTree, tests: testTree};
  return packages[packageName]['trees'] = { lib: libTrees, compiledTree: packageTree, tests: packageTest};
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

var sourceTrees = [];
var distTrees = [];
for (var packageName in packages) {
  es6Package(packageName);
  var packagesTrees = packages[packageName]['trees'];

  if (packagesTrees.lib) {
    sourceTrees.push(packages[packageName]['trees'].lib);
  }

  if (packagesTrees.compiledTree) {
    //distTrees.push(packages[packageName]['trees'].compiledTree);
  }

  if (packagesTrees.tests) {
    sourceTrees.push(packages[packageName]['trees'].tests);
  }
}
sourceTrees = mergeTrees(sourceTrees, {overwrite: true});
distTrees   = mergeTrees(distTrees);

var packagesJs = compileES6(sourceTrees, {
  loaderFile: 'loader/main.js',
  ignoredModules: [ ],
  inputFiles: [ '**/*.js' ],
  wrapInEval: globalWrapInEval,
  outputFile: '/dist/ember.js'
});
packagesJs = defeatureify(packagesJs, defeatureifyConfig());

var testsJs = compileES6(sourceTrees, {
  loaderFile: 'loader/main.js',
  ignoredModules: [ ],
  inputFiles: [ '**/tests/**/*.js' ],
  wrapInEval: globalWrapInEval,
  outputFile: '/dist/ember-tests.js'
});
testsJs = defeatureify(testsJs, defeatureifyConfig());

//var defeaturedJs = defeatureify(mergeTrees([packagesJs, testsJs], {overwrite: true}), defeatureifyConfig());

distTrees = mergeTrees([distTrees, packagesJs, testsJs, testConfig, bowerFiles]);

module.exports = distTrees;
