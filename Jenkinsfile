// ============================================================
// AJS Car Care — Jenkins CI/CD Pipeline
//
// Flow: checkout -> Sonar scan -> quality gate -> install deps
//       -> Trivy filesystem scan -> docker build & push
//       -> Trivy image scan -> deploy locally on the Docker host
//
// This version deploys directly on the machine Jenkins/the agent runs
// on (no SSH to a separate EC2 box) — i.e. Jenkins has access to the
// Docker daemon on its own host and just runs the container there.
//
// Before running this pipeline, configure in Jenkins:
//   - Tools:        NodeJS installation named 'node20', JDK named 'jdk'
//   - Credentials:  'github-token'   (GitHub PAT, for checkout)
//                   'docker'         (Docker Hub username/password)
//                   'Sonar-token'    (SonarQube auth token)
//   - Plugins:      SonarQube Scanner, Docker Pipeline, Email Extension
//   - System config: SonarQube server named 'SonarQube' (Manage Jenkins -> System)
//   - The Jenkins user (or agent container) must be able to run `docker`
//     commands — usually: sudo usermod -aG docker jenkins, then restart Jenkins.
//     If Jenkins itself runs inside a Docker container, mount the host's
//     docker socket into it: -v /var/run/docker.sock:/var/run/docker.sock
//
// Replace the placeholders marked <<< >>> below with your own values.
// ============================================================

pipeline {
    agent any

    tools {
        jdk 'jdk'
        nodejs 'node20'
    }

    environment {
        SCANNER_HOME = tool 'sonar-scanner'
        DOCKER_IMAGE = '<<<yourdockerhubuser>>>/ajs-car-care'   // e.g. aseemakram19/ajs-car-care

        // Paths ON THIS DOCKER HOST (not remote) — create these once manually
        // before the first run: mkdir -p /opt/ajs-car-care/data
        //                        nano /opt/ajs-car-care/.env
        ENV_FILE_PATH  = '/opt/ajs-car-care/.env'
        DATA_PATH      = '/opt/ajs-car-care/data'
        CONTAINER_NAME = 'ajs-car-care'
        APP_PORT       = '4000'
    }

    stages {

        stage('Clean workspace') {
            steps {
                cleanWs()
            }
        }

        stage('Checkout from Git') {
            steps {
                git branch: 'main',
                    credentialsId: 'github-token',
                    url: 'https://github.com/<<<yourusername>>>/ajs-car-care.git'
            }
        }

        stage('Sonarqube Analysis') {
            steps {
                dir('backend') {
                    withSonarQubeEnv('SonarQube') {
                        sh '''
                            $SCANNER_HOME/bin/sonar-scanner \
                            -Dsonar.projectName=ajs-car-care \
                            -Dsonar.projectKey=ajs-car-care \
                            -Dsonar.sources=. \
                            -Dsonar.exclusions=node_modules/**,data/**
                        '''
                    }
                }
            }
        }

        stage('Quality Gate') {
            steps {
                script {
                    waitForQualityGate abortPipeline: false, credentialsId: 'Sonar-token'
                }
            }
        }

        stage('Install Dependencies') {
            steps {
                dir('backend') {
                    sh 'npm install'
                }
            }
        }

        stage('TRIVY FS SCAN') {
            steps {
                dir('backend') {
                    sh 'trivy fs . > trivyfs.txt'
                }
            }
        }

        stage('Docker Build & Push') {
            steps {
                script {
                    withDockerRegistry(credentialsId: 'docker', toolName: 'docker') {
                        dir('backend') {
                            sh "docker build -t ${DOCKER_IMAGE}:${BUILD_NUMBER} -t ${DOCKER_IMAGE}:latest ."
                            sh "docker push ${DOCKER_IMAGE}:${BUILD_NUMBER}"
                            sh "docker push ${DOCKER_IMAGE}:latest"
                        }
                    }
                }
            }
        }

        stage('TRIVY IMAGE SCAN') {
            steps {
                dir('backend') {
                    sh "trivy image ${DOCKER_IMAGE}:latest > trivyimage.txt"
                }
            }
        }

        // ---- Deploy locally on this Docker host (no SSH / no EC2) ----
        stage('Deploy on Docker Host') {
            steps {
                sh '''
                    echo "Ensuring data + env paths exist..."
                    mkdir -p "$DATA_PATH"

                    if [ ! -f "$ENV_FILE_PATH" ]; then
                        echo "ERROR: $ENV_FILE_PATH not found. Create it once manually with your real JWT_SECRET / Razorpay keys before running this pipeline."
                        exit 1
                    fi

                    echo "Stopping old container (if running)..."
                    docker stop "$CONTAINER_NAME" || true
                    docker rm "$CONTAINER_NAME" || true

                    echo "Starting new container..."
                    docker run -d --name "$CONTAINER_NAME" \
                        --restart unless-stopped \
                        -p ${APP_PORT}:4000 \
                        --env-file "$ENV_FILE_PATH" \
                        -v "$DATA_PATH":/app/data \
                        ${DOCKER_IMAGE}:latest

                    echo "Cleaning up old images..."
                    docker image prune -f

                    echo "Deployment complete. Recent logs:"
                    sleep 3
                    docker logs --tail 20 "$CONTAINER_NAME"
                '''
            }
        }
    }

    post {
        always {
            script {
                def buildStatus = currentBuild.currentResult
                def buildUser = currentBuild.getBuildCauses('hudson.model.Cause$UserIdCause')[0]?.userId ?: 'Github User'

                emailext(
                    subject: "Pipeline ${buildStatus}: ${env.JOB_NAME} #${env.BUILD_NUMBER}",
                    body: """
                        <p>AJS Car Care CI/CD pipeline status.</p>
                        <p>Project: ${env.JOB_NAME}</p>
                        <p>Build Number: ${env.BUILD_NUMBER}</p>
                        <p>Build Status: ${buildStatus}</p>
                        <p>Started by: ${buildUser}</p>
                        <p>Build URL: <a href="${env.BUILD_URL}">${env.BUILD_URL}</a></p>
                    """,
                    to: '<<<your-email@example.com>>>',
                    from: '<<<your-email@example.com>>>',
                    replyTo: '<<<your-email@example.com>>>',
                    mimeType: 'text/html',
                    attachmentsPattern: 'backend/trivyfs.txt,backend/trivyimage.txt'
                )
            }
        }
    }
}
