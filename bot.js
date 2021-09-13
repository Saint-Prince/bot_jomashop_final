/* eslint-disable max-len */
const Helper = require('@zapevo/module_helper_v2');
const pLimit = require('p-limit');
const fs = require('fs');
let bot;
const {botName, websourceid, siteLink, brands} = require('./config/keys');
let productLinks = [];
// productLinks = JSON.parse(fs.readFileSync('productLinks.json'));
let noChangeData = [];
let errorLinks = [];
let browser;
const returnObject = {
  successPages: 0,
  errorPages: 0,
  errorText: '',
  updatedPrices: 0,
};
let notFoundBrands = [];

/**
* Run bot
*/
module.exports.run = async () => {
  console.log('Started BOT run...');
  await resetStates();
  returnObject.startTime = new Date();
  returnObject.bot = await Helper.getBot(botName).then((res) => res._id);
  try {
    // Initialize Database and Redis Connection
    await Helper.fetchBrandsFromDB();
    await Helper.initialize();

    // Remove Redis Cache for Static and Dynamic Models
    await Helper.removeStaticDynamicRedisCache(botName);

    // Remove CSVs Folders Created in Previous Runs
    Helper.rmDir(`end_date/${botName}`);
    Helper.rmDir(`new_dynamic/${botName}`);
    Helper.rmDir(`new_price/${botName}`);
    Helper.rmDir(`new_static/${botName}`);
    if (fs.existsSync('notFoundBrands.json')) fs.unlinkSync('notFoundBrands.json');

    // Get Staticmodels and Dynamic models from Redis Cache
    await Helper.cacheStaticDB(botName, websourceid);
    await Helper.cacheDynamicDB(botName, websourceid);

    // Get Bot Configurations From MongoDB
    bot = await Helper.getBot(botName);

    // Launch Browser and Page
    browser = await Helper.launchBrowser(true);

    // Get URLs for all products on the site
    await getAllProductLinks();
    console.log(`No of products found on the site: ${productLinks.length}`);

    // Remove Duplicate Product Links
    productLinks = await Helper.removeDuplicateLinks(productLinks);
    console.log(`No of products found on the site (after removing duplicates): ${productLinks.length}`);
    fs.writeFileSync('productLinks.json', JSON.stringify(productLinks));

    // Get not found watches. It stands for the records
    // which were found in a DB, but not found in a crawled data from the site.
    await Helper.findEndDateWatches(botName, productLinks);

    // Log Number of Records in Static/Dynamic/Enddate Models and Products Links
    console.info(`Static Models Rows: ${Helper.staticModels.length}`);
    console.info(`Dynamic Proposals Rows: ${Helper.dynamicModels.length}`);
    console.info(`Products Rows: ${productLinks.length}`);

    // Crawl Watches Data for All Product Links
    await crawlProductLinks();

    console.info(`Number of Products with no Change: ${noChangeData.length}`);
    console.info(`Number of Products with Error Links: ${errorLinks.length}`);

    // Upload Generated Csv Files To Gdrive
    Helper.uploadCsvsToGdrive(botName);

    // Close the Browser
    await browser.close();
    console.log('Browser Closed...');
    returnObject.endTime = new Date();
    returnObject.runStatus = 'SUCCESS';
    console.log('Finished BOT run...');
    return returnObject;
  } catch (error) {
    if (browser) await browser.close();
    console.log('Bot Run Error: ', error);
    returnObject.endTime = new Date();
    returnObject.runStatus = 'FAIL';
    returnObject.errorText = error.toString();
    console.log('Finished BOT run...');
    return returnObject;
  }
};

const getAllProductLinks = () => new Promise(async (resolve, reject) => {
  try {
    await getPreOwnedProductLinks();

    for (let i = 0; i < brands.length; i++) {
      await getProductLinks(i);
    };

    resolve(true);
  } catch (error) {
    console.log(`getAllProductLinks Error: ${error}`);
    reject(error);
  };
});

