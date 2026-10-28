// Every check this project has, in one command, with a summary at the end.
//   npm run verify:all            static + unit + database rules + live site (end-to-end and page sweep)
//   npm run verify:all -- --quick static + unit only (no network)
//   npm run verify:all -- --public-dns   look the site up via Google DNS (when the local router lags)
// The database and live suites write only TEST data and purge it afterwards.
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const quick = process.argv.includes("--quick");
const pdns = process.argv.includes("--public-dns") ? " --public-dns" : "";
const logs = mkdtempSync(join(tmpdir(), "qrclock-verify-"));
const SWEEP = ["/today", "/timesheets", "/timesheets/export", "/review", "/me", "/setup/employees", "/setup/cards",
  "/setup/cards?format=tag", "/setup/kiosks", "/setup/locations", "/setup/holidays", "/setup/settings"].join(",");
const checks = [
  ["types", "npx next typegen && npx tsc --noEmit"],
  ["lint", "npm run lint"],
  ["unit tests", "npm test"],
  ...(quick ? [] : [
    ["database rules", "npm run test:db"],
    ["live end-to-end", `node scripts/live-flow.mjs --out "${join(logs, "flow")}"${pdns}`],
    ["live page sweep", `node "${join(process.env.USERPROFILE ?? "", ".claude/standards/live-check/live-check.mjs")}" --project . --base https://clock.ccov.co.za --email wb@ccov.co.za --paths "${SWEEP}" --widths 375,768,1280 --out "${join(logs, "sweep")}"${pdns}`],
  ]),
];

const results = [];
for (const [name, cmd] of checks) {
  const t = Date.now();
  const r = spawnSync(cmd, { shell: true, encoding: "utf8", env: { ...process.env, MSYS_NO_PATHCONV: "1" } });
  const log = join(logs, `${name.replace(/\W+/g, "-")}.log`);
  writeFileSync(log, `${r.stdout ?? ""}\n${r.stderr ?? ""}`);
  results.push({ name, ok: r.status === 0, secs: ((Date.now() - t) / 1000).toFixed(0), log, tail: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim().split("\n").slice(-12).join("\n") });
  console.log(`${r.status === 0 ? "PASS" : "FAIL"}  ${name} (${results.at(-1).secs}s)`);
}
const failed = results.filter(r => !r.ok);
for (const f of failed) console.log(`\n── ${f.name} (full log: ${f.log})\n${f.tail}`);
console.log(`\n${results.length - failed.length}/${results.length} passed. Logs and screenshots: ${logs}`);
process.exit(failed.length ? 1 : 0);
