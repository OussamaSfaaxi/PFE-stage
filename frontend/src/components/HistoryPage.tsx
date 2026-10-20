import { API_URL } from '../api'
import { useEffect, useState } from 'react'
import './HistoryPage.css'
import PrintModal from './PrintModal'

interface Generation {
  id: number
  prompt: string
  image_url: string
  model: string
  support_type: string
  sector: string
  created_at: string
}

interface Props {
  onBack: () => void
}

const MODEL_LABELS: Record<string, string> = {
  stability: 'Stability AI',
  dalle: 'DALL·E 3',
  midjourney: 'Midjourney',
  nanobanana: 'NANO 🍌',
}

export default function HistoryPage({ onBack }: Props) {
  const [history, setHistory] = useState<Generation[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedForPrint, setSelectedForPrint] = useState<Generation | null>(null)
  const [publishedIds, setPublishedIds] = useState<Set<number>>(new Set())

  const token = localStorage.getItem('evoprint_token')

  useEffect(() => {
    fetch(`${API_URL}/api/auth/history`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(data => {
        if (data.success) setHistory(data.history)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handlePublish = async (gen: Generation) => {
    const title = gen.prompt.slice(0, 80)
    const res = await fetch(`${API_URL}/api/gallery/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ generation_id: gen.id, title })
    })
    const data = await res.json()
    if (data.success) {
      setPublishedIds(prev => new Set([...prev, gen.id]))
      alert('✅ Publié dans la galerie !')
    } else {
      alert(data.error || 'Erreur lors de la publication')
    }
  }

  const handleDelete = async (id: number) => {
    await fetch(`${API_URL}/api/auth/history/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    })
    setHistory(prev => prev.filter(g => g.id !== id))
  }

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="history-page animate-fade">
      <div className="history-header">
        <button className="back-btn" onClick={onBack}>← Retour au Studio</button>
        <h2>Historique des Créations</h2>
        <span className="history-count">{history.length} génération{history.length !== 1 ? 's' : ''}</span>
      </div>

      {loading && <div className="history-loading">Chargement...</div>}

      {!loading && history.length === 0 && (
        <div className="history-empty">
          <p>Aucune création pour l'instant.</p>
          <p>Générez votre première image dans le Studio !</p>
        </div>
      )}

      <div className="history-grid">
        {history.map(gen => (
          <div key={gen.id} className="history-card glass-card">
            <div className="history-img-wrap">
              <img src={gen.image_url.startsWith('/') ? `${API_URL}${gen.image_url}` : gen.image_url} alt={gen.prompt} loading="lazy" />
              <div className="history-img-overlay">
                <button onClick={() => setSelectedForPrint(gen)} title="Imprimer">🖨️</button>
                <button
                  onClick={() => handlePublish(gen)}
                  title="Publier dans la galerie"
                  disabled={publishedIds.has(gen.id)}
                  className={publishedIds.has(gen.id) ? 'published-btn' : ''}
                >
                  {publishedIds.has(gen.id) ? '✅' : '🌐'}
                </button>
                <button onClick={() => handleDelete(gen.id)} title="Supprimer" className="delete-btn">🗑️</button>
              </div>
            </div>
            <div className="history-info">
              <p className="history-prompt" title={gen.prompt}>{gen.prompt}</p>
              <div className="history-meta">
                <span className="meta-badge">{MODEL_LABELS[gen.model] || gen.model}</span>
                <span className="meta-badge">{gen.support_type}</span>
                <span className="meta-badge">{gen.sector}</span>
              </div>
              <span className="history-date">{formatDate(gen.created_at)}</span>
            </div>
          </div>
        ))}
      </div>

      {selectedForPrint && (
        <PrintModal
          image={{ imageUrl: selectedForPrint.image_url.startsWith('/') ? `${API_URL}${selectedForPrint.image_url}` : selectedForPrint.image_url, prompt: selectedForPrint.prompt }}
          onClose={() => setSelectedForPrint(null)}
        />
      )}
    </div>
  )
}
