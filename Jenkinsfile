// lucem-wallet CI pipeline.
// Runs on PR refs (PR-*) and mainline branches discovered by Jenkins multibranch config.
//
// Build / integration / E2E need the same variables as local `.env` (Koios keys, pool IDs, etc.).
// Provide them as Jenkins credential ID `lucem-wallet-dotenv` (Secret file).
//
// GitHub branch protection expects Jenkins-owned commit statuses, not GitHub-hosted CI jobs:
//   Jenkins / Build
//   Jenkins / Unit tests
//   Jenkins / Integration tests
//   Jenkins / Functional tests
//   Jenkins / Mobile Android
//
// To publish those statuses, add Jenkins credential ID `github-status-token` as a secret text
// token with commit status write access for this repository. Missing status credentials do not
// fail the build, but protected PRs will wait for the required Jenkins statuses.

def requiredGithubStatusStages() {
  return ['Build', 'Unit tests', 'Integration tests', 'Functional tests', 'Mobile Android']
}

def publishGithubStatus(String stageName, String state, String description) {
  def repo = env.GITHUB_REPOSITORY ?: 'Fuma419/lucem-wallet'
  def sha = env.CHANGE_HEAD ?: env.GIT_COMMIT
  if (!sha) {
    echo "Skipping GitHub status for ${stageName}: no commit SHA available."
    return
  }

  def targetUrl = env.RUN_DISPLAY_URL ?: env.BUILD_URL ?: ''
  echo "Publishing GitHub status Jenkins / ${stageName}=${state} to ${repo}@${sha}"
  try {
    withCredentials([string(credentialsId: 'github-status-token', variable: 'GITHUB_STATUS_TOKEN')]) {
      withEnv([
        "GH_STATUS_REPO=${repo}",
        "GH_STATUS_SHA=${sha}",
        "GH_STATUS_CONTEXT=Jenkins / ${stageName}",
        "GH_STATUS_STATE=${state}",
        "GH_STATUS_DESCRIPTION=${description}",
        "GH_STATUS_TARGET_URL=${targetUrl}",
      ]) {
        sh(label: "Publish GitHub status: Jenkins / ${stageName}", script: '''
          set +x
          python3 - <<'PY' > /tmp/github-status-payload.json
import json, os
payload = {
    "state": os.environ["GH_STATUS_STATE"],
    "context": os.environ["GH_STATUS_CONTEXT"],
    "description": os.environ["GH_STATUS_DESCRIPTION"][:140],
    "target_url": os.environ.get("GH_STATUS_TARGET_URL", ""),
}
print(json.dumps(payload))
PY
          curl -fsS \
            -X POST \
            -H "Authorization: Bearer ${GITHUB_STATUS_TOKEN}" \
            -H "Accept: application/vnd.github+json" \
            -H "X-GitHub-Api-Version: 2022-11-28" \
            "https://api.github.com/repos/${GH_STATUS_REPO}/statuses/${GH_STATUS_SHA}" \
            --data @/tmp/github-status-payload.json >/dev/null
        ''')
      }
    }
  } catch (err) {
    echo "WARNING: Could not publish GitHub status for ${stageName}: ${err.getMessage()}"
  }
}

def publishPendingGithubStatuses() {
  requiredGithubStatusStages().each { stageName ->
    publishGithubStatus(stageName, 'pending', "${stageName} is waiting in Jenkins")
  }
}

