// lucem-wallet CI pipeline.
// Runs on PR refs (PR-*) and mainline branches discovered by Jenkins multibranch config.

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
        sh '''
          set -e
          export PATH="${NODE20_DIR}/bin:${PATH}"
          node -v
          npm -v
          npm ci
        '''
      }
    }

    stage('Test') {
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
        sh '''
          set -e
          export PATH="${NODE20_DIR}/bin:${PATH}"
          npm run build
        '''
      }
    }
  }

  post {
    always {
      archiveArtifacts artifacts: 'build/**/*,dist/**/*', allowEmptyArchive: true, fingerprint: true
    }
  }
}