/**
* Get all product links from the site
* @param {number} brandIdx
*/
async function getProductLinks(brandIdx) {
  return new Promise(async (resolve, reject) => {
    let page;
    try {
      const brandLinks = [];
      console.log(`${brandIdx+1}/${brands.length} - Fetching Products from Brand ${brands[brandIdx]}...`);
      page = await Helper.launchPage(browser, true);
      await page.goto(`${brands[brandIdx]}?price=%7B"from"%3A800%7D&subtype=Watches`, {
        waitUntil: 'networkidle2', timeout: 60000,
      });

      const pageUrl = page.url();
      if (pageUrl != `${brands[brandIdx]}?price=%7B"from"%3A800%7D&subtype=Watches`) {
        const gotProducts = await page.$('ul.productsList > li.productItem');
        if (gotProducts) {
          await page.waitForSelector('.category-title-wrap > .clp-count');
          const numberOfPages = await page.$eval('.category-title-wrap > .clp-count', (elm) => Math.ceil(Number(elm.innerText.replace(/[\(\)]+/gi, '').trim()) / 60));
          await page.close();

          for (let pageNumber = 1; pageNumber <= numberOfPages; pageNumber++) {
            console.log(`Fetching Products From Page ${pageNumber}`);
            page = await Helper.launchPage(browser, true);
            await page.goto(`${brands[brandIdx]}?price=%7B"from"%3A800%7D&subtype=Watches&p=${pageNumber}`, {waitUntil: 'networkidle2', timeout: 60000});
            await page.waitForSelector('ul.productsList > li.productItem');
            const productsOnPage = await page.$$('ul.productsList > li.productItem > .productItemBlock');
            const pageLinks = [];
            for (let i = 0; i < productsOnPage.length; i++) {
              const outOfStock = await productsOnPage[i].$('.product-badges__oos--plp');
              if (!outOfStock) {
                const productLinkExists = await productsOnPage[i].$('a.productImg-link');
                if (productLinkExists) {
                  const productLink = await productsOnPage[i].$eval(
                      'a.productImg-link', (elm) => elm.href,
                  );
                  pageLinks.push(productLink);
                }
              }
            }
            brandLinks.push(...pageLinks);
            await page.close();
          }
        };
      } else {
        console.log(`No Products found for brand ${brands[brandIdx]}. PAGE URL CHANGED`);
      }

      console.log(`No of Products Found For Brand ${brands[brandIdx]}: ${brandLinks.length}`);
      productLinks.push(...brandLinks);

      resolve(true);
    } catch (error) {
      if (page) await page.close();
      console.log(`getProductLinks[${brands[brandIdx]}] Error: ${error}`);
      resolve(error);
    }
  });
};

const getPreOwnedProductLinks = () => new Promise(async (resolve, reject) => {
  let page;
  try {
    console.log('Fetching Pre-Owned Products Links...');
    page = await Helper.launchPage(browser);
    await page.goto(`${siteLink}preowned-watches.html`, {
      waitUntil: 'load', timeout: 0,
    });
    await page.waitFor(3000);
    await page.waitForSelector('.category-title-wrap > .clp-count');
    const numberOfPages = await page.$eval('.category-title-wrap > .clp-count', (elm) => Math.ceil(Number(elm.innerText.replace(/[\(\)]+/gi, '').trim()) / 60));
    console.log('Number of Pages found: ', numberOfPages);
    await page.close();

    for (let pageNumber = 1; pageNumber <= numberOfPages; pageNumber++) {
      console.log(`Fetching Products From Page ${pageNumber}`);
      page = await Helper.launchPage(browser);
      await page.goto(`${siteLink}preowned-watches.html?p=${pageNumber}`, {waitUntil: 'load', timeout: 0});
      await page.waitFor(3000);
      await page.waitForSelector('ul.productsList > li.productItem');
      const productsOnPage = await page.$$('ul.productsList > li.productItem > .productItemBlock');
      const pageLinks = [];
      for (let i = 0; i < productsOnPage.length; i++) {
        const outOfStock = await productsOnPage[i].$('.product-badges__oos--plp');
        if (!outOfStock) {
          const productLinkExists = await productsOnPage[i].$('a.productImg-link');
          if (productLinkExists) {
            const productLink = await productsOnPage[i].$eval(
                'a.productImg-link', (elm) => elm.href,
            );
            pageLinks.push(productLink);            
          }

        }
      }
      productLinks.push(...pageLinks);
      await page.close();
    }

    console.log(`Number of Products found in Pre-Owned Category: ${productLinks.length}`);

    resolve(true);
  } catch (error) {
    if (page) await page.close();
    console.log('getPreOwnedProductLinks Error: ', error);
    reject(error);
  }
});

