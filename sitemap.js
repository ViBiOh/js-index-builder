#!/usr/bin/env node

const fs = require('fs');
const glob = require('glob');
const utils = require('js-utils');

const readFile = file => utils.asyncifyCallback(fs.readFile)(file, 'utf-8');
const globPattern = utils.asyncifyCallback(glob);
const writeFile = utils.asyncifyCallback(fs.writeFile);

const options = require('yargs')
  .reset()
  .options('json', {
    alias: 'j',
    required: true,
    type: 'String',
    describe: 'Input',
  })
  .options('sitemap', {
    alias: 's',
    required: true,
    type: 'String',
    describe: 'Sitemap path',
  })
  .help('help')
  .strict().argv;

async function readJson(json) {
  const content = await readFile(json);
  return JSON.parse(content);
}

function sitemapConverter(data) {
  return `<url>
    <loc>${data.url}</loc>
    <changefreq>weekly</changefreq>
    <priority>1.00</priority>
  </url>`;
}

function sitemapStructure(urls) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
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
    const jsons = await globPattern(options.json);
    const pages = await Promise.all(jsons.map(readJson));
    await writeFile(options.sitemap, sitemapStructure(pages.map(sitemapConverter).join('')));

    global.console.log('Done!');
  } catch (e) {
    displayError(e);
  }
})();
