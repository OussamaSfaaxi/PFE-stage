import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
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

const SECTOR_PRESETS: Record<string, { primary: string; secondary: string; label: string }> = {
  corporate:  { primary: '#1e40af', secondary: '#3b82f6', label: '💼 Corporate'   },
  restaurant: { primary: '#92400e', secondary: '#f59e0b', label: '🍽️ Restaurant'  },
  artisan:    { primary: '#065f46', secondary: '#10b981', label: '🛠️ Artisanat'   },
  event:      { primary: '#7c3aed', secondary: '#ec4899', label: '🎉 Événementiel' },
}

const FONTS = [
  { label: 'Moderne (Sans)', value: "'Segoe UI', 'Helvetica Neue', sans-serif" },
  { label: 'Élégant (Serif)', value: "Georgia, 'Times New Roman', serif" },
  { label: 'Géométrique',     value: "'Century Gothic', 'Trebuchet MS', sans-serif" },
  { label: 'Minimaliste',     value: "'Arial Narrow', Arial, sans-serif" },
]

export default function PrintModal({ image, onClose }: PrintModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('layout')

  // Layout
  const [supportType, setSupportType] = useState('poster')
  const [showGuides,  setShowGuides]  = useState(false)
  const [border,      setBorder]      = useState(true)

  // Style
  const [sector,         setSector]         = useState('corporate')
  const [primaryColor,   setPrimaryColor]   = useState('#1e40af')
  const [secondaryColor, setSecondaryColor] = useState('#3b82f6')
  const [logo,           setLogo]           = useState<string | null>(null)
  const [fontFamily,     setFontFamily]     = useState(FONTS[0].value)
  const [textAlign,      setTextAlign]      = useState<'left' | 'center' | 'right'>('left')
  const [bgStyle,        setBgStyle]        = useState<'white' | 'gradient' | 'dark'>('white')

  // Content
  const [title,       setTitle]       = useState("Chef-d'œuvre EvoPrint")
  const [tagline,     setTagline]     = useState('')
  const [description, setDescription] = useState(image.prompt)
  const [phone,       setPhone]       = useState('')
  const [email,       setEmail]       = useState('')
  const [website,     setWebsite]     = useState('')
  const [fontSize,    setFontSize]    = useState(16)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Map support type → CSS @page size (portrait)
  const PAGE_SIZES: Record<string, string> = {
    'poster':        '210mm 297mm',
    'flyer':         '148mm 210mm',
    'flyer-a6':      '105mm 148mm',
    'business-card': '85mm 55mm landscape',
  }

  const handlePrint = () => {
    // Inject correct @page size before printing, remove after
    const size  = PAGE_SIZES[supportType] ?? '210mm 297mm'
    const styleEl = document.createElement('style')
    styleEl.id = '__evoprint_print_page__'
    styleEl.textContent = `@page { size: ${size}; margin: 0; }`
    document.head.appendChild(styleEl)

    window.print()

    // Clean up (runs after the print dialog closes)
    const cleanup = () => {
      document.getElementById('__evoprint_print_page__')?.remove()
      window.removeEventListener('afterprint', cleanup)
    }
    window.addEventListener('afterprint', cleanup)
  }

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => setLogo(reader.result as string)
      reader.readAsDataURL(file)
    }
  }

  const applyPreset = (key: string) => {
    setSector(key)
    setPrimaryColor(SECTOR_PRESETS[key].primary)
    setSecondaryColor(SECTOR_PRESETS[key].secondary)
  }

  const hasContact = phone || email || website

  const previewStyle = {
    '--primary':   primaryColor,
    '--secondary': secondaryColor,
    '--font':      fontFamily,
    fontSize:      `${fontSize}px`,
    textAlign:     textAlign,
  } as React.CSSProperties

  const previewClasses = [
    'support-preview',
    `type-${supportType}`,
    `sector-${sector}`,
    `bg-${bgStyle}`,
    border       ? 'has-border'   : '',
    showGuides   ? 'show-guides'  : '',
  ].filter(Boolean).join(' ')

  const printClasses = [
    'print-only',
    `type-${supportType}`,
    `sector-${sector}`,
    `bg-${bgStyle}`,
    border ? 'has-border' : '',
  ].filter(Boolean).join(' ')

  /** Layout poster / flyer (vertical) */
  const StandardContent = () => (
    <>
      <div className="safe-area-guide" />
      <div className="bleed-area-guide" />

      {/* Image de fond plein format */}
      <div className="support-bg-image">
        <img src={image.imageUrl} alt="Main Visual" />
      </div>

      {/* Overlay texte en bas */}
      <div className="support-overlay">
        <div className="support-overlay-header">
          {logo && <img src={logo} className="support-logo" alt="Logo" />}
          <h1 className="support-title">{title}</h1>
          {tagline && <p className="support-tagline">{tagline}</p>}
        </div>

        <div className="support-content">
          <p className="support-description">{description}</p>
          {hasContact && (
            <div className="support-contact">
              {phone   && <span>📞 {phone}</span>}
              {email   && <span>✉️ {email}</span>}
              {website && <span>🌐 {website}</span>}
            </div>
          )}
        </div>

        <div className="support-footer">
          <span className="branding-line" />
          <span className="lumina-watermark">Design by EvoPrint*</span>
        </div>
      </div>
    </>
  )

  /** Layout carte de visite (horizontal compact 85×55mm) */
  const BusinessCardContent = () => (
    <div className="bc-root">
      {/* Bande colorée gauche avec image */}
      <div className="bc-left">
        <img src={image.imageUrl} alt="Visual" className="bc-photo" />
        <div className="bc-accent-bar" />
      </div>

      {/* Informations à droite */}
      <div className="bc-right">
        {logo && <img src={logo} className="bc-logo" alt="Logo" />}

        <div className="bc-text">
          <p className="bc-name">{title}</p>
          {tagline && <p className="bc-tagline">{tagline}</p>}
        </div>

        <div className="bc-divider" />

        <div className="bc-contact">
          {phone   && <span>📞 {phone}</span>}
          {email   && <span>✉️ {email}</span>}
          {website && <span>🌐 {website}</span>}
          {!phone && !email && !website && (
            <span className="bc-placeholder">Ajoutez vos coordonnées →  onglet Contenu</span>
          )}
        </div>

        <p className="bc-watermark">EvoPrint*</p>
      </div>
    </div>
  )

  /** Sélectionne le bon layout selon le support */
  const SupportContent = () =>
    supportType === 'business-card'
      ? <BusinessCardContent />
      : <StandardContent />

  return (
    <div className="modal-overlay animate-fade">
      {/* ── Modal UI (hidden on print) ── */}
      <div className="modal-content glass-card no-print animate-slide-up">

        {/* Header */}
        <div className="modal-header">
          <div className="header-title">
            <h2>Personnalisation & Impression</h2>
            <p>Configurez votre support marketing professionnel</p>
          </div>
          <button className="close-btn" onClick={onClose} title="Fermer">×</button>
        </div>

        {/* Tabs */}
        <div className="modal-tabs">
          {(['layout', 'style', 'content'] as TabType[]).map(t => (
            <button
              key={t}
              className={`tab-btn ${activeTab === t ? 'active' : ''}`}
              onClick={() => setActiveTab(t)}
            >
              {t === 'layout'  ? '📏 Format & Layout' :
               t === 'style'   ? '🎨 Style & Branding' :
                                 '📝 Texte & Contenu'}
            </button>
          ))}
        </div>

        <div className="modal-body">
          {/* ── Settings Panel ── */}
          <div className="settings-panel">

            {/* TAB: LAYOUT */}
            {activeTab === 'layout' && (
              <div className="tab-content animate-fade">
                <div className="settings-section">
                  <label className="section-label">Support d'impression</label>
                  <div className="support-grid">
                    {[
                      { id: 'poster',        label: 'Poster A4',    icon: '📄' },
                      { id: 'flyer',         label: 'Flyer A5',     icon: '📜' },
                      { id: 'flyer-a6',      label: 'Flyer A6',     icon: '🔖' },
                      { id: 'business-card', label: 'Carte Visite', icon: '📇' },
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
                        <span className="slider" />
                      </label>
                    </div>
                    <div className="toggle-item">
                      <span>Bordure décorative</span>
                      <label className="switch">
                        <input type="checkbox" checked={border} onChange={e => setBorder(e.target.checked)} />
                        <span className="slider" />
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: STYLE */}
            {activeTab === 'style' && (
              <div className="tab-content animate-fade">

                {/* Sector presets */}
                <div className="settings-section">
                  <label className="section-label">Préset Secteur</label>
                  <div className="preset-grid">
                    {Object.entries(SECTOR_PRESETS).map(([key, p]) => (
                      <button
                        key={key}
                        className={`preset-btn ${sector === key ? 'active' : ''}`}
                        style={{ '--p': p.primary, '--s': p.secondary } as React.CSSProperties}
                        onClick={() => applyPreset(key)}
                      >
                        <span className="preset-swatch">
                          <span style={{ background: p.primary }} />
                          <span style={{ background: p.secondary }} />
                        </span>
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom colors */}
                <div className="settings-section">
                  <label className="section-label">Couleurs Personnalisées</label>
                  <div className="color-grid">
                    <div className="color-input">
                      <label>Primaire</label>
                      <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} />
                    </div>
                    <div className="color-input">
                      <label>Secondaire</label>
                      <input type="color" value={secondaryColor} onChange={e => setSecondaryColor(e.target.value)} />
                    </div>
                  </div>
                </div>

                {/* Background style */}
                <div className="settings-section">
                  <label className="section-label">Fond du Support</label>
                  <div className="bg-selector">
                    {(['white', 'gradient', 'dark'] as const).map(b => (
                      <button
                        key={b}
                        className={`bg-btn bg-btn-${b} ${bgStyle === b ? 'active' : ''}`}
                        onClick={() => setBgStyle(b)}
                      >
                        {b === 'white'    ? '⬜ Blanc'    :
                         b === 'gradient' ? '🎨 Dégradé' :
                                           '⬛ Sombre'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Font */}
                <div className="settings-section">
                  <label className="section-label">Police de caractère</label>
                  <div className="font-selector">
                    {FONTS.map(f => (
                      <button
                        key={f.value}
                        className={`font-btn ${fontFamily === f.value ? 'active' : ''}`}
                        style={{ fontFamily: f.value }}
                        onClick={() => setFontFamily(f.value)}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Text align */}
                <div className="settings-section">
                  <label className="section-label">Alignement du texte</label>
                  <div className="align-selector">
                    {(['left', 'center', 'right'] as const).map(a => (
                      <button
                        key={a}
                        className={`align-btn ${textAlign === a ? 'active' : ''}`}
                        onClick={() => setTextAlign(a)}
                      >
                        {a === 'left' ? '⬅ Gauche' : a === 'center' ? '↔ Centre' : '➡ Droite'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Logo */}
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

            {/* TAB: CONTENT */}
            {activeTab === 'content' && (
              <div className="tab-content animate-fade">
                <div className="settings-section">
                  <label className="section-label">Textes Principaux</label>
                  <div className="input-stack">
                    <div className="input-group">
                      <label>Titre principal</label>
                      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex : Boulangerie Artisanale" />
                    </div>
                    <div className="input-group">
                      <label>Accroche / Slogan</label>
                      <input value={tagline} onChange={e => setTagline(e.target.value)} placeholder="Ex : Le goût authentique depuis 1985" />
                    </div>
                    <div className="input-group">
                      <label>Contenu / Description</label>
                      <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4} placeholder="Décrivez votre offre, événement, service..." />
                    </div>
                  </div>
                </div>

                <div className="settings-section">
                  <label className="section-label">Informations de Contact</label>
                  <div className="input-stack">
                    <div className="input-group">
                      <label>📞 Téléphone</label>
                      <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+33 6 00 00 00 00" />
                    </div>
                    <div className="input-group">
                      <label>✉️ Email</label>
                      <input value={email} onChange={e => setEmail(e.target.value)} placeholder="contact@example.com" />
                    </div>
                    <div className="input-group">
                      <label>🌐 Site Web</label>
                      <input value={website} onChange={e => setWebsite(e.target.value)} placeholder="www.example.com" />
                    </div>
                  </div>
                </div>

                <div className="settings-section">
                  <label className="section-label">Taille du texte — {fontSize}px</label>
                  <div className="range-input">
                    <span className="range-label-min">10</span>
                    <input
                      type="range" min="10" max="32" value={fontSize}
                      onChange={e => setFontSize(parseInt(e.target.value))}
                    />
                    <span className="range-label-max">32</span>
                  </div>
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="settings-footer">
              <button className="print-action-btn pulse" onClick={handlePrint}>
                🖨️ Imprimer / Exporter PDF
              </button>
            </div>
          </div>

          {/* ── Preview Panel ── */}
          <div className="preview-panel">
            <div className="preview-header">
              <span>Aperçu de production</span>
              <div className="preview-badges">
                <span className="format-badge">{supportType.toUpperCase()}</span>
                <span className="format-badge bg-badge">{bgStyle}</span>
              </div>
            </div>
            <div className="preview-scroll-container">
              <div className={previewClasses} style={previewStyle}>
                <SupportContent />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Print-only layout — via portal directly in <body> ── */}
      {createPortal(
        <div
          id="evoprint-print-portal"
          className={printClasses}
          style={previewStyle}
        >
          <SupportContent />
        </div>,
        document.body
      )}
    </div>
  )
}
