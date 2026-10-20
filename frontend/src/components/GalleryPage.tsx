import { API_URL } from '../api'
import { useState, useEffect, useCallback } from 'react'
import './GalleryPage.css'

interface GalleryPost {
  id: number
  title: string
  likes_count: number
  comments_count: number
  created_at: string
  nom: string
  prenom: string
  prompt: string
  image_url: string
  model: string
  support_type: string
  sector: string
  liked_by_me: boolean
}

interface Comment {
  id: number
  content: string
  created_at: string
  nom: string
  prenom: string
}

interface Props {
  userId: number
  token: string
}

const MODEL_LABELS: Record<string, string> = {
  stability: 'Stability AI',
  dalle: 'DALL·E 3',
  midjourney: 'Midjourney',
  nanobanana: 'Nano Banana',
  evoprint: 'EvoPrint AI',
}

export default function GalleryPage({ userId, token }: Props) {
  const [posts, setPosts]           = useState<GalleryPost[]>([])
  const [sort, setSort]             = useState<'recent' | 'likes'>('recent')
  const [page, setPage]             = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading]       = useState(false)
  const [activePost, setActivePost] = useState<GalleryPost | null>(null)
  const [comments, setComments]     = useState<Comment[]>([])
  const [newComment, setNewComment] = useState('')
  const [commentLoading, setCommentLoading] = useState(false)

  const fetchPosts = useCallback(async () => {
    setLoading(true)
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)
      const res = await fetch(
        `${API_URL}/api/gallery/posts?sort=${sort}&page=${page}&limit=12`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: controller.signal
        }
      )
      clearTimeout(timeout)
      const data = await res.json()
      if (data.success) {
        setPosts(data.posts)
        setTotalPages(data.pages)
      }
    } catch (e: any) {
      if (e.name === 'AbortError') console.error('Gallery timeout')
    } finally {
      setLoading(false)
    }
  }, [sort, page, token])

  useEffect(() => { fetchPosts() }, [fetchPosts])

  const handleLike = async (post: GalleryPost) => {
    if (!token) { alert('Connectez-vous pour liker'); return }
    try {
      const res = await fetch(`${API_URL}/api/gallery/posts/${post.id}/like`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (data.success) {
        const delta = data.liked ? 1 : -1
        setPosts(prev => prev.map(p =>
          p.id === post.id ? { ...p, liked_by_me: data.liked, likes_count: p.likes_count + delta } : p
        ))
        if (activePost?.id === post.id) {
          setActivePost(prev => prev ? { ...prev, liked_by_me: data.liked, likes_count: prev.likes_count + delta } : null)
        }
      } else {
        console.error('Like failed:', data.message)
      }
    } catch (e) {
      console.error('Like network error:', e)
    }
  }

  const openPost = async (post: GalleryPost) => {
    setActivePost(post)
    setNewComment('')
    const res = await fetch(`${API_URL}/api/gallery/posts/${post.id}/comments`)
    const data = await res.json()
    if (data.success) setComments(data.comments)
  }

  const submitComment = async () => {
    if (!newComment.trim() || !activePost) return
    setCommentLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/gallery/posts/${activePost.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: newComment.trim() })
      })
      const data = await res.json()
      if (data.success) {
        setNewComment('')
        const res2 = await fetch(`${API_URL}/api/gallery/posts/${activePost.id}/comments`)
        const data2 = await res2.json()
        if (data2.success) setComments(data2.comments)
        setPosts(prev => prev.map(p =>
          p.id === activePost.id ? { ...p, comments_count: p.comments_count + 1 } : p
        ))
      }
    } finally {
      setCommentLoading(false)
    }
  }

  const deleteComment = async (commentId: number) => {
    await fetch(`${API_URL}/api/gallery/comments/${commentId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    })
    setComments(prev => prev.filter(c => c.id !== commentId))
  }

  const deletePost = async (postId: number) => {
    await fetch(`${API_URL}/api/gallery/posts/${postId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    })
    setPosts(prev => prev.filter(p => p.id !== postId))
    setActivePost(null)
  }

  return (
    <div className="gallery-page">
      {/* Header */}
      <div className="gallery-header">
        <div className="gallery-title-row">
          <h2>✦ Galerie Publique</h2>
          <span className="gallery-subtitle">Les meilleures créations de la communauté</span>
        </div>
        <div className="gallery-sort">
          <button
            className={`sort-btn ${sort === 'recent' ? 'active' : ''}`}
            onClick={() => { setSort('recent'); setPage(1) }}
          >
            🕒 Récent
          </button>
          <button
            className={`sort-btn ${sort === 'likes' ? 'active' : ''}`}
            onClick={() => { setSort('likes'); setPage(1) }}
          >
            🔥 Populaire
          </button>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="gallery-loading">
          <div className="gallery-spinner" />
          <p>Chargement de la galerie...</p>
        </div>
      ) : posts.length === 0 ? (
        <div className="gallery-empty">
          <span>🎨</span>
          <p>Aucune création publiée pour le moment.</p>
          <small>Soyez le premier à partager votre œuvre !</small>
        </div>
      ) : (
        <div className="gallery-grid">
          {posts.map(post => (
            <div key={post.id} className="gallery-card" onClick={() => openPost(post)}>
              <div className="gallery-card-img">
                <img src={post.image_url.startsWith('/') ? `${API_URL}${post.image_url}` : post.image_url} alt={post.prompt} loading="lazy" />
                <div className="gallery-card-overlay">
                  <span>👁 Voir</span>
                </div>
              </div>
              <div className="gallery-card-info">
                {post.title && <p className="gallery-card-title">{post.title}</p>}
                <p className="gallery-card-prompt">{post.prompt.slice(0, 60)}...</p>
                <div className="gallery-card-meta">
                  <span className="gallery-badge">{MODEL_LABELS[post.model] || post.model}</span>
                  <span className="gallery-badge">{post.support_type}</span>
                </div>
                <div className="gallery-card-footer">
                  <span className="gallery-author">
                    {post.prenom} {post.nom}
                  </span>
                  <div className="gallery-actions">
                    <button
                      className={`like-btn ${post.liked_by_me ? 'liked' : ''}`}
                      onClick={e => { e.stopPropagation(); handleLike(post) }}
                    >
                      {post.liked_by_me ? '❤️' : '🤍'} {post.likes_count}
                    </button>
                    <span className="comment-count">💬 {post.comments_count}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="gallery-pagination">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Précédent</button>
          <span>{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Suivant →</button>
        </div>
      )}

      {/* Modal post */}
      {activePost && (
        <div className="gallery-modal-overlay" onClick={() => setActivePost(null)}>
          <div className="gallery-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setActivePost(null)}>✕</button>

            <div className="modal-content">
              <div className="modal-image">
                <img src={activePost.image_url.startsWith('/') ? `${API_URL}${activePost.image_url}` : activePost.image_url} alt={activePost.prompt} />
                <div className="modal-img-actions">
                  <button
                    className={`like-btn-lg ${activePost.liked_by_me ? 'liked' : ''}`}
                    onClick={() => handleLike(activePost)}
                  >
                    {activePost.liked_by_me ? '❤️' : '🤍'} {activePost.likes_count} likes
                  </button>
                  {activePost.nom && (
                    <a href={activePost.image_url.startsWith('/') ? `${API_URL}${activePost.image_url}` : activePost.image_url} download="evoprint.png" className="dl-btn">
                      ⬇ Télécharger
                    </a>
                  )}
                </div>
              </div>

              <div className="modal-details">
                <div className="modal-meta">
                  <h3>{activePost.title || 'Sans titre'}</h3>
                  <p className="modal-author">par {activePost.prenom} {activePost.nom}</p>
                  <p className="modal-prompt">"{activePost.prompt}"</p>
                  <div className="modal-badges">
                    <span className="gallery-badge">{MODEL_LABELS[activePost.model] || activePost.model}</span>
                    <span className="gallery-badge">{activePost.support_type}</span>
                    <span className="gallery-badge">{activePost.sector}</span>
                  </div>
                  {activePost.nom === '' && userId === 0 && (
                    <button className="delete-post-btn" onClick={() => deletePost(activePost.id)}>
                      🗑 Supprimer
                    </button>
                  )}
                </div>

                {/* Commentaires */}
                <div className="modal-comments">
                  <h4>💬 Commentaires ({comments.length})</h4>
                  <div className="comments-list">
                    {comments.length === 0 && (
                      <p className="no-comments">Aucun commentaire. Soyez le premier !</p>
                    )}
                    {comments.map(c => (
                      <div key={c.id} className="comment-item">
                        <div className="comment-header">
                          <span className="comment-author">{c.prenom} {c.nom}</span>
                          <span className="comment-date">
                            {new Date(c.created_at).toLocaleDateString('fr-FR')}
                          </span>
                          <button
                            className="comment-delete"
                            onClick={() => deleteComment(c.id)}
                            title="Supprimer"
                          >✕</button>
                        </div>
                        <p className="comment-content">{c.content}</p>
                      </div>
                    ))}
                  </div>
                  {token && (
                    <div className="comment-input-row">
                      <input
                        type="text"
                        placeholder="Ajouter un commentaire..."
                        value={newComment}
                        onChange={e => setNewComment(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && submitComment()}
                        maxLength={300}
                      />
                      <button
                        onClick={submitComment}
                        disabled={commentLoading || !newComment.trim()}
                      >
                        {commentLoading ? '...' : 'Envoyer'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