/**
* Crawl Watches Details for all product links
* @return {boolean} a promise
*/
const crawlProductLinks = () => new Promise(async (resolve, reject) => {
  try {
    console.info(`Start Crawl ${productLinks.length} Product Links`);
    const promises = [];
    const limit = pLimit(10);
    for (let i = 0; i < productLinks.length; i++) {
      // console.log(`Fetching Watch Information: ${i + 1}/${productLinks.length} - ${productLinks[i]}`);
      promises.push(limit(() => getWatch(productLinks[i], i + 1)));
    }
    await Promise.all(promises);
    console.info(`Crawled ${productLinks.length} Product Links, Done!`);
    resolve(true);
  } catch (error) {
    console.log(`crawlProductLinks Error: ${error}`);
    reject(error);
  }
});

/**
* Get Watch Detail for a single watch
* @param {string} watchLink URL to Watch Page that is to be crawled
* @param {number} productNumber
* @return {boolean} a promise
*/
const getWatch = (watchLink, productNumber) => new Promise(async (resolve, reject) => {
  let page;
  try {
    console.log(`Fetching Watch Information: ${productNumber}/${productLinks.length} - ${watchLink}`);
    page = await Helper.launchPage(browser);
    const response = await page.goto(
        watchLink,
        {waitUntil: 'networkidle2', timeout: 0},
    );
    if (response.status() === 200 && watchLink == page.url()) {
      let lightData = {};
      const cellsData = await getCellsData(page);
      lightData.watchname = '';
      lightData.websourceid = websourceid;
      lightData.watchlink = watchLink;
      lightData.currency = 'USD';
      lightData.price = await fetchPrice(page);
      lightData.brand = getCellVal(cellsData, 'brand');
      lightData.referencenumber = getCellVal(cellsData, 'model');
      lightData.watchmodel = getCellVal(cellsData, 'series');
      lightData.brandid = Helper.getBrandID(lightData.brand);
      if (lightData.brandid === 'Not Found' && lightData.brand !== '') {
        if (!notFoundBrands.includes(lightData.brand)) {
          notFoundBrands.push(lightData.brand);
          fs.writeFileSync('notFoundBrands.json', JSON.stringify(notFoundBrands));
        }
      };
      lightData = Helper.transformLightData(lightData);

      // Dont Continue if Price/ReferenceNumber/Brand/Model is missing
      // OR Reference Number == Brand
      // OR Brand == Model
      // OR Brand Not found in Postgres
      // OR Price is less than 1000 (compare only if watchlink not found in dynamic models)
      if (Helper.isLightDataValid(lightData, 1000)) {
        lightData = await Helper.comparisonByFormattedRefNum(lightData);
        if (lightData.label === 'nothing') {
          noChangeData.push(lightData);
          console.info(`Label: ${lightData.label}`);
        } else {
          // if label is new_price push it to newPriceData array
          if (lightData.label === 'new_price') {
            Helper.putDataToCsvFile(botName, lightData);
            returnObject.updatedPrices += 1;
            console.info(`Label: ${lightData.label}`);
          } else {
            const heavyData = lightData;
            // for static table
            heavyData.msrp = '';
            heavyData.msrp = await fetchRetailPrice(page);
            heavyData.watchimage = await fetchImageURL(page);
            heavyData.gender = Helper.getGenderUnify(getCellVal(cellsData, 'gender'));
            heavyData.condition = await fetchCondition(page);
            heavyData.movements = await fetchMovement(cellsData);
            heavyData.casediameter = await fetchCaseDiameter(cellsData);
            heavyData.casematerial = getCellVal(cellsData, 'case material');
            heavyData.glass = getCellVal(cellsData, 'crystal');
            heavyData.braceletmaterial = getCellVal(cellsData, 'band material');
            heavyData.braceletcolor = getCellVal(cellsData, 'band color');
            heavyData.location = 'World';
            heavyData.buckle = getCellVal(cellsData, 'clasp');
            heavyData.bucklematerial = '';
            heavyData.dialcolor = getCellVal(cellsData, 'dial color');
            heavyData.waterresistanceatm = await fetchWaterResistance(cellsData);
            heavyData.powerreserve = await fetchPowerReserve(cellsData);
            heavyData.numberofjewels = '';
            heavyData.bezelmaterial = getCellVal(cellsData, 'bezel material');
            heavyData.others = '';
            heavyData.scopeofdelivery = '';
            heavyData.functions = getCellVal(cellsData, 'functions');
            heavyData.description = await fetchDescription(page);
            heavyData.year = '';
            console.info(`Label: ${heavyData.label}`);
            Helper.putDataToCsvFile(botName, heavyData);
          }
        }
        returnObject.successPages = returnObject.successPages + 1;
      };
    } else {
      errorLinks.push(response);
      console.log(
          `ERROR while crawling ${watchLink}:`,
          response.status(),
          response.statusText(),
      );
      Helper.error(
          response.status(),
          bot,
          watchLink,
          response.statusText(),
      );
      returnObject.errorPages = returnObject.errorPages + 1;
    };
    await page.close();
    resolve(true);
  } catch (error) {
    await page.close();
    console.log(`getWatch(${watchLink} Error: ${error}`);
    resolve(error);
  }
});

