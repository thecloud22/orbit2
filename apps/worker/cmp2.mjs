import { chromium } from 'playwright';
import { snapshot } from './src/snapshot.ts';
const b = await chromium.launch(); const p = await b.newPage();
await p.goto(process.argv[2], { waitUntil: 'domcontentloaded' });
for (const s of await snapshot(p)) console.log(`   ${String(s.role).padEnd(9)} "${s.name.slice(0,46)}"   [${s.binding.strategy}]`);
await b.close();
