import { execFileSync, spawnSync } from 'node:child_process';

let branch = process.env.AWS_BRANCH;
if (!branch) {
  try { branch = execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim(); }
  catch { branch = ''; }
}
const script = branch === 'dana-push-experience' ? 'build:push' : 'build:portal';
const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', script], { stdio: 'inherit' });
process.exit(result.status ?? 1);
