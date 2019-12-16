#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const glob = require('glob');
const mkdirp = require('mkdirp');
const Mustache = require('mustache');
const utils = require('js-utils');

const UTF_8 = 'utf-8';

const readFile = utils.asyncifyCallback(fs.readFile);
const writeFile = utils.asyncifyCallback(fs.writeFile);
const mkdirP = utils.asyncifyCallback(mkdirp);

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

async function globPromise(pattern) {
  return new Promise(resolve => {
    glob(pattern, {}, (err, jsons) => {
      if (err) {
        throw err;
      }
      resolve(jsons);
    });
  });
}

async function partialPromise(partialFile) {
  const partialContent = await readFile(partialFile, UTF_8);
  return {
    [path.basename(partialFile)]: partialContent,
  };
}

async function readPartial() {
  const partials = await globPromise(options.partials);

  const files = await Promise.all(partials.map(partial => partialPromise(partial)));
  return files.reduce((previous, current) => Object.assign(previous, current), {});
}

async function inline(pattern) {
  if (pattern) {
    const files = await globPromise(pattern);
    const content = await Promise.all(files.map(file => readFile(file, UTF_8)));
    return content.join('');
  }

  return '';
}

async function mustachePromise(mustacheFile, template) {
  try {
    const content = await readFile(mustacheFile, UTF_8);
    return JSON.parse(content);
  } catch (e) {
    global.console.warn(`Unable to read ${mustacheFile} for template ${template} with reason ${e}`);
    return {};
  }
}

async function templatePromise(template, partials) {
  const values = await Promise.all([
    readFile(template, UTF_8),
    mustachePromise(path.join(path.dirname(template), 'mustache.json'), template),
  ]);

  const data = values[1];
  if (options.bust) {
    data.version = options.bust;
  }

  const rendered = Mustache.render(values[0], data, partials);
  if (options.output) {
    const outputFile = path.join(options.output, template.substring(outputIndexSchema));
    await mkdirP(path.dirname(outputFile));
    const output = await writeFile(outputFile, rendered);
    return output;
  }

  return rendered;
}

(async () => {
  const requiredPromises = [];

  try {
    if (options.partials) {
      requiredPromises.push(readPartial());
    }

    requiredPromises.push(inline(options.js));
    requiredPromises.push(inline(options.css));
    requiredPromises.push(inline(options.svg));

    const required = await Promise.all(requiredPromises);
    const partials = required[0];
    partials.inlineJs = `<script>${required[1]}</script>`;
    partials.inlineCss = `<style>${required[2]}</style>`;
    partials.inlineSvg = String(required[3]);

    const templates = await globPromise(options.template);
    const values = await Promise.all(
      templates.map(template => templatePromise(template, partials)),
    );

    displaySuccess(values.join('\n'));
  } catch (e) {
    displayError(e);
  }
})();
