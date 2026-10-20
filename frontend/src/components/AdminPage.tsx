import { API_URL } from '../api'
import { useEffect, useState } from 'react'
import './AdminPage.css'

interface Stats {
  total_users: number
  total_generations: number
  total_posts: number
  total_likes: number
  per_day: { day: string; count: number }[]
  models: { model: string; count: number }[]
  sectors: { sector: string; count: number }[]
}

interface UserRow {
  id: number
  nom: string
  prenom: string
  email: string
  role: string
  plan: string
  credits: number
  is_blocked: number
  created_at: string
  generation_count: number
}

interface Props {
  token: string
  onBack: () => void
}

const MODEL_LABELS: Record<string, string> = {
  stability: 'Stability AI', dalle: 'DALL·E 3',
  midjourney: 'Midjourney', nanobanana: 'NANO 🍌', evoprint: '✦ EvoPrint'
}

const SECTOR_LABELS: Record<string, string> = {
  corporate: 'Corporate', restaurant: 'Restaurant',
  artisan: 'Artisanat', event: 'Événementiel'
}

function BarChart({ data, labelKey, valueKey, color }: {
  data: any[]; labelKey: string; valueKey: string; color: string
}) {
  if (!data.length) return <p className="no-data">Aucune donnée</p>
  const max = Math.max(...data.map(d => d[valueKey]), 1)
  return (
    <div className="bar-chart">
      {data.map((d, i) => (
        <div key={i} className="bar-row">
          <span className="bar-label">{MODEL_LABELS[d[labelKey]] || SECTOR_LABELS[d[labelKey]] || d[labelKey]}</span>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${(d[valueKey] / max) * 100}%`, background: color }} />
          </div>
          <span className="bar-value">{d[valueKey]}</span>
        </div>
      ))}
    </div>
  )
}

function DayChart({ data }: { data: { day: string; count: number }[] }) {
  if (!data.length) return <p className="no-data">Aucune génération cette semaine</p>
  const max = Math.max(...data.map(d => d.count), 1)
  return (
    <div className="day-chart">
      {data.map((d, i) => (
        <div key={i} className="day-col">
          <span className="day-count">{d.count}</span>
          <div className="day-bar-wrap">
            <div className="day-bar" style={{ height: `${(d.count / max) * 100}%` }} />
          </div>
          <span className="day-label">{new Date(d.day).toLocaleDateString('fr', { weekday: 'short', day: 'numeric' })}</span>
        </div>
      ))}
    </div>
  )
}

export default function AdminPage({ token, onBack }: Props) {
  const [stats, setStats]   = useState<Stats | null>(null)
  const [users, setUsers]   = useState<UserRow[]>([])
  const [tab, setTab]       = useState<'stats' | 'users'>('stats')
  const [loading, setLoading] = useState(true)
  const [editCredits, setEditCredits] = useState<{ id: number; val: string } | null>(null)

  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [sRes, uRes] = await Promise.all([
        fetch(`${API_URL}/api/admin/stats`, { headers }),
        fetch(`${API_URL}/api/admin/users`, { headers })
      ])
      const sData = await sRes.json()
      const uData = await uRes.json()
      if (sData.success) setStats(sData.stats)
      if (uData.success) setUsers(uData.users)
    } catch (err) {
      console.error('Admin fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  const toggleBlock = async (user: UserRow) => {
    const newBlocked = !user.is_blocked
    await fetch(`${API_URL}/api/admin/users/${user.id}/block`, {
      method: 'PUT', headers,
      body: JSON.stringify({ blocked: newBlocked })
    })
    setUsers(prev => prev.map(u => u.id === user.id ? { ...u, is_blocked: newBlocked ? 1 : 0 } : u))
  }

  const saveCredits = async (id: number, credits: string) => {
    await fetch(`${API_URL}/api/admin/users/${id}/credits`, {
      method: 'PUT', headers,
      body: JSON.stringify({ credits: parseInt(credits) || 0 })
    })
    setUsers(prev => prev.map(u => u.id === id ? { ...u, credits: parseInt(credits) || 0 } : u))
    setEditCredits(null)
  }

  const deleteUser = async (id: number) => {
    if (!confirm('Supprimer cet utilisateur définitivement ?')) return
    await fetch(`${API_URL}/api/admin/users/${id}`, { method: 'DELETE', headers })
    setUsers(prev => prev.filter(u => u.id !== id))
  }

  return (
    <div className="admin-page">
      <div className="admin-header">
        <div>
          <h2>⚙️ Tableau de bord Admin</h2>
          <p>Gestion de la plateforme EvoPrint</p>
        </div>
        <button className="back-btn" onClick={onBack}>← Retour</button>
      </div>

      <div className="admin-tabs">
        <button className={tab === 'stats' ? 'active' : ''} onClick={() => setTab('stats')}>📊 Statistiques</button>
        <button className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}>👥 Utilisateurs ({users.length})</button>
      </div>

      {loading ? (
        <div className="admin-loading">Chargement...</div>
      ) : tab === 'stats' && stats ? (
        <div className="stats-view">
          <div className="kpi-grid">
            <div className="kpi-card">
              <span className="kpi-icon">👥</span>
              <span className="kpi-value">{stats.total_users}</span>
              <span className="kpi-label">Utilisateurs</span>
            </div>
            <div className="kpi-card">
              <span className="kpi-icon">🎨</span>
              <span className="kpi-value">{stats.total_generations}</span>
              <span className="kpi-label">Générations</span>
            </div>
            <div className="kpi-card">
              <span className="kpi-icon">🖼</span>
              <span className="kpi-value">{stats.total_posts}</span>
              <span className="kpi-label">Posts Galerie</span>
            </div>
            <div className="kpi-card">
              <span className="kpi-icon">❤️</span>
              <span className="kpi-value">{stats.total_likes}</span>
              <span className="kpi-label">Likes</span>
            </div>
          </div>

          <div className="charts-grid">
            <div className="chart-card">
              <h3>📅 Générations — 7 derniers jours</h3>
              <DayChart data={stats.per_day} />
            </div>
            <div className="chart-card">
              <h3>🤖 Modèles IA utilisés</h3>
              <BarChart data={stats.models} labelKey="model" valueKey="count" color="linear-gradient(90deg,#6366f1,#8b5cf6)" />
            </div>
            <div className="chart-card">
              <h3>🏢 Secteurs les plus actifs</h3>
              <BarChart data={stats.sectors} labelKey="sector" valueKey="count" color="linear-gradient(90deg,#06b6d4,#3b82f6)" />
            </div>
          </div>
        </div>
      ) : tab === 'users' ? (
        <div className="users-view">
          <table className="users-table">
            <thead>
              <tr>
                <th>Utilisateur</th>
                <th>Email</th>
                <th>Rôle</th>
                <th>Crédits</th>
                <th>Générations</th>
                <th>Inscrit le</th>
                <th>Statut</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className={u.is_blocked ? 'blocked-row' : ''}>
                  <td><strong>{u.prenom} {u.nom}</strong></td>
                  <td>{u.email}</td>
                  <td><span className={`role-badge ${u.role}`}>{u.role}</span></td>
                  <td>
                    {editCredits?.id === u.id ? (
                      <div className="credits-edit">
                        <input
                          type="number"
                          value={editCredits.val}
                          onChange={e => setEditCredits({ id: u.id, val: e.target.value })}
                          onKeyDown={e => e.key === 'Enter' && saveCredits(u.id, editCredits.val)}
                        />
                        <button onClick={() => saveCredits(u.id, editCredits.val)}>✓</button>
                        <button onClick={() => setEditCredits(null)}>✕</button>
                      </div>
                    ) : (
                      <span className="credits-val" onClick={() => setEditCredits({ id: u.id, val: String(u.credits) })}>
                        ⭐ {u.credits} <small>✏️</small>
                      </span>
                    )}
                  </td>
                  <td>{u.generation_count}</td>
                  <td>{new Date(u.created_at).toLocaleDateString('fr')}</td>
                  <td>
                    <span className={`status-badge ${u.is_blocked ? 'blocked' : 'active'}`}>
                      {u.is_blocked ? '🚫 Bloqué' : '✅ Actif'}
                    </span>
                  </td>
                  <td className="actions-cell">
                    {u.role !== 'admin' && (
                      <>
                        <button
                          className={`action-btn ${u.is_blocked ? 'unblock' : 'block'}`}
                          onClick={() => toggleBlock(u)}
                          title={u.is_blocked ? 'Débloquer' : 'Bloquer'}
                        >
                          {u.is_blocked ? '🔓' : '🔒'}
                        </button>
                        <button
                          className="action-btn delete"
                          onClick={() => deleteUser(u.id)}
                          title="Supprimer"
                        >
                          🗑️
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
