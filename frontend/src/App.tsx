import { API_URL } from './api'
import { useState } from 'react'
import './App.css'
import PrintModal from './components/PrintModal'
import AuthPage from './components/AuthPage'
import HistoryPage from './components/HistoryPage'
import PaymentModal from './components/PaymentModal'
import GalleryPage from './components/GalleryPage'
import AdminPage from './components/AdminPage'

interface User {
  id: number
  nom: string
  prenom: string
  email: string
  role: string
  plan: string
  credits: number
}

interface GeminiResult {
  success: boolean;
  detectedLanguage: string;
  enhancedPrompt: string;
  suggestions: string[];
  note: string;
}

interface ImageResult {
  success: boolean;
  imageUrl: string;
  prompt: string;
  message?: string;
}

// ─── Studio (main app, shown when logged in) ──────────────────────────────────
function Studio({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [view, setView] = useState<'studio' | 'history' | 'gallery' | 'admin'>('studio')
  const [prompt, setPrompt] = useState('')
  const [context, setContext] = useState('')
  const [model, setModel] = useState('stability')
  const [supportType, setSupportType] = useState('poster')
  const [sector, setSector] = useState('corporate')
  const [loading, setLoading] = useState(false)
  const [enhancing, setEnhancing] = useState(false)
  const [geminiData, setGeminiData] = useState<GeminiResult | null>(null)
  const [results, setResults] = useState<ImageResult[]>([])
  const [error, setError] = useState<string | null>(null)
  const [selectedImageForPrint, setSelectedImageForPrint] = useState<ImageResult | null>(null)
  const [paymentReason, setPaymentReason] = useState<'dalle_limit' | 'mj_nano_limit' | null>(null)
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null)

  const handleEnhance = async () => {
    if (!prompt.trim()) return
    setEnhancing(true)
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/gemini-context`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, context, supportType, sector })
      })
      const data = await res.json()
      if (data.success) {
        setGeminiData(data)
      } else {
        throw new Error(data.message || 'Gemini error')
      }
    } catch (err: any) {
      const errorMsg = err.message || 'Une erreur est survenue'
      if (errorMsg.includes('503') || errorMsg.includes('surchargé')) {
        setError("L'intelligence Gemini est très sollicitée en ce moment. Veuillez réessayer.")
      } else {
        setError(`Erreur d'Optimisation: ${errorMsg}`)
      }
    } finally {
      setEnhancing(false)
    }
  }

  const checkLimit = async (finalPrompt: string): Promise<boolean> => {
    if (model === 'stability') return true
    const token = localStorage.getItem('evoprint_token')
    const res = await fetch(`${API_URL}/api/auth/check-limit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ model })
    })
    const data = await res.json()
    if (!data.allowed) {
      setPendingPrompt(finalPrompt)
      setPaymentReason(data.reason)
      return false
    }
    return true
  }

  const selectModel = async (m: string) => {
    if (m === 'stability') { setModel(m); return }
    const token = localStorage.getItem('evoprint_token')
    const res = await fetch(`${API_URL}/api/auth/check-limit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ model: m })
    })
    const data = await res.json()
    if (!data.allowed) {
      setPaymentReason(data.reason)
      setPendingPrompt(null)
    }
    setModel(m)
  }


  const saveToHistory = async (imageUrl: string, finalPrompt: string) => {
    const token = localStorage.getItem('evoprint_token')
    if (!token) { console.error('saveToHistory: token manquant'); return }
    try {
      const res = await fetch(`${API_URL}/api/auth/history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ prompt: finalPrompt, image_url: imageUrl, model, support_type: supportType, sector })
      })
      const data = await res.json()
      if (!data.success) console.error('saveToHistory erreur:', data)
    } catch (err) {
      console.error('saveToHistory fetch error:', err)
    }
  }

  const handleGenerate = async (finalPrompt: string) => {
    const allowed = await checkLimit(finalPrompt)
    if (!allowed) return
    setLoading(true)
    setError(null)
    const endpoint = model === 'dalle'      ? 'generate-image-dalle' :
                     model === 'midjourney' ? 'generate-image-midjourney' :
                     model === 'nanobanana' ? 'generate-image-nanobanana' :
                     model === 'evoprint'   ? 'generate-image-evoprint' :
                     model === 'flyerai'    ? 'generate-image-flyerai' :
                     'generate-image'
    try {
      const res = await fetch(`${API_URL}/api/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: finalPrompt })
      })
      const data = await res.json()
      if (res.ok) {
        setResults([data, ...results])
        saveToHistory(data.imageUrl, finalPrompt)
      } else {
        setError(data.message || data.error || 'Generation failed')
      }
    } catch (err: any) {
      setError(`Network Error: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleApply = () => {
    if (geminiData?.enhancedPrompt) setPrompt(geminiData.enhancedPrompt)
  }

  if (view === 'history') return <HistoryPage onBack={() => setView('studio')} />
  if (view === 'admin') return (
    <div className="container animate-fade">
      <header className="header">
        <div className="logo-section">
          <h1>EvoPrint<span className="brand-star">*</span></h1>
        </div>
        <div className="user-info">
          <span className="user-badge">⚙️ Admin</span>
          <button className="logout-btn" onClick={onLogout}>🚪 Déconnexion</button>
        </div>
      </header>
      <AdminPage token={localStorage.getItem('evoprint_token') || ''} onBack={() => setView('studio')} />
    </div>
  )
  if (view === 'gallery') return (
    <div className="container animate-fade">
      <header className="header">
        <div className="logo-section">
          <h1>EvoPrint<span className="brand-star">*</span></h1>
        </div>
        <div className="user-info">
          <span className="user-badge">👤 {user.prenom} {user.nom}</span>
          <button className="history-nav-btn" onClick={() => setView('studio')}>🎨 Studio</button>
          <button className="history-nav-btn" onClick={() => setView('history')}>🕐 Historique</button>
          <button className="logout-btn" onClick={onLogout}>🚪 Déconnexion</button>
        </div>
      </header>
      <GalleryPage userId={user.id} token={localStorage.getItem('evoprint_token') || ''} />
    </div>
  )

  return (
    <div className="container animate-fade">
      <header className="header">
        <div className="logo-section">
          <h1>EvoPrint<span className="brand-star">*</span></h1>
          <p className="subtitle">Générez des visuels haute qualité grâce à l'IA et transformez-les en supports marketing prêts à imprimer</p>
        </div>
        <div className="user-info">
          <span className="user-badge">
            👤 {user.prenom} {user.nom}
          </span>
          <span className="credits-badge">
            ⭐ {user.credits} crédits
          </span>
          <button className="history-nav-btn" onClick={() => setView('history')}>
            🕐 Historique
          </button>
          <button className="history-nav-btn" onClick={() => setView('gallery')}>
            🖼 Galerie
          </button>
          {user.role === 'admin' && (
            <button className="history-nav-btn admin-nav-btn" onClick={() => setView('admin')}>
              ⚙️ Admin
            </button>
          )}
          <button className="logout-btn" onClick={onLogout}>
            🚪 Déconnexion
          </button>
        </div>
      </header>

      <main className="studio-grid">
        {/* Left Side: Input & Settings */}
        <div className="glass-card input-panel">
          <div className="input-group">
            <label>Votre Vision</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Décrivez l'image de vos rêves..."
              rows={4}
            />
          </div>

          <div className="input-group">
            <label>Contexte Optionnel</label>
            <input
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="Ex: Style Pixar, éclairage dramatique..."
            />
          </div>

          <div className="input-row">
            <div className="input-group">
              <label>Support Final</label>
              <select value={supportType} onChange={(e) => setSupportType(e.target.value)}>
                <option value="flyer">Flyer</option>
                <option value="business-card">Business Card</option>
                <option value="poster">Poster / Affiche</option>
              </select>
            </div>
            <div className="input-group">
              <label>Secteur</label>
              <select value={sector} onChange={(e) => setSector(e.target.value)}>
                <option value="corporate">Corporate</option>
                <option value="restaurant">Restaurant</option>
                <option value="artisan">Artisanat</option>
                <option value="event">Événementiel</option>
              </select>
            </div>
          </div>

          <div className="controls">
            <div className="model-selector">
              {[
                { id: 'stability',  label: 'STABILITY',    badge: '∞ Gratuit', paid: false },
                { id: 'evoprint',   label: '✦ EVOPRINT',   badge: '∞ Gratuit', paid: false },
                { id: 'flyerai',    label: '🖨 FLYER AI',   badge: '∞ Gratuit', paid: false },
                { id: 'dalle',      label: 'DALL·E',       badge: '💳 Payant',  paid: true  },
                { id: 'midjourney', label: 'MIDJOURNEY',   badge: '💳 Payant',  paid: true  },
                { id: 'nanobanana', label: 'NANO 🍌',      badge: '💳 Payant',  paid: true  },
              ].map((m) => (
                <button
                  key={m.id}
                  className={`model-btn ${model === m.id ? 'active' : ''} ${m.paid ? 'model-btn-paid' : ''} ${m.id === 'evoprint' ? 'model-btn-evoprint' : ''} ${m.id === 'flyerai' ? 'model-btn-flyerai' : ''}`}
                  onClick={() => selectModel(m.id)}
                >
                  <span>{m.label}</span>
                  <span className="model-badge">{m.badge}</span>
                </button>
              ))}

            </div>

            <button
              className={`enhance-btn ${enhancing ? 'loading' : ''}`}
              onClick={handleEnhance}
              disabled={!prompt || enhancing}
            >
              {enhancing ? 'Optimisation...' : '🪄 Optimiser'}
            </button>
          </div>

          <button
            className={`generate-btn ${loading ? 'loading' : ''}`}
            onClick={() => handleGenerate(prompt)}
            disabled={!prompt || loading}
          >
            {loading ? 'Création de la magie...' : "🎨 Générer l'Image"}
          </button>

          {error && <div className="error-card">{error}</div>}
        </div>

        {/* Right Side: Gemini Insights */}
        <div className="glass-card side-panel">
          {geminiData ? (
            <div className="gemini-insights animate-fade">
              <h3>🧠 Intelligence Gemini</h3>
              <div className="insight-item">
                <small>Langue détectée</small>
                <p>{geminiData.detectedLanguage}</p>
              </div>
              <div className="insight-item">
                <div className="insight-header">
                  <small>Prompt Optimisé (English)</small>
                  <div className="insight-actions">
                    <button
                      className="action-btn"
                      onClick={() => navigator.clipboard.writeText(geminiData.enhancedPrompt)}
                      title="Copier le prompt"
                    >
                      📋
                    </button>
                    <button
                      className="apply-btn"
                      onClick={handleApply}
                      title="Appliquer à Vision"
                    >
                      📥 Appliquer
                    </button>
                  </div>
                </div>
                <p className="enhanced-text">{geminiData.enhancedPrompt}</p>
              </div>
              <div className="suggestions">
                <small>💡 Suggestions</small>
                <ul>
                  {geminiData.suggestions.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <p>Utilisez l'optimiseur pour voir l'analyse de l'IA ici.</p>
            </div>
          )}
        </div>
      </main>

      <section className="gallery-section">
        <h2>Galerie de Créations</h2>
        <div className="gallery-grid">
          {results.map((res, i) => (
            <div key={i} className="glass-card result-card animate-fade">
              <img src={res.imageUrl} alt={res.prompt} loading="lazy" />
              <div className="card-info">
                <p title={res.prompt}>{res.prompt}</p>
                <button
                  className="card-print-btn"
                  onClick={() => setSelectedImageForPrint(res)}
                  title="Personnaliser et Imprimer"
                >
                  🖨️
                </button>
              </div>
            </div>
          ))}
          {results.length === 0 && (
            <div className="no-results">Vos créations apparaîtront ici.</div>
          )}
        </div>
      </section>

      {selectedImageForPrint && (
        <PrintModal
          image={selectedImageForPrint}
          onClose={() => setSelectedImageForPrint(null)}
        />
      )}

      {paymentReason && (
        <PaymentModal
          reason={paymentReason}
          onClose={() => { setPaymentReason(null); setPendingPrompt(null) }}
          onSuccess={() => {
            setPaymentReason(null)
            if (pendingPrompt) handleGenerate(pendingPrompt)
            setPendingPrompt(null)
          }}
        />
      )}
    </div>
  )
}

// ─── Root App (auth gate) ─────────────────────────────────────────────────────
function App() {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('evoprint_user')
    return saved ? JSON.parse(saved) : null
  })

  const handleLogin = (u: User, token: string) => {
    localStorage.setItem('evoprint_token', token)
    localStorage.setItem('evoprint_user', JSON.stringify(u))
    setUser(u)
  }

  const handleLogout = () => {
    localStorage.removeItem('evoprint_token')
    localStorage.removeItem('evoprint_user')
    setUser(null)
  }

  if (!user) return <AuthPage onLogin={handleLogin} />
  return <Studio user={user} onLogout={handleLogout} />
}

export default App
