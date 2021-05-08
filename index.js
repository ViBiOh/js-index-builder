#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const glob = require('glob');
const mkdirp = require('mkdirp');
const Mustache = require('mustache');
const utils = require('js-utils');

const globPattern = utils.asyncifyCallback(glob);

const options = require('yargs')
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

async function readPartial(partialFile) {
  return {
    [path.basename(partialFile)]: await fs.readFile(partialFile, 'utf-8'),
  };
}

async function readPartials(pattern) {
  if (!pattern) {
    return {};
  }

  const partials = await globPattern(pattern);
  const files = await Promise.all(partials.map(readPartial));
  return files.reduce((previous, current) => Object.assign(previous, current), {});
}

async function inline(pattern) {
  if (!pattern) {
    return '';
  }

  const files = await globPattern(pattern);
  const content = await Promise.all(files.map((file) => fs.readFile(file, 'utf-8')));
  return content.join('');
}

async function getTemplateConfig(configFile, template) {
  try {
    const content = await fs.readFile(configFile, 'utf-8');
    return JSON.parse(content);
  } catch (e) {
    global.console.warn(`Unable to read ${configFile} for template ${template} with reason ${e}`);
    return {};
  }
}

async function renderMustache(template, partials) {
  const values = await Promise.all([
    fs.readFile(template, 'utf-8'),
    getTemplateConfig(path.join(path.dirname(template), 'mustache.json'), template),
  ]);

  const data = values[1];
  if (options.bust) {
    data.version = options.bust;
  }

  const rendered = Mustache.render(values[0], data, partials);
  if (!options.output) {
    return rendered;
  }

  const outputFile = path.join(options.output, template.substring(outputIndexSchema));
  await mkdirp(path.dirname(outputFile));
  return fs.writeFile(outputFile, rendered);
}

function displayError(error) {
  if (error instanceof Error) {
    global.console.error(error.stack);
  } else {
    global.console.error(error);
  }

  process.exit(1);
}

(async () => {
  try {
    const partials = await readPartials(options.partials);
    partials.inlineJs = `<script>${await inline(options.js)}</script>`;
    partials.inlineCss = `<style>${await inline(options.css)}</style>`;
    partials.inlineSvg = String(await inline(options.svg));

    const templates = await globPattern(options.template);
    const values = await Promise.all(
      templates.map((template) => renderMustache(template, partials)),
    );

    if (!options.output) {
      global.console.log(values.join('\n'));
    } else {
      global.console.log('Done!');
    }
  } catch (e) {
    displayError(e);
  }
})();
