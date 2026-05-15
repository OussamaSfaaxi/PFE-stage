import { useState, useRef } from 'react'
import './PrintModal.css'

interface ImageResult {
  imageUrl: string
  prompt: string
}

interface PrintModalProps {
  image: ImageResult
  onClose: () => void
}

type TabType = 'layout' | 'style' | 'content'

export default function PrintModal({ image, onClose }: PrintModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('layout')
  
  // Business Fields
  const [supportType, setSupportType] = useState('poster')
  const [sector, setSector] = useState('corporate')
  const [showGuides, setShowGuides] = useState(false)
  const [primaryColor, setPrimaryColor] = useState('#6366f1')
  const [secondaryColor, setSecondaryColor] = useState('#a855f7')
  const [logo, setLogo] = useState<string | null>(null)
  
  // Basic Fields
  const [title, setTitle] = useState('Chef-d\'œuvre Lumina')
  const [description, setDescription] = useState(image.prompt)
  const [fontSize, setFontSize] = useState(16)
  const [border, setBorder] = useState(true)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const handlePrint = () => {
    window.print()
  }

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => setLogo(reader.result as string)
      reader.readAsDataURL(file)
    }
  }

  return (
    <div className="modal-overlay animate-fade">
      <div className="modal-content glass-card no-print animate-slide-up">
        <div className="modal-header">
          <div className="header-title">
            <h2>Personnalisation & Impression</h2>
            <p>Configurez votre support marketing professionnel</p>
          </div>
          <button className="close-btn" onClick={onClose} title="Fermer">×</button>
        </div>

        <div className="modal-tabs">
          <button 
            className={`tab-btn ${activeTab === 'layout' ? 'active' : ''}`}
            onClick={() => setActiveTab('layout')}
          >
            📏 Format & Layout
          </button>
          <button 
            className={`tab-btn ${activeTab === 'style' ? 'active' : ''}`}
            onClick={() => setActiveTab('style')}
          >
            🎨 Style & Branding
          </button>
          <button 
            className={`tab-btn ${activeTab === 'content' ? 'active' : ''}`}
            onClick={() => setActiveTab('content')}
          >
            📝 Texte & Contenu
          </button>
        </div>

        <div className="modal-body">
          <div className="settings-panel">
            {activeTab === 'layout' && (
              <div className="tab-content animate-fade">
                <div className="settings-section">
                  <label className="section-label">Support d'impression</label>
                  <div className="support-grid">
                    {[
                      { id: 'poster', label: 'Poster A4', icon: '📄' },
                      { id: 'flyer', label: 'Flyer A5', icon: '📜' },
                      { id: 'flyer-a6', label: 'Flyer A6', icon: '🔖' },
                      { id: 'business-card', label: 'Carte Visite', icon: '📇' }
                    ].map(s => (
                      <button 
                        key={s.id}
                        className={`support-card ${supportType === s.id ? 'active' : ''}`}
                        onClick={() => setSupportType(s.id)}
                      >
                        <span className="icon">{s.icon}</span>
                        <span className="label">{s.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="settings-section">
                  <label className="section-label">Options d'affichage</label>
                  <div className="toggle-group">
                    <div className="toggle-item">
                      <span>Afficher les guides (Fonds perdus)</span>
                      <label className="switch">
                        <input type="checkbox" checked={showGuides} onChange={e => setShowGuides(e.target.checked)} />
                        <span className="slider"></span>
                      </label>
                    </div>
                    <div className="toggle-item">
                      <span>Bordure décorative</span>
                      <label className="switch">
                        <input type="checkbox" checked={border} onChange={e => setBorder(e.target.checked)} />
                        <span className="slider"></span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'style' && (
              <div className="tab-content animate-fade">
                <div className="settings-section">
                  <label className="section-label">Secteur d'activité</label>
                  <select value={sector} onChange={(e) => setSector(e.target.value)} className="modern-select">
                    <option value="corporate">💼 Corporate / Business</option>
                    <option value="restaurant">🍽️ Restaurant / Gastronomie</option>
                    <option value="artisan">🛠️ Artisanat / Créatif</option>
                    <option value="event">🎉 Événementiel / Loisirs</option>
                  </select>
                </div>

                <div className="settings-section">
                  <label className="section-label">Identité Visuelle</label>
                  <div className="color-grid">
                    <div className="color-input">
                      <label>Primaire</label>
                      <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} />
                    </div>
                    <div className="color-input">
                      <label>Secondaire</label>
                      <input type="color" value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} />
                    </div>
                  </div>
                </div>

                <div className="settings-section">
                  <label className="section-label">Logo Client</label>
                  <div className="logo-upload-area">
                    {logo ? (
                      <div className="logo-preview-box">
                        <img src={logo} alt="Logo" />
                        <button onClick={() => setLogo(null)} className="remove-btn">Effacer</button>
                      </div>
                    ) : (
                      <button onClick={() => fileInputRef.current?.click()} className="upload-placeholder">
                        <span>📤 Cliquer pour uploader un logo</span>
                      </button>
                    )}
                    <input type="file" ref={fileInputRef} hidden accept="image/*" onChange={handleLogoUpload} />
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'content' && (
              <div className="tab-content animate-fade">
                <div className="settings-section">
                  <label className="section-label">Textes</label>
                  <div className="input-stack">
                    <div className="input-group">
                      <label>Titre principal</label>
                      <input value={title} onChange={(e) => setTitle(e.target.value)} />
                    </div>
                    <div className="input-group">
                      <label>Contenu / Informations</label>
                      <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} />
                    </div>
                  </div>
                </div>
                
                <div className="settings-section">
                  <label className="section-label">Taille du texte</label>
                  <div className="range-input">
                    <input type="range" min="10" max="32" value={fontSize} onChange={(e) => setFontSize(parseInt(e.target.value))} />
                    <span>{fontSize}px</span>
                  </div>
                </div>
              </div>
            )}

            <div className="settings-footer">
              <button className="print-action-btn pulse" onClick={handlePrint}>
                🖨️ Prêt à imprimer
              </button>
            </div>
          </div>

          <div className="preview-panel">
            <div className="preview-header">
              <span>Aperçu de production</span>
              <span className="format-badge">{supportType.toUpperCase()}</span>
            </div>
            <div className="preview-scroll-container">
              <div className={`support-preview type-${supportType} sector-${sector} ${border ? 'has-border' : ''} ${showGuides ? 'show-guides' : ''}`}
                style={{ 
                  '--primary': primaryColor, 
                  '--secondary': secondaryColor,
                  fontSize: `${fontSize}px` 
                } as any}
              >
                <div className="safe-area-guide"></div>
                <div className="bleed-area-guide"></div>
                
                <div className="support-header">
                  {logo && <img src={logo} className="support-logo" alt="Logo" />}
                  <h1 className="support-title">{title}</h1>
                </div>
                
                <div className="support-main-image">
                  <img src={image.imageUrl} alt="Main Visual" />
                </div>

                <div className="support-content">
                  <p className="support-description">{description}</p>
                </div>

                <div className="support-footer">
                  <span className="branding-line"></span>
                  <span className="lumina-watermark">Design by Lumina Studio</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Actual Print Layout */}
      <div 
        className={`print-only type-${supportType} sector-${sector} ${border ? 'has-border' : ''}`}
        style={{ 
          '--primary': primaryColor, 
          '--secondary': secondaryColor,
          fontSize: `${fontSize}px` 
        } as any}
      >
        <div className="support-header">
          {logo && <img src={logo} className="support-logo" alt="Logo" />}
          <h1 className="support-title">{title}</h1>
        </div>
        
        <div className="support-main-image">
          <img src={image.imageUrl} alt="Main Visual" />
        </div>

        <div className="support-content">
          <p className="support-description">{description}</p>
        </div>

        <div className="support-footer">
          <span className="branding-line"></span>
          <span className="lumina-watermark">Lumina Studio - {new Date().toLocaleDateString()}</span>
        </div>
      </div>
    </div>
  )
}
