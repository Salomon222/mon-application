const express = require('express');
const router = express.Router();
const { verifyToken } = require('../auth');

module.exports = function(pool) {

  // LISTER LES DÉPENSES DE L'ENTREPRISE
  router.get('/', verifyToken, async (req, res) => {
    try {
      const companyId = req.user.companyId;
      const result = await pool.query(
        'SELECT * FROM expenses WHERE company_id = $1 ORDER BY created_at DESC',
        [companyId]
      );
      res.json({ success: true, expenses: result.rows });
    } catch (err) {
      console.error('Erreur récupération dépenses :', err);
      res.status(500).json({ success: false, message: 'Erreur serveur.', error: err.message });
    }
  });

  // ENREGISTRER UNE NOUVELLE DÉPENSE
  router.post('/', verifyToken, async (req, res) => {
    const { category, amount, description, paymentMethod } = req.body;
    const companyId = req.user.companyId;
    const userId = req.user.userId;

    if (!category || amount === undefined) {
      return res.status(400).json({ success: false, message: 'La catégorie et le montant sont obligatoires.' });
    }

    try {
      const result = await pool.query(
        `INSERT INTO expenses (company_id, category, amount, description, payment_method, created_by)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [companyId, category, amount, description || '', paymentMethod || 'especes', userId]
      );

      // Journal d'audit
      await pool.query(
        'INSERT INTO audit_logs (company_id, user_id, action) VALUES ($1, $2, $3)',
        [companyId, userId, `Enregistrement d'une dépense de ${amount} (${category})`]
      );

      res.status(201).json({ success: true, message: 'Dépense enregistrée avec succès.', expense: result.rows[0] });
    } catch (err) {
      console.error('Erreur enregistrement dépense :', err);
      res.status(500).json({ success: false, message: 'Erreur serveur.', error: err.message });
    }
  });

  return router;
};
