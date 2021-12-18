# 01-data

This program will gather financial data on a business. The other programs in this suite of programs make use of this data to function.
Therfore you will need to run this program first in the chain.

## Setup

you need to create a config.json file. This will configure the program.
There are two parameters you need to add.

1. apikey - This an apikey from https://quickfs.net/ you will need to create a free account to get this key.
2. path - This is a folder path to where your output files will be stored on your harddisk.

This is an example of a config.json file:

```json
{
  "apikey": "781e2fb667..hidden..0b4f0f7122a9",
  "path": "C:/Business analysis/Evaluation"
}
```

## Usage

In this example the program will gather data on Facebook

`npm start -- FB`

## Output

The output of this program is financial data in json form. It will be outputted into a sub folder of your path in the config file.

### Outpur folder structure

_path_/_stock-name_/01-data/_date_.json

e.g.
C:/Business analysis/Evaluation/FB/01-data/2021.12.18.json

## What does it do?

It scrapes the data from finance.yahoo.com and also extracts data from https://quickfs.net/.

These two places give all the data we need to make a full analysis.
