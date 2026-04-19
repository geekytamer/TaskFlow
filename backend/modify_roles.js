const fs = require('fs');
const content = fs.readFileSync('src/server.ts', 'utf8');
let inTargetGet = false;
const lines = content.split('\n');
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('app.get(')) {
    const nextLine = lines[i+1] || '';
    if (nextLine.match(/'\/companies\/:companyId\/(clients|suppliers|finance\/|invoices|vendor-bills|purchase-orders|purchase-receipts|purchase-order-payables)/) ||
        nextLine.match(/'\/(invoices|vendor-bills).*\/payments/)) {
      inTargetGet = true;
    } else {
      inTargetGet = false;
    }
  }

  if (inTargetGet && lines[i].includes('requireCompanyRoles')) {
    // Add 'Employee' if missing
    if (!lines[i].includes("'Employee'")) {
      lines[i] = lines[i].replace(/\]\);/, ", 'Employee']);");
    }
  }
}
fs.writeFileSync('src/server.ts', lines.join('\n'), 'utf8');
console.log('Modified src/server.ts');
