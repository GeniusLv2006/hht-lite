const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const deployScript = path.join(root, 'deploy.sh');

function runReleaseGuard(gitFunction) {
  return spawnSync('bash', ['-c', `
    set -e
    export HHT_DEPLOY_LIB_ONLY=true
    source "$1"
    SCRIPT_DIR="$2"
    ${gitFunction}
    ensure_release_source
  `, 'test', deployScript, root], { encoding: 'utf8' });
}

test('release build guard accepts clean main matching origin/main', () => {
  const result = runReleaseGuard(`
    git() {
      case "$3" in
        branch) printf 'main\\n' ;;
        status) ;;
        rev-parse) return 0 ;;
        rev-list) printf '0\\t0\\n' ;;
      esac
    }
  `);

  assert.equal(result.status, 0, result.stderr);
});

test('release build guard rejects non-main branches', () => {
  const result = runReleaseGuard(`
    git() {
      if [ "$3" = branch ]; then printf 'feature/test\\n'; return; fi
    }
  `);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Release builds must run from main/);
});

test('release build guard rejects dirty worktrees and divergent commits', () => {
  const dirty = runReleaseGuard(`
    git() {
      case "$3" in
        branch) printf 'main\\n' ;;
        status) printf ' M server.js\\n' ;;
      esac
    }
  `);
  assert.notEqual(dirty.status, 0);
  assert.match(dirty.stderr, /clean working tree/);

  const divergent = runReleaseGuard(`
    git() {
      case "$3" in
        branch) printf 'main\\n' ;;
        status) ;;
        rev-parse) return 0 ;;
        rev-list) printf '0\\t1\\n' ;;
      esac
    }
  `);
  assert.notEqual(divergent.status, 0);
  assert.match(divergent.stderr, /HEAD to match origin\/main/);
});

test('rollback removes a failed replacement before restoring the previous container', () => {
  const output = execFileSync('bash', ['-c', `
    set -e
    export HHT_DEPLOY_LIB_ONLY=true
    source "$1"
    CONTAINER_NAME=hht-lite
    ROLLBACK_NAME=hht-lite-rollback
    had_previous=true
    LOG_FILE="$(mktemp)"
    docker() { printf '%s\\n' "$*" >> "$LOG_FILE"; }
    wait_for_health() { printf 'wait %s\\n' "$1" >> "$LOG_FILE"; }
    restore_previous_container
    cat "$LOG_FILE"
    rm -f "$LOG_FILE"
  `, 'test', deployScript], { encoding: 'utf8' });

  assert.deepEqual(output.trim().split('\n'), [
    'rm --force hht-lite',
    'rename hht-lite-rollback hht-lite',
    'start hht-lite',
    'wait hht-lite'
  ]);
});