/**
* Get Data of all cells
* @param {object} page Page Object
* @return {object} All Cells Values
*/
const getCellsData = (page) => new Promise(async (resolve, reject) => {
  try {
    const returnVal = {};
    await page.waitForSelector('.more-detail-body .more-detail-content');
    const props = await page.$$(
        '.more-detail-body .more-detail-content',
    );
    for (let i = 0; i < props.length; i++) {
      const proplabel = await props[i].$eval(
          '.more-label', (elm) => elm.textContent.toLowerCase().trim(),
      );
      const propValue = await props[i].$eval(
          '.more-value', (elm) => elm.innerText.trim(),
      );
      returnVal[proplabel] = propValue;
    }
    resolve(returnVal);
  } catch (error) {
    console.log(`getCellsData Error: ${error}`);
    resolve(error);
  }
});

/**
* Get value from specifications table
* @param {string} cellsData
* @param {string} label
* @return {string} cell value which column has a matching label
*/
const getCellVal = (cellsData, label) => {
  const returnVal = cellsData[label.toLowerCase()] ? cellsData[label.toLowerCase()] : '';

  return returnVal;
};

/**
* Get Description
* @param {object} page Page Object
* @return {string} Description value to store
*/
const fetchDescription = (page) => new Promise(async (resolve, reject) => {
  try {
    let description = '';
    await page.waitForSelector('.product-desc .pdp-info-wrap .info-accordion-element > div:nth-child(2)');
    description = await page.$eval(
        '.product-desc .pdp-info-wrap .info-accordion-element > div:nth-child(2)', (elm) => elm.innerText.trim(),
    );
    resolve(description);
  } catch (error) {
    console.log(`fetchDescription Error: ${error}`);
    resolve(error);
  }
});

/**
* Get Case Diameter
* @param {array} cellsData
* @return {string} Case Diameter Value to store
*/
const fetchCaseDiameter = (cellsData) => new Promise(async (resolve, reject) => {
  try {
    let cd = getCellVal(cellsData, 'case size');
    if (cd !== '') {
      cd = cd.replace(/mm/gi, '').trim();
    }
    if (cd.includes('x') || cd.includes('X') || cd.includes('×')) {
      cd = cd.match(/.*(?=x|×)/gi)[0].trim();
    }
    cd = cd.replace(/\.0*$/gi, '').trim();
    resolve(cd);
  } catch (error) {
    console.log(`fetchCaseDiameter Error: ${error}`);
    resolve(error);
  }
});

/**
* Get Movement
* @param {array} cellsData
* @return {string} Movement Value to store
*/
const fetchMovement = (cellsData) => new Promise(async (resolve, reject) => {
  try {
    let movement = getCellVal(cellsData, 'movement');
    if (movement !== '') {
      if (movement.toLowerCase() == 'hand wind') {
        movement = 'Manual';
      }
    }
    resolve(movement);
  } catch (error) {
    console.log(`fetchMovement Error: ${error}`);
    resolve(error);
  }
});

/**
* Get Water Resistance
* @param {array} cellsData
* @return {string} Water Resistance Value to store
*/
const fetchWaterResistance = (cellsData) => new Promise(async (resolve, reject) => {
  try {
    let wr = getCellVal(cellsData, 'water resistance');
    if (wr.toLowerCase().includes('meters')) {
      wr = Number(wr.match(/.*(?=meters)/gi)[0].trim()) / 10;
      wr = String(wr);
    } else {
      wr = '';
    }
    resolve(wr);
  } catch (error) {
    console.log(`fetchWaterResistance Error: ${error}`);
    resolve(error);
  }
});

