// lucem-wallet CI pipeline.
// Runs on PR refs (PR-*) and mainline branches discovered by Jenkins multibranch config.
//
// Build / integration / E2E need the same variables as local `.env` (Koios keys, pool IDs, etc.).
// Provide them as Jenkins credential ID `lucem-wallet-dotenv` (Secret file). See jenkins-deployment INSTALL.md.

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
        sh '''
          set -e
          export PATH="${NODE20_DIR}/bin:${PATH}"
          node -v
          npm -v
          npm ci
        '''
      }
    }

    stage('Unit tests') {
      steps {
        sh '''
          set -e
          export PATH="${NODE20_DIR}/bin:${PATH}"
          npm test
        '''
      }
    }

    stage('Build') {
      steps {
        withCredentials([file(credentialsId: 'lucem-wallet-dotenv', variable: 'LUCEM_ENV_FILE')]) {
          sh '''
            set -e
            export PATH="${NODE20_DIR}/bin:${PATH}"
            # Jenkins runs sh with xtrace; disable before sourcing secrets.
            set +x
            set -a
            . "${LUCEM_ENV_FILE}"
            set +a
            npm run build
          '''
        }
      }
    }

    stage('Integration tests') {
      steps {
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
    }

    stage('Functional tests') {
      steps {
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
    }
  }

  post {
    always {
      archiveArtifacts artifacts: 'build/**/*,dist/**/*', allowEmptyArchive: true, fingerprint: true
    }
  }
}
