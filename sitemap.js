#!/usr/bin/env node

const fs = require('fs');
const glob = require('glob');
const utils = require('js-utils');

const readFile = utils.asyncifyCallback(fs.readFile);
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

async function jsonPromise(json) {
  const content = await readFile(json, 'utf-8');
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
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9 http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">
${urls}
</urlset>`;
}

(async () => {
  try {
    const jsons = await globPromise(options.json);
    const pages = await Promise.all(jsons.map(jsonPromise));
    await writeFile(options.sitemap, sitemapStructure(pages.map(sitemapConverter).join('')));

    displaySuccess(jsons.join('\n'));
  } catch (e) {
    displayError(e);
  }
})();
