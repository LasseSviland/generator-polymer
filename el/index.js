'use strict';
var yeoman = require('yeoman-generator');
var path = require('path');
var htmlWiring = require('html-wiring');
var readFileAsString = htmlWiring.readFileAsString;
var writeFileFromString = htmlWiring.writeFileFromString;
var beautify = require('js-beautify').html;
var beautifyOpts = { indent_size: 2 };

module.exports = yeoman.Base.extend({
  constructor: function () {
    yeoman.Base.apply(this, arguments);

    this.argument('element-name', {
      desc: 'Tag name of the element to generate',
      required: true
    });

    // This method adds support for a `--docs` flag
    // An element generated with --docs will include iron-component-page
    // and a demo.html file
    this.option('docs');

    // This method adds support for a `--path` flag
    // An element generated with a --path will create a matching directory
    // structure in the `app/elements` dir.
    // ex: yo polymer:el x-foo --path foo/bar/baz will create
    // app/elements/foo/bar/baz/x-foo
    this.option('path');

    // Allow aliasing of the 'el' subgenerator by other subgenerators like
    // yo polymer:element. Without this fix those generators will attempt to copy
    // from their own template directories (which don't exist)
    // Fixes https://github.com/yeoman/generator-polymer/issues/232#issuecomment-147847138
    this.sourceRoot(path.join(__dirname, 'templates'));
  },
  init: function () {
    this.elementName = this['element-name'];
    this.args.splice(0,1);
    this.components = this.args;
    this.flags = this.options;

    if (this.elementName.indexOf('-') === -1) {
      this.emit('error', new Error(
        'Element name must contain a dash "-"\n' +
        'ex: yo polymer:el my-element'
      ));
    }
  },
  askFor: function () {
    var done = this.async();

    var prompts = [
      {
        name: 'includeImport',
        message: 'Would you like to include an import in your elements.html file?',
        type: 'confirm',
        default: false
      }
    ];

    // Only ask to create a test if they already have WCT installed
    var hasWCTinstalled = this.fs.exists('app/test/index.html');
    if (hasWCTinstalled) {
      prompts.push({
        name: 'testType',
        message: 'What type of test would you like to create?',
        type: 'list',
        choices: ['TDD', 'BDD', 'None'],
        default: 'TDD'
      });
    }

    this.prompt(prompts, function (answers) {
      this.includeImport = answers.includeImport;
      this.testType = answers.testType;
      done();
    }.bind(this));
  },
  el: function () {
    // Create the template element

    var el;
    var pathToEl;
    var pathToElements;
    var pathToBowerComponents;
    var pathToApp;
    
    // Let you specify a path to the app folder
    if (this.flags.app) {

      // pathToApp = 'subfolder/app'
      pathToApp = this.flags.app;

      // adding / to the end of the path
      if (pathToApp.charAt(pathToApp.length - 1) !== '/' ) {
        pathToApp = pathToApp + '/';
      }

    } else {

      // pathToApp = 'app'
      pathToApp = 'app/';

    }


    // Let you specify a path to the elements folder relative to the app folder
    if (this.flags.elements) {

      // pathToElements = 'app/custom-elements'
      pathToElements = pathToApp + this.flags.elements;

    } else {

      // pathToElements = 'app/elements'
      pathToElements = pathToApp + 'elements';

    }


    // Let you specify a path to the bower_components folder relative to the app folder
    if (this.flags.bower) {

      // pathToBowerComponents = 'app/bower_components_folder'
      pathToBowerComponents = pathToApp + this.flags.bower;

    } else {

      // pathToBowerComponents = 'app/bower_components'
      pathToBowerComponents = pathToApp + 'bower_components';

    }
    

    if (this.flags.path) {

      // pathToEl = "app/elements/foo/bar/"
      pathToEl = path.join(this.destinationPath(pathToElements), this.flags.path);

    } else {

      // pathToEl = "app/elements/x-foo/"
      pathToEl = path.join(this.destinationPath(pathToElements), this.elementName);

    }

    // Used by element template
    var tpl = {
      elementName: this.elementName,
      components: this.components,
      pathToBower: path.relative(
          pathToEl,
          path.join(process.cwd(), pathToBowerComponents)
        )
    };

    this.fs.copyTpl(
      path.join(this.templatePath('element.html')),
      path.join(pathToEl, this.elementName + '.html'),
      tpl
    );

    // Wire up the dependency in elements.html
    if (this.includeImport) {
      var file = readFileAsString(this.destinationPath(pathToElements + '/elements.html'));
      el = (this.flags.path || this.elementName) + '/' + this.elementName;
      el = el.replace(/\\/g, '/');
      file += '<link rel="import" href="' + el + '.html">\n';
      writeFileFromString(file, this.destinationPath(pathToElements + '/elements.html'));
    }

    if (this.testType && this.testType !== 'None') {
      var testDir = this.destinationPath(pathToApp + 'test');

      if (this.testType === 'TDD') {
        this.fs.copyTpl(
          this.templatePath('test/tdd.html'),
          path.join(testDir, this.elementName+'-basic.html'),
          tpl
        );
      } else if (this.testType === 'BDD') {
        this.fs.copyTpl(
          this.templatePath('test/bdd.html'),
          path.join(testDir, this.elementName+'-basic.html'),
          tpl
        );
      }

      // Open index.html, locate where to insert text, insert ", x-foo.html" into the array of components to test
      var indexFileName = pathToApp + 'test/index.html';
      // Replace single quotes to make JSON happy
      var origionalFile = readFileAsString(indexFileName).replace(/'/g, '"');
      var regex = /WCT\.loadSuites\(([^\)]*)/;
      var testListAsString = origionalFile.match(regex)[1];
      var testListAsArray = JSON.parse(testListAsString);
      var fileName = this.elementName + '-basic.html';
      testListAsArray.push(fileName);
      testListAsArray.push(fileName + '?dom=shadow');
      var newTestString = JSON.stringify(testListAsArray, null, 2).replace(/"/g, '\'');
      var newFile = origionalFile.replace(testListAsString, newTestString);
      writeFileFromString(beautify(newFile, beautifyOpts), indexFileName);
    }

    // copy documentation page and demo page only if flag is set
    if (this.flags.docs) {

      // copy templates/index.html -> app/elements/x-foo/index.html (documentation page)
      this.fs.copyTpl(
        this.templatePath('index.html'),
        path.join(pathToEl, 'index.html'),
        tpl
      );

      // copy templates/demo.html -> app/elements/x-foo/demo.html (demo page)
      this.fs.copyTpl(
        this.templatePath('demo.html'),
        path.join(pathToEl, 'demo/index.html'),
        tpl
      );

    }
  }
});
