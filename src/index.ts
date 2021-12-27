#!/usr/bin/env node
import { Page, webkit } from 'playwright';
import fs from 'fs';
const config = require('./config.json');

async function app() {
  var myArgs = process.argv.slice(2);

  for (const symbol of myArgs) {
    await evaluateStock(symbol);
  }
}

async function evaluateStock(symbol: string): Promise<void> {
  const browser = await webkit.launch({
    headless: true
  });
  const page = await browser.newPage();

  let stats = await getStatisticsPage(page, symbol);

  const fcfAverage = await getFreeCashFlowAverage(page, symbol);

  stats = { ...stats, ...fcfAverage };

  const growthAnlysis = await getGrowthEstimates(page, symbol);
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

  const myJson: any = await response.json();

  stats = {
    ...stats,
    data: { ...myJson }
  };

  const path = `${config.path}/${symbol}`;
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

  //

  await browser.close();
}

function yahooSymbolToQuickFSSymbol(yahooSymbol: string): string {
  return yahooSymbol.replace('.TO', ':CA');
}

async function getStatisticsPage(page: Page, symbol: string) {
  await page.goto(
    `https://finance.yahoo.com/quote/${symbol}/key-statistics?p=${symbol}`
  );

  const buttons = await page.$$('button');
  await buttons[0].click();

  await page.waitForLoadState('networkidle');

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

// TODO: Kill this, it is better to get this from public-api.quickfs.net
async function getFreeCashFlowAverage(page: Page, symbol: string) {
  await page.goto(
    `https://finance.yahoo.com/quote/${symbol}/cash-flow?p=${symbol}`
  );

  await page.waitForLoadState('networkidle');

  const lines = await page.$$('[data-test="fin-row"]');

  const lastLine = lines[lines.length - 1];

  const innerDivs = await lastLine.$$('[data-test="fin-col"]');

  const [ttm, ...freecashFlows] = innerDivs;

  let total = 0;

  let fcfArray: number[] = [];

  for (let fcf of freecashFlows.slice(0, 3)) {
    const rawText = cleanTextNumber(await fcf.innerText());
    const value = Number(rawText) * 1000;
    fcfArray.push(value);
    total += value;
  }

  const endingValue = cleanTextNumber(await freecashFlows[0].innerText());
  const beginingValue = cleanTextNumber(
    await freecashFlows[freecashFlows.length - 1].innerText()
  );

  const growth = Number(endingValue) / Number(beginingValue) - 1;

  return {
    FFC: fcfArray,
    Growth: `${Math.round(growth * 100)}%`,
    FreeCashFlowAverage: total / 3
  };
}

async function getGrowthEstimates(
  page: Page,
  symbol: string
): Promise<any | null> {
  await page.goto(
    `https://finance.yahoo.com/quote/${symbol}/analysis?p=${symbol}`
  );

  await page.waitForLoadState('networkidle');

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
