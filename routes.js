/**
 * Copyright 2017 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

const filesize = require('filesize');
const fs = require('fs');
const URL = require('url');
global.Intl = require('intl');

const pageSpeedInsights = require('./pagespeed.js');
const mobileFriendlyTest = require('./mobilefriendly.js');
const screenshot = require('./screenshot.js');

const routes = {

  getIndex(req, res) {
    return res.render('index');
  },

  getPageSpeedRaw(req, res) {
    const query = req.query;
    return pageSpeedInsights.run(query)
    .then((raw) => {
      return res.send(raw);
    })
    .catch((err) => {
      res.status(500).render('error', {error: err.stack});
    });
  },

  getPageSpeedProcessed(req, res) {
    const query = req.query;
    return pageSpeedInsights.run(query)
    .then(pageSpeedInsights.format)
    .then(pageSpeedInsights.determineResourceTypes)
    .then(pageSpeedInsights.beautifyResources)
    .then((insights) => {
      return res.send(insights);
    })
    .catch((err) => {
      res.status(500).render('error', {error: err.stack});
    });
  },

  getPageSpeedReport(req, res) {
    const query = req.query;
    return pageSpeedInsights.run(query)
    .then(pageSpeedInsights.format)
    .then(pageSpeedInsights.determineResourceTypes)
    .then(pageSpeedInsights.beautifyResources)
    .then((insights) => {
      res.render('report', {insights: insights});
    })
    .catch((err) => {
      res.status(500).render('error', {error: err.stack});
    });
  },

  getPageSpeedSlides(req, res) {
    const query = req.query;
    console.log("query", query);
    return Promise.all([
      pageSpeedInsights.run(query)
      .then(pageSpeedInsights.format)
      .then(pageSpeedInsights.determineResourceTypes)
      .then(pageSpeedInsights.beautifyResources)
      .then(pageSpeedInsights.getWaterfall),
      mobileFriendlyTest.run(query),
    ])
    .then((results) => {
      let insights = results[0];
      insights.mobileFriendly = results[1];
      res.render('dynamic', {
        insights: insights,
        filesize: filesize,
        URL: URL,
        encoded: req.app.locals.encoded,
        __dirname: __dirname,
      });
    })
    .catch((err) => {
      res.status(500).render('error', {error: err.stack});
    });
  },

  getScreenshot(req, res) {
    // url
    const parsedUrl = URL.parse(req.query.url);
    if (!parsedUrl.host) {
      return res.status(400).send('Invalid URL.');
    }
    const url = req.query.url;

    // format
    const supportedFormats = {
      png: true,
      jpeg: true,
      jpg: true,
      gif: true,
      pdf: true,
    };
    const format = req.query.format ? req.query.format.toLowerCase() : 'pdf';
    if (!supportedFormats[format]) {
      return res.status(400).send('Unsupported format, use one of ' +
          Object.keys(supportedFormats).join(', ') + '.');
    }

    // view port
    let viewPort = req.query.viewPort ? req.query.viewPort : false;
    if (viewPort) {
      if (!/^\d+x\d+$/i.test(viewPort)) {
        return res.status(400).send('Invalid view port, use, e.g., 800x600.');
      }
      viewPort = {
        width: parseInt(viewPort.split(/x/i)[0], 10),
        height: parseInt(viewPort.split(/x/i)[1], 10),
      };
    }

    // page size
    const supportedPageSizes = {
      Letter: true,
      Legal: true,
      A3: true,
      A4: true,
      A5: true,
      Tabloid: true,
    };
    const pageSize = req.query.pageSize;
    if (pageSize) {
      if (!supportedPageSizes[pageSize]) {
        return res.status(400).send('Unsupported page size, use one of ' +
            Object.keys(supportedPageSizes).join(', ') + '.');
      }
    }

    // page orientation
    const pageOrientation = req.query.pageOrientation || false;
    if (pageOrientation) {
      if (pageOrientation !== 'landscape' && pageOrientation !== 'portrait') {
        return res.status(400).send('Unsupported page orientation, use ' +
        'portrait or landscape.');
      }
    }

    // page margin in cm
    const pageMarginInCm = req.query.pageMarginInCm;
    if (pageMarginInCm) {
      if (!/^\d+(?:\.\d+)?$/.test(pageMarginInCm)) {
        return res.status(400).send('Unsupported page margins, use integer ' +
            'or floating point number.');
      }
    }

    // get screenshot
    screenshot.getScreenshot(url, {
      format: format,
      viewPort: viewPort,
      pageSize: pageSize,
      pageOrientation: pageOrientation,
      pageMarginInCm: pageMarginInCm,
    })
    .then(function(fileName) {
      const options = {
        root: __dirname,
      };
      return res.sendFile(fileName, options, function(err) {
        console.log('Deleting ' + fileName);
        fs.unlink(fileName);
        if (err) {
          console.error(err);
          return res.status(err.status).end();
        }
      });
    }).catch(function(err) {
      return res.status(400).send('Uncaught error ' + err);
    });
  },
};

module.exports = routes;
