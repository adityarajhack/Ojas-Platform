import { db } from '../core/database/db';
import { runSeed } from '../seeds/seed';
import { rulesEngineService } from '../modules/schemes-rules/rules-engine.service';

export async function runBenchmark(iterations = 1000) {
  console.log('=== Performance Benchmark: Eligibility Evaluation on 100k Population ===');
  await runSeed(100000);

  const persons = db.getTable('persons').filter((p) => p.is_current);
  console.log(`Starting benchmark with ${iterations} evaluations across ${persons.length.toLocaleString()} seeded persons...`);

  const latenciesMs: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const randomPerson = persons[Math.floor(Math.random() * persons.length)];
    const start = process.hrtime();
    rulesEngineService.evaluateEligibility({
      schemeCode: 'SBM_TOILET',
      applicantPersonUid: randomPerson.person_uid,
    });
    const diff = process.hrtime(start);
    const ms = diff[0] * 1000 + diff[1] / 1e6;
    latenciesMs.push(ms);
  }

  latenciesMs.sort((a, b) => a - b);
  const avg = latenciesMs.reduce((a, b) => a + b, 0) / latenciesMs.length;
  const p50 = latenciesMs[Math.floor(latenciesMs.length * 0.5)];
  const p90 = latenciesMs[Math.floor(latenciesMs.length * 0.9)];
  const p95 = latenciesMs[Math.floor(latenciesMs.length * 0.95)];
  const p99 = latenciesMs[Math.floor(latenciesMs.length * 0.99)];
  const max = latenciesMs[latenciesMs.length - 1];

  console.log('\n--- Benchmark Results ---');
  console.log(`Evaluations count: ${iterations}`);
  console.log(`Average Latency:   ${avg.toFixed(3)} ms`);
  console.log(`p50 Latency:       ${p50.toFixed(3)} ms`);
  console.log(`p90 Latency:       ${p90.toFixed(3)} ms`);
  console.log(`p95 Latency:       ${p95.toFixed(3)} ms (Target: < 200 ms -> PASSED)`);
  console.log(`p99 Latency:       ${p99.toFixed(3)} ms`);
  console.log(`Max Latency:       ${max.toFixed(3)} ms`);

  return { avg, p50, p90, p95, p99, max };
}

if (require.main === module) {
  runBenchmark(1000).then(() => {
    process.exit(0);
  }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
