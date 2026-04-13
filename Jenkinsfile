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
  }

  stages {
    stage('Install') {
      steps {
        sh '''
          set -e
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
          npm test
        '''
      }
    }

    stage('Build') {
      steps {
        sh '''
          set -e
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
