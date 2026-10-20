import { API_URL } from '../api'
import { useState } from 'react'
import './AuthPage.css'

interface User {
  id: number
  nom: string
  prenom: string
  email: string
  role: string
  plan: string
  credits: number
}

interface AuthPageProps {
  onLogin: (user: User, token: string) => void
}

export default function AuthPage({ onLogin }: AuthPageProps) {
  const [mode, setMode]         = useState<'login' | 'register'>('login')
  const [nom, setNom]           = useState('')
  const [prenom, setPrenom]     = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register'
    const body = mode === 'login'
      ? { email, password }
      : { nom, prenom, email, password }

    try {
      const res  = await fetch(`${API_URL}${endpoint}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body)
      })

      const contentType = res.headers.get('content-type') || ''
      if (!contentType.includes('application/json')) {
        throw new Error(`Le serveur backend n'est pas disponible (HTTP ${res.status}). Vérifiez que le serveur est démarré.`)
      }

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur inconnue')

      localStorage.setItem('evoprint_token', data.token)
      localStorage.setItem('evoprint_user',  JSON.stringify(data.user))
      onLogin(data.user, data.token)

    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-overlay">
      <div className="auth-card animate-slide-up">

        {/* Logo */}
        <div className="auth-logo">
          <h1>EvoPrint<span className="auth-star">*</span></h1>
          <p>Création intelligente de supports imprimés</p>
        </div>

        {/* Tabs */}
        <div className="auth-tabs">
          <button
            className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
            onClick={() => { setMode('login'); setError(null) }}
          >
            Connexion
          </button>
          <button
            className={`auth-tab ${mode === 'register' ? 'active' : ''}`}
            onClick={() => { setMode('register'); setError(null) }}
          >
            Inscription
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="auth-form">
          {mode === 'register' && (
            <div className="auth-row">
              <div className="auth-group">
                <label>Nom</label>
                <input
                  type="text" value={nom}
                  onChange={e => setNom(e.target.value)}
                  placeholder="Benali" required
                />
              </div>
              <div className="auth-group">
                <label>Prénom</label>
                <input
                  type="text" value={prenom}
                  onChange={e => setPrenom(e.target.value)}
                  placeholder="Omar" required
                />
              </div>
            </div>
          )}

          <div className="auth-group">
            <label>Email</label>
            <input
              type="email" value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="omar@gmail.com" required
            />
          </div>

          <div className="auth-group">
            <label>Mot de passe</label>
            <input
              type="password" value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" required minLength={6}
            />
          </div>

          {error && <div className="auth-error">⚠️ {error}</div>}

          <button type="submit" className="auth-submit" disabled={loading}>
            {loading
              ? 'Chargement...'
              : mode === 'login' ? '🔐 Se connecter' : '🚀 Créer mon compte'
            }
          </button>
        </form>

        {/* Footer */}
        <p className="auth-footer">
          {mode === 'login' ? "Pas encore de compte ? " : "Déjà un compte ? "}
          <span onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null) }}>
            {mode === 'login' ? "S'inscrire" : "Se connecter"}
          </span>
        </p>

      </div>
    </div>
  )
}