pipeline {
  agent { label 'lucem-wallet' }

  options {
    timestamps()
    timeout(time: 90, unit: 'MINUTES')
    disableConcurrentBuilds(abortPrevious: true)
    buildDiscarder(logRotator(numToKeepStr: '30'))
  }

  environment {
    CI = 'true'
    NODE20_DIR = "${HOME}/.local/node-v20.20.2-linux-x64"
  }

  stages {
    stage('Bootstrap Node 20') {
      steps {
        script {
          publishPendingGithubStatuses()
        }
        sh '''
          set -e
          if [ ! -x "${NODE20_DIR}/bin/node" ]; then
            mkdir -p "${HOME}/.local"
            curl -fsSL "https://nodejs.org/dist/v20.20.2/node-v20.20.2-linux-x64.tar.xz" -o /tmp/node-v20.20.2-linux-x64.tar.xz
            tar -xJf /tmp/node-v20.20.2-linux-x64.tar.xz -C "${HOME}/.local"
          fi
          export PATH="${NODE20_DIR}/bin:${PATH}"
          node -v
          npm -v
        '''
      }
      post {
        failure {
          script {
            publishGithubStatus('Build', 'failure', 'Bootstrap failed before build in Jenkins')
          }
        }
        aborted {
          script {
            publishGithubStatus('Build', 'error', 'Bootstrap was aborted before build in Jenkins')
          }
        }
      }
    }

    stage('Install') {
      steps {
        checkout scm
        sh '''
          set -e
          export PATH="${NODE20_DIR}/bin:${PATH}"
          node -v
          npm -v
          npm ci
        '''
      }
      post {
        failure {
          script {
            publishGithubStatus('Build', 'failure', 'Install failed before build in Jenkins')
          }
        }
        aborted {
          script {
            publishGithubStatus('Build', 'error', 'Install was aborted before build in Jenkins')
          }
        }
      }
    }

    stage('Build') {
      steps {
        script {
          publishGithubStatus('Build', 'pending', 'Build is running in Jenkins')
        }
        sh '''
          set -e
          export PATH="${NODE20_DIR}/bin:${PATH}"
          npm run build:webpack
        '''
      }
      post {
        success {
          script {
            publishGithubStatus('Build', 'success', 'Build passed in Jenkins')
          }
        }
        failure {
          script {
            publishGithubStatus('Build', 'failure', 'Build failed in Jenkins')
          }
        }
        aborted {
          script {
            publishGithubStatus('Build', 'error', 'Build was aborted in Jenkins')
          }
        }
      }
    }

    stage('Unit tests') {
      steps {
        script {
          publishGithubStatus('Unit tests', 'pending', 'Unit tests are running in Jenkins')
        }
        sh '''
          set -e
          export PATH="${NODE20_DIR}/bin:${PATH}"
          # Serialize Jest: parallel workers + CSL/Keystone natives can SIGSEGV
          # on this agent and mark Unit tests failed (flake, not product bugs).
          export CI=1
          npm test
        '''
      }
      post {
        success {
          script {
            publishGithubStatus('Unit tests', 'success', 'Unit tests passed in Jenkins')
          }
        }
        failure {
          script {
            publishGithubStatus('Unit tests', 'failure', 'Unit tests failed in Jenkins')
          }
        }
        aborted {
          script {
            publishGithubStatus('Unit tests', 'error', 'Unit tests were aborted in Jenkins')
          }
        }
      }
    }

    stage('Mobile Android') {
      // Capacitor sync + assembleDebug against the webpack build/ from the Build stage.
      // Bootstraps a user-local Android SDK + JDK 21 under $HOME/.local when needed.
      // iOS is intentionally omitted (needs macOS runners + signing).
      // Soft-gate: mark the stage failed / publish failure status, but do not fail the
      // whole PR pipeline on first-time agent SDK bootstrap flakes. Promote to hard
      // gate once the lucem-wallet agent has a warm SDK cache.
      steps {
        script {
          publishGithubStatus('Mobile Android', 'pending', 'Mobile Android is running in Jenkins')
        }
        catchError(buildResult: 'SUCCESS', stageResult: 'FAILURE') {
          sh '''
            set -e
            export PATH="${NODE20_DIR}/bin:${PATH}"
            npm run mobile:android:ci
          '''
        }
      }
      post {
        success {
          script {
            publishGithubStatus('Mobile Android', 'success', 'Mobile Android passed in Jenkins')
          }
          archiveArtifacts artifacts: 'android/app/build/outputs/apk/debug/*.apk', allowEmptyArchive: true, fingerprint: true
        }
        failure {
          script {
            publishGithubStatus('Mobile Android', 'failure', 'Mobile Android failed in Jenkins (non-gating)')
          }
        }
        aborted {
          script {
            publishGithubStatus('Mobile Android', 'error', 'Mobile Android was aborted in Jenkins')
          }
        }
      }
    }

    stage('Integration tests') {
      // GATING: live-submits a real 5 tADA transfer built by the PRODUCTION wallet
      // builder (src/api/tx/csl-unsigned-tx.js#buildUnsignedSimpleTx) on both
      // testnets — Preview self-send and Preprod account0→account1 — then verifies
      // each tx via the SAME provider that accepted the submit (Blockfrost when a
      // project id is set, else Koios). A broken send path fails here and blocks
      // the merge. Never touches mainnet (URL/addr/key allowlist + mainnet creds
      // stripped below; a read-only guard asserts the mainnet twin is unchanged).
      steps {
        script {
          publishGithubStatus('Integration tests', 'pending', 'Integration tests are running in Jenkins')
        }
        withCredentials([file(credentialsId: 'lucem-wallet-dotenv', variable: 'LUCEM_ENV_FILE')]) {
          sh '''
            set -e
            export PATH="${NODE20_DIR}/bin:${PATH}"
            set +x
            set -a
            . "${LUCEM_ENV_FILE}"
            set +a
            # Live submits: Preview (self-send) + Preprod (account0→account1) only.
            # Keep a read-only mainnet Blockfrost key for the history guard, then
            # strip mainnet credentials so submits cannot target Cardano mainnet.
            export LUCEM_MAINNET_GUARD_PROJECT_ID="${BLOCKFROST_MAINNET_PROJECT_ID:-${BLOCKFROST_PROJECT_ID_MAINNET:-}}"
            unset BLOCKFROST_MAINNET_PROJECT_ID BLOCKFROST_PROJECT_ID_MAINNET \
              KOIOS_API_KEY_MAINNET LUCEM_ALLOW_MAINNET_INTEGRATION \
              LUCEM_INTEGRATION_MAINNET_MNEMONIC || true
            npm run test:integration
          '''
        }
      }
      post {
        success {
          script {
            publishGithubStatus('Integration tests', 'success', 'Integration tests passed in Jenkins')
          }
        }
        failure {
          script {
            publishGithubStatus('Integration tests', 'failure', 'Integration tests failed in Jenkins')
          }
        }
        aborted {
          script {
            publishGithubStatus('Integration tests', 'error', 'Integration tests were aborted in Jenkins')
          }
        }
      }
    }

    stage('Functional tests') {
      steps {
        script {
          publishGithubStatus('Functional tests', 'pending', 'Functional tests are running in Jenkins')
        }
        withCredentials([file(credentialsId: 'lucem-wallet-dotenv', variable: 'LUCEM_ENV_FILE')]) {
          sh '''
            set -e
            export PATH="${NODE20_DIR}/bin:${PATH}"
            set +x
            set -a
            . "${LUCEM_ENV_FILE}"
            set +a
            # Free the Playwright web server port from any orphaned/aborted build
            if command -v fuser >/dev/null 2>&1; then fuser -k 4179/tcp 2>/dev/null || true; fi
            E2E_PIDS=$(lsof -t -i:4179 2>/dev/null || true); if [ -n "$E2E_PIDS" ]; then kill -9 $E2E_PIDS 2>/dev/null || true; fi
            npm run test:e2e:install --if-present
            npm run test:e2e --if-present
          '''
        }
      }
      post {
        success {
          script {
            publishGithubStatus('Functional tests', 'success', 'Functional tests passed in Jenkins')
          }
        }
        failure {
          script {
            publishGithubStatus('Functional tests', 'failure', 'Functional tests failed in Jenkins')
          }
        }
        aborted {
          script {
            publishGithubStatus('Functional tests', 'error', 'Functional tests were aborted in Jenkins')
          }
        }
      }
    }
    stage('Screenshots') {
      when {
        expression { currentBuild.result == null || currentBuild.result == 'SUCCESS' }
      }
      steps {
        sh '''
          set -e
          export PATH="${NODE20_DIR}/bin:${PATH}"
          # Free the Playwright web server port from any orphaned/aborted build
          if command -v fuser >/dev/null 2>&1; then fuser -k 4179/tcp 2>/dev/null || true; fi
          E2E_PIDS=$(lsof -t -i:4179 2>/dev/null || true); if [ -n "$E2E_PIDS" ]; then kill -9 $E2E_PIDS 2>/dev/null || true; fi
          npm run test:e2e:install --if-present
          export LUCEM_SCREENSHOT_DIR="${WORKSPACE}/e2e-screenshots"
          npx playwright test e2e/screenshots.spec.js || true
        '''
      }
      post {
        always {
          archiveArtifacts artifacts: 'e2e-screenshots/**/*.png', allowEmptyArchive: true, fingerprint: false
        }
      }
    }
  }

  post {
    always {
      archiveArtifacts artifacts: 'build/**/*,dist/**/*', allowEmptyArchive: true, fingerprint: true
    }
  }
}
