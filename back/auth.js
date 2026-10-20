const express  = require('express');
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const pool      = require('./db');
const fs        = require('fs');
const path      = require('path');

const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'evoprint_secret_key_2025';

// ── INSCRIPTION ──────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { nom, prenom, email, password } = req.body;

    if (!nom || !prenom || !email || !password)
      return res.status(400).json({ error: 'Tous les champs sont requis' });

    // Vérifier si email déjà utilisé
    const [existing] = await pool.execute(
      'SELECT id FROM users WHERE email = ?', [email]
    );
    if (existing.length > 0)
      return res.status(409).json({ error: 'Email déjà utilisé' });

    // Hacher le mot de passe
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insérer l'utilisateur
    const [result] = await pool.execute(
      'INSERT INTO users (nom, prenom, email, password) VALUES (?, ?, ?, ?)',
      [nom, prenom, email, hashedPassword]
    );

    // Générer le token JWT
    const token = jwt.sign(
      { id: result.insertId, email, role: 'user' },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({
      success: true,
      message: 'Compte créé avec succès',
      token,
      user: { id: result.insertId, nom, prenom, email, role: 'user', plan: 'gratuit', credits: 5 }
    });

  } catch (err) {
    console.error('Register error:', err.message);
    res.status(500).json({ error: 'Erreur serveur', message: err.message });
  }
});

// ── CONNEXION ────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ error: 'Email et mot de passe requis' });

    // Chercher l'utilisateur
    const [rows] = await pool.execute(
      'SELECT * FROM users WHERE email = ?', [email]
    );
    if (rows.length === 0)
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });

    const user = rows[0];

    if (user.is_blocked)
      return res.status(403).json({ error: 'Compte suspendu. Contactez l\'administrateur.' });

    // Vérifier le mot de passe
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid)
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });

    // Générer le token JWT
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      message: 'Connexion réussie',
      token,
      user: {
        id:      user.id,
        nom:     user.nom,
        prenom:  user.prenom,
        email:   user.email,
        role:    user.role,
        plan:    user.plan,
        credits: user.credits
      }
    });

  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Erreur serveur', message: err.message });
  }
});

// ── PROFIL (protégé) ─────────────────────────────────────────
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Token manquant' });

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    const [rows] = await pool.execute(
      'SELECT id, nom, prenom, email, role, plan, credits, created_at FROM users WHERE id = ?',
      [decoded.id]
    );
    if (rows.length === 0)
      return res.status(404).json({ error: 'Utilisateur introuvable' });

    res.json({ success: true, user: rows[0] });

  } catch (err) {
    res.status(401).json({ error: 'Token invalide ou expiré' });
  }
});

// ── VÉRIFIER LIMITE D'UTILISATION ───────────────────────────
router.post('/check-limit', async (req, res) => {
  const header = req.headers.authorization
  if (!header) return res.status(401).json({ error: 'Token manquant' })
  let userId
  try { userId = jwt.verify(header.split(' ')[1], JWT_SECRET).id }
  catch { return res.status(401).json({ error: 'Token invalide' }) }

  const { model } = req.body
  const [rows] = await pool.execute(
    'SELECT dalle_unlocked, mj_nano_unlocked FROM users WHERE id = ?',
    [userId]
  )
  const u = rows[0]
  if (!u) return res.status(404).json({ error: 'Utilisateur introuvable' })

  if (model === 'stability') return res.json({ allowed: true })

  if (model === 'dalle') {
    if (u.dalle_unlocked) return res.json({ allowed: true })
    return res.json({ allowed: false, reason: 'dalle_limit' })
  }

  if (model === 'midjourney' || model === 'nanobanana') {
    if (u.mj_nano_unlocked) return res.json({ allowed: true })
    return res.json({ allowed: false, reason: 'mj_nano_limit' })
  }

  res.json({ allowed: true })
})

