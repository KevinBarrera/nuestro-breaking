const { resolve } = require('node:path');
const { register } = require('tsconfig-paths');

register({
  baseUrl: resolve(__dirname, '../src'),
  paths: { '@/*': ['*'] },
});
