#!/usr/bin/env node
/**
 * FlashRoute Setup Wizard
 * ========================
 * Interactive setup script for local development environment.
 * Validates prerequisites, creates .env file, and starts infrastructure.
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import readline from 'node:readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (prompt) =>
  new Promise((resolve) => {
    rl.question(prompt, resolve);
  });

const run = (cmd, opts = {}) => {
  try {
    execSync(cmd, { stdio: 'inherit', ...opts });
    return true;
  } catch (e) {
    return false;
  }
};

const runOutput = (cmd) => {
  return execSync(cmd, { encoding: 'utf-8' }).trim();
};

const header = `
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   ███████╗██╗   ██╗██████╗ ███████╗ █████╗  ██████╗██╗  ██╗  ║
║   ██╔════╝██║   ██║██╔══██╗██╔════╝██╔══██╗██╔════╝██║  ██║  ║
║   ███████╗██║   ██║██████╔╝█████╗  ███████║██║     ███████║  ║
║   ╚════██║██║   ██║██╔══██╗██╔══╝  ██╔══██║██║     ██╔══██║  ║
║   ███████║╚██████╔╝██║  ██║███████╗██║  ██║╚██████╗██║  ██║  ║
║   ╚══════╝ ╚═════╝ ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝  ║
║                                                              ║
║   Arbitrage Intelligence Platform                            ║
║   Version 1.0.0                                             ║
╚══════════════════════════════════════════════════════════════╝
`;

async function checkPrerequisites() {
  console.log('\n[1/5] Checking prerequisites...\n');

  const checks = [
    { name: 'Node.js 22+', cmd: "node -v", test: (v) => { const n = parseInt(v.slice(1)); return n >= 22; } },
    { name: 'pnpm 9+', cmd: "pnpm -v", test: (v) => parseInt(v) >= 9 },
    { name: 'Docker', cmd: "docker --version", test: () => true },
    { name: 'Docker Compose', cmd: "docker compose version", test: () => true },
    { name: 'Git', cmd: "git --version", test: () => true },
  ];

  let allPassed = true;
  for (const check of checks) {
    try {
      const output = runOutput(check.cmd);
      const pass = check.test ? check.test(output) : true;
      console.log(`  ${pass ? '✅' : '⚠️ '} ${check.name}: ${output}`);
      if (!pass) allPassed = false;
    } catch {
      console.log(`  ❌ ${check.name}: not found`);
      allPassed = false;
    }
  }

  if (!allPassed) {
    console.log('\n⚠️  Some prerequisites are missing. Please install them before continuing.');
    console.log('  See: https://docs.flashroute.com/operator-setup.html#prerequisites\n');
    process.exit(1);
  }
}

async function createEnvFile() {
  console.log('\n[2/5] Configuring environment...\n');

  const envPath = '.env';
  const envExamplePath = '.env.example';
  const deployEnvPath = 'deploy/.env.example';

  let exampleEnv = '';
  if (existsSync(envExamplePath)) {
    exampleEnv = readFileSync(envExamplePath, 'utf-8');
  } else if (existsSync(deployEnvPath)) {
    exampleEnv = readFileSync(deployEnvPath, 'utf-8');
  }

  if (existsSync(envPath)) {
    const answer = await question('  .env already exists. Overwrite? (y/N): ');
    if (answer.toLowerCase() !== 'y') {
      console.log('  Skipped — keeping existing .env\n');
      return;
    }
  }

  const envContent = exampleEnv
    .replace(/CHANGE_ME[^]*/g, (match) => match.replace(/CHANGE_ME/, ''))
    .replace('NODE_ENV=production', 'NODE_ENV=development');

  writeFileSync(envPath, envContent);
  console.log(`  ✅ Created ${envPath}`);
  console.log('  ⚠️  Please review and update sensitive values before running.\n');
}

async function installDeps() {
  console.log('\n[3/5] Installing dependencies...\n');

  const answer = await question('  Run `pnpm install`? (Y/n): ');
  if (answer.toLowerCase() === 'n') {
    console.log('  Skipped — run `pnpm install` manually.\n');
    return;
  }

  console.log('  Installing (this may take a few minutes)...\n');
  if (!run('pnpm install')) {
    console.log('  ❌ pnpm install failed. Please run it manually.\n');
    process.exit(1);
  }
  console.log('  ✅ Dependencies installed\n');
}

async function startInfrastructure() {
  console.log('\n[4/5] Starting infrastructure (Docker)...\n');

  const answer = await question('  Start PostgreSQL and Redis via Docker Compose? (Y/n): ');
  if (answer.toLowerCase() === 'n') {
    console.log('  Skipped — ensure PostgreSQL and Redis are running.\n');
    return;
  }

  if (!run('docker compose up -d postgres redis')) {
    console.log('  ⚠️  Docker compose failed. Ensure Docker is running and try manually:\n');
    console.log('      docker compose up -d postgres redis\n');
  } else {
    console.log('  ✅ PostgreSQL and Redis started\n');

    // Wait for health
    console.log('  Waiting for services to be healthy...');
    let ready = false;
    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        execSync('pg_isready -U flashroute -d flashroute', { stdio: 'ignore' });
        execSync('redis-cli ping', { stdio: 'ignore' });
        ready = true;
        break;
      } catch {}
      process.stdout.write('.');
    }
    console.log(ready ? '\n  ✅ Services are healthy\n' : '\n  ⚠️  Services may still be starting — check `docker compose ps`\n');
  }
}

async function runMigrations() {
  console.log('\n[5/5] Database migrations...\n');

  const answer = await question('  Run database migrations? (Y/n): ');
  if (answer.toLowerCase() === 'n') {
    console.log('  Skipped — run manually: pnpm --filter @flashroute/db migrate deploy\n');
    return;
  }

  console.log('  Running migrations...\n');
  if (!run('pnpm --filter @flashroute/db migrate deploy')) {
    console.log('  ⚠️  Migrations failed. Check DATABASE_URL in .env and try manually.\n');
  } else {
    console.log('  ✅ Migrations applied\n');
  }
}

async function main() {
  console.log(header);

  await checkPrerequisites();
  await createEnvFile();
  await installDeps();
  await startInfrastructure();
  await runMigrations();

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  ✅ Setup complete!\n');
  console.log('  Next steps:');
  console.log('    1. Review and update .env with your values');
  console.log('    2. Start the API:       pnpm --filter @flashroute/api dev');
  console.log('    3. Start the frontend:   pnpm --filter @flashroute/web dev');
  console.log('    4. Start the jobs worker: pnpm --filter @flashroute/jobs-worker dev');
  console.log('    5. Open http://localhost:5173\n');
  console.log('  For full setup guide: https://docs.flashroute.com/operator-setup.html');
  console.log('  For dev docs:          https://docs.flashroute.com/SETUP-GUIDE.html');
  console.log('═══════════════════════════════════════════════════════════════\n');

  rl.close();
}

main().catch((err) => {
  console.error('\n  ❌ Setup failed:', err.message, '\n');
  process.exit(1);
});
