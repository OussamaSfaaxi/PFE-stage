pipeline {
    agent any

    environment {
        IMAGE_BACKEND  = "evoprint-backend"
        IMAGE_FRONTEND = "evoprint-frontend"
        COMPOSE_FILE   = "docker-compose.yml"
    }

    stages {

        // ── 1. Récupérer le code source ──────────────────────────
        stage('Checkout') {
            steps {
                echo '📥 Clonage du dépôt...'
                checkout scm
            }
        }

        // ── 2. Installer les dépendances et vérifier ─────────────
        stage('Install & Lint') {
            parallel {
                stage('Backend') {
                    steps {
                        dir('back') {
                            echo '📦 Installation backend...'
                            sh 'npm install'
                            echo '✅ Backend OK'
                        }
                    }
                }
                stage('Frontend') {
                    steps {
                        dir('frontend') {
                            echo '📦 Installation frontend...'
                            sh 'npm install'
                            echo '🔍 Vérification TypeScript...'
                            sh 'npx tsc --noEmit'
                            echo '✅ Frontend OK'
                        }
                    }
                }
            }
        }

        // ── 3. Build des images Docker ────────────────────────────
        stage('Docker Build') {
            steps {
                echo '🐳 Construction des images Docker...'
                sh 'docker compose build --no-cache'
                echo '✅ Images construites'
            }
        }

        // ── 4. Tests (smoke test sur le backend) ──────────────────
        stage('Test') {
            steps {
                echo '🧪 Démarrage des services pour les tests...'
                sh 'docker compose up -d db backend'
                sh 'sleep 10'

                echo '🔍 Test de santé du backend...'
                sh '''
                    curl -f http://localhost:3000/health \
                    && echo "✅ Backend répond correctement" \
                    || (echo "❌ Backend ne répond pas" && exit 1)
                '''
            }
            post {
                always {
                    sh 'docker compose stop backend db'
                }
            }
        }

        // ── 5. Déploiement ────────────────────────────────────────
        stage('Deploy') {
            when {
                branch 'main'
            }
            steps {
                echo '🚀 Déploiement en production...'
                sh 'docker compose down --remove-orphans'
                sh 'docker compose up -d'
                sh 'sleep 5'

                echo '🔍 Vérification post-déploiement...'
                sh 'curl -f http://localhost:3000/health'
                sh 'curl -f http://localhost:80'
                echo '✅ Déploiement réussi !'
            }
        }
    }

    post {
        success {
            echo '🎉 Pipeline terminé avec succès !'
        }
        failure {
            echo '❌ Pipeline échoué — vérifiez les logs.'
            sh 'docker compose logs --tail=50'
        }
        always {
            echo '🧹 Nettoyage...'
            sh 'docker image prune -f'
        }
    }
}
