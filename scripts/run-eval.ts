import { CASES_FILE, HOLDOUT_FILE, HOLDOUT_RESULTS_FILE, RESULTS_FILE, runEval } from "../lib/eval";

async function main() {
  const holdout = process.argv.includes("--holdout");
  const report = await runEval(3, holdout ? { cases: HOLDOUT_FILE, results: HOLDOUT_RESULTS_FILE } : { cases: CASES_FILE, results: RESULTS_FILE });
  console.log(`\n${report.passed}/${report.total} geçti  (model: ${report.model}, p50 ${report.latencyP50} ms, p95 ${report.latencyP95} ms, ${report.totalTokens} token)`);
  for (const [cat, v] of Object.entries(report.byCategory)) console.log(`  ${cat.padEnd(16)} ${v.passed}/${v.total}`);
  for (const c of report.cases.filter((x) => !x.pass)) {
    console.log(`\n✗ ${c.id}: ${c.question}`);
    for (const k of c.checks.filter((x) => !x.ok)) console.log(`    - ${k.name}${k.detail ? ` (${k.detail})` : ""}`);
    console.log(`    cevap: ${c.answer.replace(/\s+/g, " ").slice(0, 220)}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
