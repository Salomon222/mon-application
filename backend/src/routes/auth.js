const express = require('express');
const router = express.Router();
const { hashPassword, comparePassword, generateToken } = require('../auth');

// Route d'inscription d'un nouveau commerçant
router.register = async function(pool) {
  // Nous gérons les routes en recevant l'instance de la base de données (pool)
};

module.exports = function(pool) {
  
  // INSCRIPTION
  router.post('/register', async (req, res) => {
    const { companyName, ownerName, email, password } = req.body;

    if (!companyName || !ownerName || !email || !password) {
      return res.status(400).json({ success: false, message: 'Tous les champs sont obligatoires.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Vérifier si l'email existe déjà
      const userCheck = await client.query('SELECT id FROM users WHERE email = $1', [email]);
      if (userCheck.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Cet email est déjà utilisé.' });
      }

      // 2. Créer l'entreprise
      const companyResult = await client.query(
        'INSERT INTO companies (name, owner_name) VALUES ($1, $2) RETURNING id',
        [companyName, ownerName]
      );
      const companyId = companyResult.rows[0].id;

      // 3. Hacher le mot de passe et créer l'utilisateur (propriétaire)
      const passwordHash = await hashPassword(password);
      const userResult = await client.query(
        'INSERT INTO users (company_id, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, email, role, company_id',
        [companyId, email, passwordHash, 'owner']
      );
      const newUser = userResult.rows[0];

      // 4. Créer un abonnement d'essai de 14 jours
      const trialExpiresAt = new Date();
      trialExpiresAt.setDate(trialExpiresAt.getDate() + 14);
      await client.query(
        'INSERT INTO subscriptions (company_id, status, expires_at) VALUES ($1, $2, $3)',
        [companyId, 'trial', trialExpiresAt]
      );

      // 5. Enregistrer l'action dans le journal d'audit
      await client.query(
        'INSERT INTO audit_logs (company_id, user_id, action) VALUES ($1, $2, $3)',
        [companyId, newUser.id, 'Inscription et création de l\'entreprise']
      );

      await client.query('COMMIT');

      // Générer le jeton de session JWT
      const token = generateToken(newUser);

      res.status(201).json({
        success: true,
        message: 'Compte créé avec succès.',
        token,
        user: {
          id: newUser.id,
          email: newUser.email,
          role: newUser.role,
          companyId: newUser.company_id
        }
      });

    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Erreur lors de l\'inscription :', err);
      res.status(500).json({ success: false, message: 'Erreur serveur lors de l\'inscription.', error: err.message });
    } finally {
      client.release();
    }
  });

  // CONNEXION
  router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email et mot de passe requis.' });
    }

    try {
      // Rechercher l'utilisateur par son email
      const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
      if (result.rows.length === 0) {
        return res.status(401).json({ success: false, message: 'Email ou mot de passe incorrect.' });
      }

      const user = result.rows[0];

      // Vérifier le mot de passe
      const isPasswordValid = await comparePassword(password, user.password_hash);
      if (!isPasswordValid) {
        return res.status(401).json({ success: false, message: 'Email ou mot de passe incorrect.' });
      }

      // Vérifier le statut de l'abonnement de l'entreprise
      const subResult = await pool.query('SELECT * FROM subscriptions WHERE company_id = $1', [user.company_id]);
      const subscription = subResult.rows[0];

      // Générer le jeton JWT
      const token = generateToken(user);

      // Enregistrer l'action dans le journal d'audit
      await pool.query(
        'INSERT INTO audit_logs (company_id, user_id, action) VALUES ($1, $2, $3)',
        [user.company_id, user.id, 'Connexion de l\'utilisateur']
      );

      res.json({
        success: true,
        message: 'Connexion réussie.',
        token,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          companyId: user.company_id
        },
        subscription: subscription ? {
          status: subscription.status,
          expiresAt: subscription.expires_at
        } : null
      });

    } catch (err) {
      console.error('Erreur lors de la connexion :', err);
      res.status(500).json({ success: false, message: 'Erreur serveur lors de la connexion.', error: err.message });
    }
  });

  return router;
};
