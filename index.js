#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const glob = require('glob');
const mkdirp = require('mkdirp');
const Mustache = require('mustache');
const utils = require('js-utils');

const UTF_8 = 'utf-8';

const promiseReadFile = utils.asyncifyCallback(fs.readFile);
const promiseWriteFile = utils.asyncifyCallback(fs.writeFile);
const promiseMkdirP = utils.asyncifyCallback(mkdirp);

const options = require('yargs')
  .reset()
  .options('template', {
    alias: 't',
    required: true,
    type: 'String',
    describe: 'Input',
  })
  .options('bust', {
    alias: 'b',
    required: false,
    type: 'String',
    describe: 'Cache-buster (commit SHA-1)',
  })
  .options('partials', {
    alias: 'p',
    required: false,
    type: 'String',
    describe: 'Partials',
  })
  .options('js', {
    alias: 'j',
    required: false,
    type: 'String',
    describe: 'Inline JavaScript',
  })
  .options('css', {
    alias: 'c',
    required: false,
    type: 'String',
    describe: 'Inline CSS',
  })
  .options('svg', {
    alias: 's',
    required: false,
    type: 'String',
    describe: 'Inline SVG',
  })
  .options('output', {
    alias: 'o',
    required: false,
    type: 'String',
    describe: 'Output',
  })
  .help('help')
  .strict().argv;

const outputIndexSchema = Math.max(0, options.template.indexOf('*'));
const requiredPromises = [];

function handleError(error, reject) {
  if (error) {
    reject(error);
  }
}

function displaySuccess(output) {
  global.console.log(output);
}

function displayError(error) {
  if (error instanceof Error) {
    global.console.error(error.stack);
  } else {
    global.console.error(error);
  }
  process.exit(1);
}

function inline(pattern) {
  if (pattern) {
    return new Promise((resolve, reject) => {
      glob(pattern, {}, (error, files) => {
        handleError(error, reject);

        Promise.all(files.map(file => promiseReadFile(file, UTF_8)))
          .then(contents => resolve(contents.join('')))
          .catch(reject);
      });
    });
  }
  return Promise.resolve('');
}

function partialPromise(partialFile) {
  return new Promise((resolve, reject) => {
    promiseReadFile(partialFile, UTF_8)
      .then((partialContent) => {
        resolve({
          [path.basename(partialFile)]: partialContent,
        });
      })
      .catch(reject);
  });
}

function mustachePromise(mustacheFile, template) {
  return new Promise((resolve) => {
    promiseReadFile(mustacheFile, UTF_8)
      .then(resolve)
      .catch((error) => {
        resolve('{}');
        global.console.warn(`Unable to read ${mustacheFile} for template ${template} with reason ${error}`);
      });
  });
}

function templatePromise(template, partials) {
  return new Promise((resolve, reject) => {
    Promise.all([
      promiseReadFile(template, UTF_8),
      mustachePromise(path.join(path.dirname(template), 'mustache.json'), template),
    ])
      .then((values) => {
        const data = JSON.parse(values[1]);
        if (options.bust) {
          data.version = options.bust;
        }

        const rendered = Mustache.render(values[0], data, partials);
        if (options.output) {
          const outputFile = path.join(options.output, template.substring(outputIndexSchema));
          promiseMkdirP(path.dirname(outputFile))
            .then(() => promiseWriteFile(outputFile, rendered).then(() => resolve(outputFile)))
            .catch(reject);
        } else {
          resolve(rendered);
        }
      })
      .catch(reject);
  });
}

if (options.partials) {
  const promise = new Promise((resolve, reject) => {
    glob(options.partials, {}, (error, partials) => {
      handleError(error, reject);

      Promise.all(partials.map(partial => partialPromise(partial)))
        .then((files) => {
          resolve(files.reduce((previous, current) => Object.assign(previous, current), {}));
        })
        .catch(reject);
    });
  });
  requiredPromises.push(promise);
} else {
  requiredPromises.push(Promise.resolve({}));
}

requiredPromises.push(inline(options.js));
requiredPromises.push(inline(options.css));
requiredPromises.push(inline(options.svg));

new Promise((resolve, reject) => {
  Promise.all(requiredPromises)
    .then((required) => {
      const partials = required[0];
      partials.inlineJs = `<script type="text/javascript">${required[1]}</script>`;
      partials.inlineCss = `<style type="text/css">${required[2]}</style>`;
      partials.inlineSvg = String(required[3]);

      glob(options.template, {}, (error, templates) => {
        handleError(error, reject);

        Promise.all(templates.map(template => templatePromise(template, partials)))
          .then(values => resolve(values.join('\n')))
          .catch(reject);
      });
    })
    .catch(reject);
})
  .then(displaySuccess)
  .catch(displayError);
