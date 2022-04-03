#!/usr/bin/env node
import { Page, webkit } from 'playwright';
import fs from 'fs';
const config = require('./config.json');

async function app() {
  var myArgs = process.argv.slice(2);

  if (myArgs.length === 0) {
    // When no arguments are passed then we use the evaluate.json file as a list of stocks to evaluate.
    const path = `${config.path}`;
    const evaluationList = require(`${path}/evaluate.json`);

    console.log('Evaluating stocks from evaluate.json');

    for (const evaluate of evaluationList.evaluate) {
      await evaluateStock(evaluate.Symbol);
    }
    return;
  }

  for (const symbol of myArgs) {
    await evaluateStock(symbol);
  }
}

async function evaluateStock(symbol: string): Promise<void> {
  console.log('Procesing stock ' + symbol);
  const browser = await webkit.launch({
    headless: true
  });
  const page = await browser.newPage();

  let stats = await getStatisticsPage(page, symbol);

  console.log('Procesing stock ' + symbol + '. Stats gathered');

  const growthAnlysis = await getGrowthEstimates(page, symbol);
  console.log('Procesing stock ' + symbol + '. Growth gathered');

  const insiderBuysInLast90Days = await getNumberOfInsiderTradeBuysInLast90Days(
    page,
    symbol
  );
  console.log('Procesing stock ' + symbol + '. Insider trades gathered');

  const growthAnlysisValue = growthAnlysis
    ? (growthAnlysis['Next 5 Years (per annum)'] as string)
    : 'unavailable';

  stats = {
    ...stats,
    'Growth Next 5 Years (per annum)': growthAnlysisValue
  };

  const response = await page.request.get(
    `https://public-api.quickfs.net/v1/data/all-data/${yahooSymbolToQuickFSSymbol(
      symbol
    )}?api_key=${config.apikey}`
  );

  console.log('Procesing stock ' + symbol + '. QuickFS data gathered');

  const myJson: any = await response.json();

  stats = {
    ...stats,
    data: { ...myJson },
    insiderBuysInLast90Days: insiderBuysInLast90Days
  };

  const path = `${config.path}/Evaluation/${symbol}`;
  const requiredPaths = [path, `${path}/01-data`];
  const nowDate = new Date();
  const padNum = (num: number) => num.toString().padStart(2, '0');

  const nowDateStr = `${nowDate.getFullYear()}.${padNum(
    nowDate.getMonth() + 1
  )}.${padNum(nowDate.getDate())}`;

  requiredPaths.forEach((p) => {
    if (!fs.existsSync(p)) {
      fs.mkdirSync(p);
    }
  });

  console.log('Writing ', `${path}/01-data/${nowDateStr}.json`);
  try {
    fs.writeFileSync(
      `${path}/01-data/${nowDateStr}.json`,
      JSON.stringify(stats, undefined, 4)
    );
  } catch (err) {
    console.error(err);
  }

  await browser.close();
}

function yahooSymbolToQuickFSSymbol(yahooSymbol: string): string {
  return yahooSymbol.replace('-', '.').replace('.TO', ':CA');
}

async function goto(page: Page, url: string, retry: number) {
  for (let i = 0; i < retry; i++) {
    try {
      await page.goto(url);
      return;
    } catch {}
  }
}

async function getStatisticsPage(page: Page, symbol: string) {
  const url = `https://finance.yahoo.com/quote/${symbol}/key-statistics?p=${symbol}`;
  await goto(page, url, 4);
  const buttons = await page.$$('button');
  await buttons[0].click();

  await page.waitForLoadState('networkidle', { timeout: 0 });

  let statistics: any = {};

  const price = await page.$('[data-test="qsp-price"]');
  if (price) {
    const rawPrice = await price.innerText();
    statistics['Price'] = Number(cleanTextNumber(rawPrice));
  }

  const tables = await page.$$('table');

  for (let table of tables) {
    const rows = await table.$$('tr');
    if (rows) {
      for (let row of rows) {
        if (row) {
          const tds = await row.$$('td');
          if (tds && tds.length === 2) {
            const key = await tds[0].innerText();
            const val = await tds[1].innerText();
            if (key && val) {
              statistics[key] = val;
              if (val.includes('B') || val.includes('M')) {
                statistics[key] = processMillionAndBillion(val);
              }
            }
          }
        }
      }
    }
  }
  return statistics;
}

async function getGrowthEstimates(
  page: Page,
  symbol: string
): Promise<any | null> {
  const url = `https://finance.yahoo.com/quote/${symbol}/analysis?p=${symbol}`;
  await goto(page, url, 4);

  await page.waitForLoadState('networkidle', { timeout: 0 });

  const tables = await page.$$('table');

  let growthEstimates: any = {};

  const sixthTable = tables[5];
  if (sixthTable === undefined) {
    return null;
  }

  const tbody = await sixthTable.$('tbody');

  if (tbody) {
    const rows = await tbody.$$('tr');

    if (rows) {
      for (let row of rows) {
        if (row) {
          const tds = await row.$$('td');
          if (tds && tds.length > 1) {
            const key = await tds[0].innerText();
            const val = await tds[1].innerText();
            if (key && val) {
              growthEstimates[key] = val;
            }
          }
        }
      }
    }
  }
  return growthEstimates;
}

async function getNumberOfInsiderTradeBuysInLast90Days(
  page: Page,
  symbol: string
): Promise<number> {
  const url = `http://www.openinsider.com/screener?s=${symbol}&o=&pl=&ph=&ll=&lh=&fd=90&fdr=&td=0&tdr=&fdlyl=&fdlyh=&daysago=30&xp=1&vl=&vh=&ocl=&och=&sic1=-1&sicl=100&sich=9999&isofficer=1&iscob=1&isceo=1&ispres=1&iscoo=1&iscfo=1&isgc=1&isvp=1&grp=0&nfl=&nfh=&nil=&nih=&nol=&noh=&v2l=&v2h=&oc2l=&oc2h=&sortcol=0&cnt=100&page=1`;

  await goto(page, url, 4);

  await page.waitForLoadState('networkidle', { timeout: 0 });

  const results = await page.$('#results');
  const resultsTxt = await results?.innerText();
  let numberInsiders = 0;
  if (resultsTxt?.length ?? 0 > 0) {
    numberInsiders = Number(resultsTxt?.split('results.')[0]);
  }
  return numberInsiders;
}

function cleanTextNumber(text: string): string {
  return text.replace(/,/g, '').replace('M', '').replace('B', '');
}

function processMillionAndBillion(val: string): number {
  if (val.includes('B')) {
    const bv = val.replace('B', '');
    const mnv = Number(bv);
    return mnv * 1000000000;
  }
  if (val.includes('M')) {
    const mv = val.replace('M', '');
    const mnv = Number(mv);
    const bnv = mnv * 1000000;
    return bnv;
  }
  return -1;
}

app();
