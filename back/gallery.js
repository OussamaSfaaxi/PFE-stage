const express = require('express');
const jwt     = require('jsonwebtoken');
const pool    = require('./db');

// Wrapper qui relance la requête une fois si ECONNRESET
async function query(sql, params = []) {
  try {
    return await pool.execute(sql, params);
  } catch (err) {
    if (err.code === 'ECONNRESET' || err.code === 'PROTOCOL_CONNECTION_LOST') {
      return await pool.execute(sql, params);
    }
    throw err;
  }
}

const router     = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'evoprint_secret_key_2025';

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'Token manquant' });
  try {
    req.user = jwt.verify(header.split(' ')[1], JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token invalide ou expiré' });
  }
}

function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (header) {
    try { req.user = jwt.verify(header.split(' ')[1], JWT_SECRET); } catch {}
  }
  next();
}

// ── PUBLIER dans la galerie ──────────────────────────────────
router.post('/posts', authMiddleware, async (req, res) => {
  try {
    const { generation_id, title } = req.body;
    if (!generation_id) return res.status(400).json({ error: 'generation_id requis' });

    // Vérifier que la génération appartient à l'utilisateur
    const [gens] = await query(
      'SELECT id FROM generations WHERE id = ? AND user_id = ?',
      [generation_id, req.user.id]
    );
    if (gens.length === 0) return res.status(403).json({ error: 'Génération introuvable' });

    // Vérifier si déjà publié
    const [existing] = await query(
      'SELECT id FROM gallery_posts WHERE generation_id = ? AND user_id = ?',
      [generation_id, req.user.id]
    );
    if (existing.length > 0) return res.status(409).json({ error: 'Déjà publié dans la galerie' });

    const [result] = await query(
      'INSERT INTO gallery_posts (user_id, generation_id, title) VALUES (?, ?, ?)',
      [req.user.id, generation_id, title || '']
    );

    res.status(201).json({ success: true, post_id: result.insertId });
  } catch (err) {
    console.error('Gallery post error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── RÉCUPÉRER la galerie publique ────────────────────────────
router.get('/posts', optionalAuth, async (req, res) => {
  try {
    const sortCol = req.query.sort === 'likes' ? 'gp.likes_count' : 'gp.created_at';
    const limit   = Math.min(parseInt(req.query.limit) || 12, 50);
    const page    = Math.max(parseInt(req.query.page)  || 1,  1);
    const offset  = (page - 1) * limit;

    const conn = await pool.getConnection();
    try {
      const [posts] = await conn.query(
        `SELECT
          gp.id, gp.title, gp.likes_count, gp.created_at,
          u.nom, u.prenom,
          g.prompt, g.image_url, g.model, g.support_type, g.sector,
          (SELECT COUNT(*) FROM gallery_comments gc WHERE gc.post_id = gp.id) AS comments_count
        FROM gallery_posts gp
        JOIN users u ON u.id = gp.user_id
        JOIN generations g ON g.id = gp.generation_id
        WHERE gp.is_public = 1
        ORDER BY ${sortCol} DESC
        LIMIT ? OFFSET ?`,
        [limit, offset]
      );

      let likedIds = new Set();
      if (req.user) {
        const [likes] = await conn.execute(
          'SELECT post_id FROM gallery_likes WHERE user_id = ?',
          [req.user.id]
        );
        likedIds = new Set(likes.map(l => l.post_id));
      }

      const [[{ cnt }]] = await conn.execute(
        'SELECT COUNT(*) as cnt FROM gallery_posts WHERE is_public = 1'
      );

      res.json({
        success: true,
        posts: posts.map(p => ({ ...p, liked_by_me: likedIds.has(p.id) })),
        total: cnt,
        page,
        pages: Math.ceil(cnt / limit)
      });
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('Gallery fetch error:', err.code, err.message, err.sqlMessage);
    res.status(500).json({ error: 'Erreur serveur', message: err.sqlMessage || err.message || err.code });
  }
});

// ── LIKER / UNLIKER un post ──────────────────────────────────
router.post('/posts/:id/like', authMiddleware, async (req, res) => {
  try {
    const postId = req.params.id;

    const [existing] = await query(
      'SELECT id FROM gallery_likes WHERE post_id = ? AND user_id = ?',
      [postId, req.user.id]
    );

    if (existing.length > 0) {
      await query('DELETE FROM gallery_likes WHERE post_id = ? AND user_id = ?', [postId, req.user.id]);
      await query('UPDATE gallery_posts SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = ?', [postId]);
      res.json({ success: true, liked: false });
    } else {
      await query('INSERT INTO gallery_likes (post_id, user_id) VALUES (?, ?)', [postId, req.user.id]);
      await query('UPDATE gallery_posts SET likes_count = likes_count + 1 WHERE id = ?', [postId]);
      res.json({ success: true, liked: true });
    }
  } catch (err) {
    console.error('Like error:', err.code, err.sqlMessage || err.message);
    res.status(500).json({ error: 'Erreur serveur', message: err.sqlMessage || err.message });
  }
});

// ── COMMENTER un post ────────────────────────────────────────
router.post('/posts/:id/comments', authMiddleware, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: 'Commentaire vide' });

    const [result] = await query(
      'INSERT INTO gallery_comments (post_id, user_id, content) VALUES (?, ?, ?)',
      [req.params.id, req.user.id, content.trim()]
    );

    res.status(201).json({ success: true, comment_id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── RÉCUPÉRER les commentaires d'un post ─────────────────────
router.get('/posts/:id/comments', async (req, res) => {
  try {
    const [comments] = await query(`
      SELECT gc.id, gc.content, gc.created_at, u.nom, u.prenom
      FROM gallery_comments gc
      JOIN users u ON u.id = gc.user_id
      WHERE gc.post_id = ?
      ORDER BY gc.created_at ASC
    `, [req.params.id]);
    res.json({ success: true, comments });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── SUPPRIMER un commentaire (auteur ou admin) ───────────────
router.delete('/comments/:id', authMiddleware, async (req, res) => {
  try {
    await query(
      'DELETE FROM gallery_comments WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── SUPPRIMER un post (auteur) ───────────────────────────────
router.delete('/posts/:id', authMiddleware, async (req, res) => {
  try {
    await query(
      'DELETE FROM gallery_posts WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── TOP classement ───────────────────────────────────────────
router.get('/top', async (req, res) => {
  try {
    const [posts] = await query(`
      SELECT gp.id, gp.title, gp.likes_count, gp.created_at,
             u.nom, u.prenom,
             g.prompt, g.image_url, g.model, g.support_type, g.sector
      FROM gallery_posts gp
      JOIN users u ON u.id = gp.user_id
      JOIN generations g ON g.id = gp.generation_id
      WHERE gp.is_public = 1
      ORDER BY gp.likes_count DESC
      LIMIT 10
    `);
    res.json({ success: true, posts });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