// ── CONSOMMER UN USAGE ───────────────────────────────────────
router.post('/consume', async (req, res) => {
  const header = req.headers.authorization
  if (!header) return res.status(401).json({ error: 'Token manquant' })
  let userId
  try { userId = jwt.verify(header.split(' ')[1], JWT_SECRET).id }
  catch { return res.status(401).json({ error: 'Token invalide' }) }

  const { model } = req.body

  if (model === 'dalle') {
    await pool.execute('UPDATE users SET dalle_free_used = 1 WHERE id = ?', [userId])
  } else if (model === 'midjourney' || model === 'nanobanana') {
    const [rows] = await pool.execute('SELECT mj_nano_week_uses, mj_nano_week_start FROM users WHERE id = ?', [userId])
    const u = rows[0]
    const today = new Date()
    const weekStart = u.mj_nano_week_start ? new Date(u.mj_nano_week_start) : null
    const diffDays = weekStart ? Math.floor((today - weekStart) / 86400000) : 999
    const newUses = diffDays >= 7 ? 1 : (u.mj_nano_week_uses || 0) + 1
    const newStart = diffDays >= 7 ? today.toISOString().split('T')[0] : (u.mj_nano_week_start || today.toISOString().split('T')[0])
    await pool.execute('UPDATE users SET mj_nano_week_uses = ?, mj_nano_week_start = ? WHERE id = ?', [newUses, newStart, userId])
  }
  res.json({ success: true })
})

// ── PAIEMENT (simulation) ────────────────────────────────────
router.post('/payment/unlock', async (req, res) => {
  const header = req.headers.authorization
  if (!header) return res.status(401).json({ error: 'Token manquant' })
  let userId
  try { userId = jwt.verify(header.split(' ')[1], JWT_SECRET).id }
  catch { return res.status(401).json({ error: 'Token invalide' }) }

  const { pack } = req.body  // 'dalle' | 'mj_nano' | 'bundle'

  if (pack === 'dalle') {
    await pool.execute('UPDATE users SET dalle_unlocked = 1 WHERE id = ?', [userId])
  } else if (pack === 'mj_nano') {
    await pool.execute('UPDATE users SET mj_nano_unlocked = 1 WHERE id = ?', [userId])
  } else if (pack === 'bundle') {
    await pool.execute('UPDATE users SET dalle_unlocked = 1, mj_nano_unlocked = 1 WHERE id = ?', [userId])
  } else {
    return res.status(400).json({ error: 'Pack invalide' })
  }

  // Retourner utilisateur mis à jour
  const [rows] = await pool.execute(
    'SELECT id, nom, prenom, email, role, plan, credits, dalle_free_used, dalle_unlocked, mj_nano_unlocked, mj_nano_week_uses FROM users WHERE id = ?',
    [userId]
  )
  res.json({ success: true, user: rows[0] })
})

// ── MIDDLEWARE JWT ───────────────────────────────────────────
function authMiddleware(req, res, next) {
  const header = req.headers.authorization
  if (!header) return res.status(401).json({ error: 'Token manquant' })
  try {
    req.user = jwt.verify(header.split(' ')[1], JWT_SECRET)
    next()
  } catch {
    res.status(401).json({ error: 'Token invalide ou expiré' })
  }
}

// ── SAUVEGARDER UNE GÉNÉRATION ───────────────────────────────
router.post('/history', authMiddleware, async (req, res) => {
  try {
    const { prompt, image_url, model, support_type, sector } = req.body
    if (!prompt || !image_url) return res.status(400).json({ error: 'Données manquantes' })

    let storedUrl = image_url
    // Si c'est du base64, sauvegarder sur disque
    if (image_url.startsWith('data:')) {
      const matches = image_url.match(/^data:([a-zA-Z0-9+/]+\/[a-zA-Z0-9+/]+);base64,(.+)$/)
      if (matches) {
        const ext = matches[1].split('/')[1].replace('jpeg', 'jpg')
        const filename = `gen_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
        fs.writeFileSync(path.join(UPLOADS_DIR, filename), Buffer.from(matches[2], 'base64'))
        storedUrl = `/uploads/${filename}`
      }
    }

    const [result] = await pool.execute(
      'INSERT INTO generations (user_id, prompt, image_url, model, support_type, sector) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.id, prompt, storedUrl, model || 'stability', support_type || 'poster', sector || 'corporate']
    )
    res.json({ success: true, id: result.insertId })
  } catch (err) {
    console.error('History save error:', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// ── RÉCUPÉRER L'HISTORIQUE ───────────────────────────────────
router.get('/history', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, prompt, image_url, model, support_type, sector, created_at FROM generations WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
      [req.user.id]
    )
    res.json({ success: true, history: rows })
  } catch (err) {
    console.error('History fetch error:', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// ── SUPPRIMER UNE GÉNÉRATION ─────────────────────────────────
router.delete('/history/:id', authMiddleware, async (req, res) => {
  try {
    await pool.execute('DELETE FROM generations WHERE id = ? AND user_id = ?', [req.params.id, req.user.id])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

module.exports = router;
