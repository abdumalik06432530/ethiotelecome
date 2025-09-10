const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const env = {
  BASE_URL: process.env.BASE_URL || 'https://ethiotelecome.vercel.app'
};
const out = `(function(window){
  // Generated from frontend/.env by generate-config.js 
  window.__ENV = window.__ENV || {};
  window.__ENV.BASE_URL = ${JSON.stringify(env.BASE_URL)};
})(window);
`;

fs.writeFileSync(path.join(__dirname, 'config.js'), out, 'utf8');
console.log('Generated frontend/config.js with BASE_URL =', env.BASE_URL);
