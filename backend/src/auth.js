const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const SALT_ROUNDS = 10;

// Hacher un mot de passe avant de l'enregistrer dans PostgreSQL
async function hashPassword(plainPassword) {
  return await bcrypt.hash(plainPassword, SALT_ROUNDS);
}

// Vérifier un mot de passe lors de la connexion
async function comparePassword(plainPassword, hashedPassword) {
  return await bcrypt.compare(plainPassword, hashedPassword);
}

// Générer un jeton JWT sécurisé pour la session
function generateToken(user) {
  const payload = {
    userId: user.id,
    companyId: user.company_id,
    role: user.role,
    email: user.email
  };
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });
}

// Middleware de vérification du token pour sécuriser les routes du serveur
function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Format: Bearer TOKEN

  if (!token) {
    return res.status(401.json({
      success: false,
      message: 'Accès refusé. Jeton d\'authentification manquant.'
    });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403.json({
        success: false,
        message: 'Jeton invalide ou expiré.'
      });
    }
    req.user = user; // Contient userId, companyId, role, email
    next();
  });
}

module.exports = {
  hashPassword,
  comparePassword,
  generateToken,
  verifyToken
};
