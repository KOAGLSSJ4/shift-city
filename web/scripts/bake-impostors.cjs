const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const id of process.argv.slice(2)) {
    const p = await b.newPage();
    p.on('pageerror', (e) => console.log('ERR', e.message));
    await p.goto(`http://localhost:4300/index.html?id=${id}`);
    await p.waitForFunction(() => window.result, null, { timeout: 900000, polling: 2000 });
    const r = await p.evaluate(() => window.result);
    fs.writeFileSync(`out_${id}.png`, Buffer.from(r.png.split(',')[1], 'base64'));
    fs.writeFileSync(`out_${id}.json`, JSON.stringify(r.meta));
    console.log('baked', id, JSON.stringify(r.meta));
    await p.close();
  }
  await b.close();
})();
