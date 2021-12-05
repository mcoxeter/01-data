#!/usr/bin/env node
import { Page, webkit } from 'playwright';
import fs from 'fs';

async function app() {
  var myArgs = process.argv.slice(2);
  const symbol = myArgs[0];
  const browser = await webkit.launch({
    headless: true
  });
  const page = await browser.newPage();

  let stats = await getStatisticsPage(page, symbol);

  const fcfAverage = await getFreeCashFlowAverage(page, symbol);

  stats = { ...stats, ...fcfAverage };

  const growthAnlysis = await getGrowthEstimates(page, symbol);
  stats = {
    ...stats,
    'Growth Next 5 Years (per annum)': growthAnlysis['Next 5 Years (per annum)']
  };

  const response = await page.request.get(
    `https://public-api.quickfs.net/v1/data/all-data/${symbol}?api_key=781e2fb667feea2f43e3078f6c3a0b4f0f7122a9`
  );

  const myJson: any = await response.json();

  stats = {
    ...stats,
    data: { ...myJson }
  };

  const path = `C:/Users/Mike/OneDrive - Digital Sparcs/Investing/Value Investing Process/Business analysis/Evaluation/${symbol}`;
  const requiredPaths = [path, `${path}/core`];
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

  console.log('Writing ', `${path}/core/${nowDateStr}.json`);
  try {
    fs.writeFileSync(
      `${path}/core/${nowDateStr}.json`,
      JSON.stringify(stats, undefined, 4)
    );
  } catch (err) {
    console.error(err);
  }

  //

  await browser.close();
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

  for (let fcf of freecashFlows.slice(0, 3)) {
    const rawText = cleanTextNumber(await fcf.innerText());
    const value = Number(rawText) * 1000;
    total += value;
  }

  const endingValue = cleanTextNumber(await freecashFlows[0].innerText());
  const beginingValue = cleanTextNumber(
    await freecashFlows[freecashFlows.length - 1].innerText()
  );

  const growth = Number(endingValue) / Number(beginingValue) - 1;

  return {
    Growth: `${Math.round(growth * 100)}%`,
    FreeCashFlowAverage: total / 3
  };
}

async function getGrowthEstimates(page: Page, symbol: string) {
  await page.goto(
    `https://finance.yahoo.com/quote/${symbol}/analysis?p=${symbol}`
  );

  await page.waitForLoadState('networkidle');

  const tables = await page.$$('table');

  let growthEstimates: any = {};

  const sixthTable = tables[5];
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
