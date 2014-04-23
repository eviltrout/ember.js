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
var moveFile = require('broccoli-file-mover');
var removeFile = require('broccoli-file-remover');

var env = process.env.BROCCOLI_ENV || 'test';

var Writer = require('broccoli-writer');
var helpers = require('broccoli-kitchen-sink-helpers')

function createTemplateCompiler() {
 /** 
      out = "(function() {\nvar Ember = { assert: function() {}, FEATURES: { isEnabled: function() {} } };\n"
      out << File.read('packages_es6/ember-handlebars-compiler/lib/main.js')

      out.gsub!('import Ember from "ember-metal/core";', '')
      out.gsub!('export default EmberHandlebars;', '')

      out << "\nexports.precompile = EmberHandlebars.precompile;"
      out << "\nexports.EmberHandlebars = EmberHandlebars;"
      out << "\n})();"
      output.write out
  */

 var output = '(function() {\nvar Ember = { assert: function() {}, FEATURES: { isEnabled: function() {} } };\n';
 output += fs.readFileSync('packages_es6/ember-handlebars-compiler/lib/main.js', {encoding: 'utf8'});

 output = output.replace('import Ember from "ember-metal/core";', '');
 output = output.replace('export default EmberHandlebars;', '');

 output += '\nexports.precompile = EmberHandlebars.precompile;';
 output += '\nexports.EmberHandlebars = EmberHandlebars;';
 output += '\n})();';

 if (!fs.existsSync('tmp')) { fs.mkdirSync('tmp'); }
 fs.writeFileSync('tmp/ember-template-compiler.js', output);

 return require('./tmp/ember-template-compiler');
}

debugger;
DefaultTemplateCompiler.prototype = Object.create(Writer.prototype);
DefaultTemplateCompiler.prototype.constructor = DefaultTemplateCompiler;
function DefaultTemplateCompiler (inputTree, options) {
  if (!(this instanceof DefaultTemplateCompiler)) return new DefaultTemplateCompiler(inputTree, options);

  this.inputTree = inputTree;
  this.srcFile   = options.srcFile;
  this.destFile  = options.destFile;
};

DefaultTemplateCompiler.prototype.write = function (readTree, destDir) {
  var self = this

  return readTree(this.inputTree).then(function (srcDir) {
    helpers.copyRecursivelySync(srcDir, destDir);
  })
};

function defeatureifyConfig(options) {
  var stripDebug = false;
  var options = options || {};
  var configJson = JSON.parse(fs.readFileSync("features.json").toString());

  if (configJson.hasOwnProperty('stripDebug')) { stripDebug = configJson.stripDebug; }
  if (options.hasOwnProperty('stripDebug')) { stripDebug = options.stripDebug; }

  return {
    enabled:           options.features || configJson.features,
    debugStatements:   options.debugStatements || configJson.debugStatements,
    namespace:         options.namespace || configJson.namespace,
    enableStripDebug:  stripDebug
  };
}

function vendoredPackage(packageName) {
  var libTree = pickFiles('packages/' + packageName + '/lib', {
    files: ['main.js'],
    srcDir: '/',
    destDir: '/' + packageName
  });

  return  moveFile(libTree, {
    srcFile: packageName + '/main.js',
    destFile: '/' + packageName + '.js'
  });
};

