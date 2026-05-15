import { useState, useEffect } from 'react'
import './App.css'
import PrintModal from './components/PrintModal'

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

function App() {
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

  const handleEnhance = async () => {
    if (!prompt.trim()) return
    setEnhancing(true)
    setError(null)
    try {
      const res = await fetch('http://localhost:3000/api/gemini-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, context, supportType, sector })
      })
      const data = await res.json()
      if (data.success) {
        setGeminiData(data)
        // Auto-update prompt with enhanced version for better results
        // setPrompt(data.enhancedPrompt) 
      } else {
        throw new Error(data.message || 'Gemini error')
      }
    } catch (err: any) {
      const errorMsg = err.message || 'Une erreur est survenue';
      if (errorMsg.includes('503') || errorMsg.includes('surchargé')) {
        setError("L'intelligence Gemini est très sollicitée en ce moment. Nous réessayons automatiquement... Veuillez patienter.");
      } else {
        setError(`Erreur d'Optimisation: ${errorMsg}`);
      }
    } finally {
      setEnhancing(false);
    }
  }

  const handleGenerate = async (finalPrompt: string) => {
    setLoading(true)
    setError(null)
    const endpoint = model === 'dalle' ? 'generate-image-dalle' : 
                     model === 'midjourney' ? 'generate-image-midjourney' : 
                     model === 'nanobanana' ? 'generate-image-nanobanana' :
                     'generate-image'
    
    try {
      const res = await fetch(`http://localhost:3000/api/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: finalPrompt })
      })
      const data = await res.json()
      if (res.ok) {
        setResults([data, ...results])
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
    if (geminiData?.enhancedPrompt) {
      setPrompt(geminiData.enhancedPrompt)
    }
  }

  return (
    <div className="container animate-fade">
      <header className="header">
        <div className="logo-section">
          <h1>Intelligence Artificielle & Création automatisée de supports imprimés</h1>
          <p className="subtitle">Générez des visuels haute qualité et transformez-les en supports marketing prêts à imprimer</p>
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
              {['stability', 'dalle', 'midjourney', 'nanobanana'].map((m) => (
                <button 
                  key={m}
                  className={`model-btn ${model === m ? 'active' : ''}`}
                  onClick={() => setModel(m)}
                >
                  {m === 'nanobanana' ? 'NANO 🍌' : m.toUpperCase()}
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
            {loading ? 'Création de la magie...' : '🎨 Générer l\'Image'}
          </button>

          {error && <div className="error-card">{error}</div>}
        </div>

        {/* Right Side: Gemini Insights & Results */}
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
    </div>
  )
}

export default App
