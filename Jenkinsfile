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
//
// To publish those statuses, add Jenkins credential ID `github-status-token` as a secret text
// token with commit status write access for this repository. Missing status credentials do not
// fail the build, but protected PRs will wait for the required Jenkins statuses.

def requiredGithubStatusStages() {
  return ['Build', 'Unit tests', 'Integration tests', 'Functional tests']
}

def githubNotifyStatus(String state) {
  return [
    pending: 'PENDING',
    success: 'SUCCESS',
    failure: 'FAILURE',
    error: 'ERROR',
  ][state] ?: state.toUpperCase()
}

def publishGithubStatus(String stageName, String state, String description) {
  def repo = env.GITHUB_REPOSITORY ?: 'Fuma419/lucem-wallet'
  def sha = env.GIT_COMMIT ?: env.CHANGE_HEAD
  if (!sha) {
    echo "Skipping GitHub status for ${stageName}: no commit SHA is available."
    return
  }

  def targetUrl = env.RUN_DISPLAY_URL ?: env.BUILD_URL ?: ''
  try {
    githubNotify(
      context: "Jenkins / ${stageName}",
      status: githubNotifyStatus(state),
      description: description.take(140),
      targetUrl: targetUrl
    )
    return
  } catch (notifyErr) {
    echo "Jenkins githubNotify unavailable for ${stageName}: ${notifyErr.getMessage()}"
  }

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
import json
import os

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
    echo "Skipping GitHub status for ${stageName}: ${err.getMessage()}"
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
    timeout(time: 60, unit: 'MINUTES')
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
    }

    stage('Install') {
      steps {
        checkout scm
        script {
          publishPendingGithubStatuses()
        }
        sh '''
          set -e
          export PATH="${NODE20_DIR}/bin:${PATH}"
          node -v
          npm -v
          npm ci
        '''
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

    stage('Integration tests') {
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
            npm run test:integration --if-present
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
  }

  post {
    always {
      archiveArtifacts artifacts: 'build/**/*,dist/**/*', allowEmptyArchive: true, fingerprint: true
    }
  }
}