function concatES6(sourceTrees, options) {
  var loader = vendoredPackages['loader'];
  var inputFiles = options.inputFiles;
  var destFile = options.destFile;

  if (util.isArray(sourceTrees)) {
    sourceTrees = mergeTrees(sourceTrees, {overwrite: true});
  }

  sourceTrees = transpileES6(sourceTrees, {
    moduleName: true
  });
  sourceTrees = defeatureify(sourceTrees, defeatureifyConfig(options.defeatureifyOptions));

  var concatTrees = [loader, sourceTrees];
  if (options.includeLoader === true) {
    inputFiles.unshift('loader.js');
  }

  if (options.vendorTrees) { concatTrees.push(options.vendorTrees); }

  return concat(mergeTrees(concatTrees), {
    wrapInEval: options.wrapInEval,
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


var vendoredPackages = {
  'loader':           vendoredPackage('loader'),
  'rsvp':             vendoredPackage('rsvp'),
  'metamorph':        vendoredPackage('metamorph'),
  'backburner':       vendoredPackage('backburner'),
  'router':           vendoredPackage('router'),
  'route-recognizer': vendoredPackage('route-recognizer'),
};

var packages = {
  'container':                  {trees: null,  requirements: []},
  'ember-metal':                {trees: null,  vendorRequirements: ['backburner']},
  'ember-debug':                {trees: null,  requirements: ['ember-metal'], skipTests: true},
  'ember-runtime':              {trees: null,  vendorRequirements: ['rsvp'], requirements: ['container', 'ember-metal']}, 
  'ember-views':                {trees: null,  requirements: ['ember-runtime']},
  'ember-extension-support':    {trees: null,  requirements: ['ember-application']},
  'ember-testing':              {trees: null,  requirements: ['ember-application', 'ember-routing']},
  'ember-handlebars-compiler':  {trees: null,  requirements: ['ember-views']},
  'ember-handlebars':           {trees: null,  vendorRequirements: ['metamorph'], requirements: ['ember-views', 'ember-handlebars-compiler']},
  'ember-routing':              {trees: null,  vendorRequirements: ['router', 'route-recognizer'],
                                               requirements: ['ember-runtime', 'ember-views', 'ember-handlebars']},
  'ember-application':          {trees: null,  requirements: ['ember-routing']},
  'ember':                      {trees: null,  requirements: ['ember-application']}
};

function es6Package(packageName) {
  var pkg = packages[packageName],
      libTree;

  if (pkg['trees']) {
    return pkg['trees'];
  }

  var dependencyTrees = packageDependencyTree(packageName);
  var vendorTrees = packages[packageName].vendorTrees;

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

  var compiledLib = concatES6([dependencyTrees, libTree], {
    includeLoader: true,
    vendorTrees: vendorTrees,
    inputFiles: ['**/*.js'],
    destFile: '/dist/packages/' + packageName + '.js'
  })
  var compiledTrees = [compiledLib];

  var compiledTest = concatES6(testTree, '**/*.js', '/dist/' + packageName + '-tests.js');
  var compiledTest = concatES6(testTree, {
    includeLoader: false,
    inputFiles: ['**/*.js'],
    destFile: '/dist/packages/' + packageName + '-tests.js'
  })
  if (!pkg.skipTests) { compiledTrees.push(compiledTest); }

  compiledTrees = mergeTrees(compiledTrees);

  pkg['trees'] = { lib: libTree, compiledTree: compiledTrees, vendorTrees: vendorTrees};
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

  var requiredDependencies = packages[packageName]['requirements'] || [];
  var vendoredDependencies = packages[packageName]['vendorRequirements'] || [];
  var libTrees = [];
  var vendorTrees = [];

  vendoredDependencies.forEach(function(dependency) {
    vendorTrees.push(vendoredPackages[dependency]);
  });

  requiredDependencies.forEach(function(dependency) {
    libTrees.concat(packageDependencyTree(dependency));
    libTrees.push(es6Package(dependency).lib);
  }, this);

  packages[packageName]['vendorTrees']            = mergeTrees(vendorTrees, {overwrite: true});
  return packages[packageName]['dependencyTrees'] = mergeTrees(libTrees, {overwrite: true});
}

var vendorTrees          = [];
var sourceTrees          = [];
var testTrees            = [];
var compiledPackageTrees = [];

for (var packageName in packages) {
  es6Package(packageName);
  var currentPackage = packages[packageName];
  var packagesTrees = currentPackage['trees'];

  if (currentPackage['vendorRequirements']) {
    currentPackage['vendorRequirements'].forEach(function(dependency) {
      vendorTrees.push(vendoredPackages[dependency]);
    });
  }

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
vendorTrees = mergeTrees(vendorTrees);
sourceTrees = mergeTrees(sourceTrees);

var compiledSource = concatES6(sourceTrees, {
  includeLoader: true,
  vendorTrees: vendorTrees,
  inputFiles: ['**/*.js'],
  destFile: '/dist/ember.js'
});

var prodCompiledSource = removeFile(sourceTrees, {
  srcFile: 'ember-debug.js',
});

prodCompiledSource = concatES6(prodCompiledSource, {
  includeLoader: true,
  vendorTrees: vendorTrees,
  inputFiles: ['**/*.js'],
  destFile: '/dist/ember.prod.js',
  defeatureifyOptions: {stripDebug: true}
});

var minCompiledSource = moveFile(prodCompiledSource, {
  srcFile: 'dist/ember.prod.js',
  destFile: 'dist/ember.min.js',
});
minCompiledSource = uglifyJavaScript(minCompiledSource);

var compiledTests = concatES6(testTrees, {
  includeLoader: false,
  inputFiles: ['**/*.js'],
  destFile: '/dist/ember-tests.js'
});
var distTrees = [compiledSource, compiledTests, testConfig, bowerFiles];

if (env !== 'test') {
  distTrees.push(prodCompiledSource);
  distTrees.push(minCompiledSource);
  distTrees.push(compiledPackageTrees);
}

distTrees = mergeTrees(distTrees);

module.exports = distTrees;