/**
* Get Power Reserve
* @param {array} cellsData
* @return {string} Power Reserve Value to store
*/
const fetchPowerReserve = (cellsData) => new Promise(async (resolve, reject) => {
  try {
    let pr = getCellVal(cellsData, 'power reserve');
    pr = pr.replace(/hours/gi, '').replace(/hour/gi, '').replace(/hout/gi, '').replace(/houts/gi, '').trim();
    if (pr.toLowerCase().includes('years') || pr.toLowerCase().includes('months')) pr = '';
    if (/\d*.*\/\d*.*days/gi.test(pr)) {
      pr = pr.match(/\d*.*(?=\/)/gi)[0].trim();
    };
    if (/\d*.*days.*\/\d*/gi.test(pr)) {
      pr = pr.match(/(?<=\/).*$/gi)[0].trim();
    }
    if (pr.includes('-')) {
      pr = pr.match(/.*(?=-)/gi)[0].trim();
    }
    if (pr.toLowerCase().includes('days')) {
      pr = String(Number(pr.replace('days', '').trim()) * 24);
    }
    resolve(pr);
  } catch (error) {
    console.log(`fetchPowerReserve Error: ${error}`);
    resolve(error);
  }
});

/**
* Get Condition
* @param {object} page Page Object
* @return {string} Condition value to store
*/
const fetchCondition = (page) => new Promise(async (resolve, reject) => {
  try {
    let condition = 'new';
    const pageTitle = await page.title();
    if (pageTitle.toLowerCase().includes('pre-owned')) {
      condition = 'preowned';
    }
    resolve(condition);
  } catch (error) {
    console.log(`fetchCondition Error: ${error}`);
    resolve(error);
  }
});

/**
* Fetch Watch Price from Product Page
* @param {object} page Page Object
* @return {string} Watch Price
*/
const fetchPrice = (page) => new Promise(async (resolve, reject) => {
  try {
    let price = '';
    await page.waitForSelector('.price-wrapper .now-price > span:first-child');
    price = await page.$eval(
        '.price-wrapper .now-price > span:first-child',
        (elm) => elm.innerText.trim(),
    );

    price = price.replace(/\.0+$/gi, '').trim();
    resolve(price);
  } catch (error) {
    console.log(`fetchPrice Error: ${error}`);
    reject(error);
  }
});

/**
* Fetch Retail Price from Product Page
* @param {object} page Page Object
* @return {string} Retail Price
*/
const fetchRetailPrice = (page) => new Promise(async (resolve, reject) => {
  try {
    let retailPrice = '';
    await page.waitForSelector('.price-wrapper');
    const retailPriceNode = await page.$('.price-wrapper .retail-price-wrapper .retail-wrapper > span:last-child');
    if (retailPriceNode) {
      retailPrice = await page.$eval(
          '.price-wrapper .retail-price-wrapper .retail-wrapper > span:last-child',
          (elm) => elm.innerText.trim(),
      );
      retailPrice = Helper.clearPrice(retailPrice);
      retailPrice = retailPrice.replace(/\.0+$/gi, '').trim();
    };
    resolve(retailPrice);
  } catch (error) {
    console.log(`fetchRetailPrice Error: ${error}`);
    reject(error);
  }
});

/**
* Fetch Watch Image from Product Page
* @param {object} page Page Object
* @return {string} if right image found then url otherwise empty string
*/
const fetchImageURL = (page) => new Promise(async (resolve, reject) => {
  try {
    let firstImgURL = '';
    const sliderNode = await page.$('.image-main > .image-main__gallery .swiper-wrapper > .swiper-slide:first-child > img');
    if (sliderNode) {
      await page.waitForSelector('.image-main > .image-main__gallery .swiper-wrapper > .swiper-slide:first-child > img');
      firstImgURL = await page.$eval(
          '.image-main > .image-main__gallery .swiper-wrapper > .swiper-slide:first-child > img',
          (elm) => elm.getAttribute('src'),
      );
    }

    resolve(firstImgURL);
  } catch (error) {
    console.log(`fetchImageURL Error: ${error}`);
    reject(error);
  }
});

/**
 * Reset Bot Statistics
 * @return {boolean}
 */
const resetStates = () => new Promise(async (resolve, reject) => {
  try {
    returnObject.successPages = 0;
    returnObject.errorPages = 0;
    returnObject.errorText = '';
    returnObject.updatedPrices = 0;
    productLinks = [];
    noChangeData = [];
    errorLinks = [];
    browser = false;
    notFoundBrands = [];

    resolve(true);
  } catch (error) {
    console.log('resetStates Error: ', error);
    reject(error);
  }
});
