const express = require('express');
const router = express.Router();
const { verifyToken } = require('../auth');

module.exports = function(pool) {

  // LISTER LES PRODUITS DE L'ENTREPRISE
  router.get('/', verifyToken, async (req, res) => {
    try {
      const companyId = req.user.companyId;
      const result = await pool.query(
        'SELECT * FROM products WHERE company_id = $1 ORDER BY name ASC',
        [companyId]
      );
      res.json({ success: true, products: result.rows });
    } catch (err) {
      console.error('Erreur lors de la récupération des produits :', err);
      res.status(500).json({ success: false, message: 'Erreur serveur.', error: err.message });
    }
  });

  // AJOUTER UN PRODUIT
  router.post('/', verifyToken, async (req, res) => {
    const { name, sku, category_id, description, buy_price, sell_price, stock, min_threshold, unit, supplier_name } = req.body;
    const companyId = req.user.companyId;

    if (!name || buy_price === undefined || sell_price === undefined) {
      return res.status(400).json({ success: false, message: 'Nom, prix d\'achat et prix de vente obligatoires.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Insérer le produit
      const productResult = await client.query(
        `INSERT INTO products (company_id, name, sku, category_id, description, buy_price, sell_price, stock, min_threshold, unit, supplier_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
        [companyId, name, sku || null, category_id || null, description || '', buy_price, sell_price, stock || 0, min_threshold || 5, unit || 'unité', supplier_name || '']
      );
      const newProduct = productResult.rows[0];

      // 2. Enregistrer le mouvement de stock initial si le stock > 0
      if (stock && stock > 0) {
        await client.query(
          `INSERT INTO stock_movements (company_id, product_id, type, quantity, reason, created_by)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [companyId, newProduct.id, 'ajustement', stock, 'Stock initial à la création', req.user.userId]
        );
      }

      // 3. Journal d'audit
      await client.query(
        'INSERT INTO audit_logs (company_id, user_id, action) VALUES ($1, $2, $3)',
        [companyId, req.user.userId, `Création du produit : ${name}`]
      );

      await client.query('COMMIT');
      res.status(201).json({ success: true, message: 'Produit ajouté avec succès.', product: newProduct });

    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Erreur lors de l\'ajout du produit :', err);
      res.status(500).json({ success: false, message: 'Erreur serveur.', error: err.message });
    } finally {
      client.release();
    }
  });

  // MODIFIER UN PRODUIT
  router.put('/:id', verifyToken, async (req, res) => {
    const productId = req.params.id;
    const { name, sku, category_id, description, buy_price, sell_price, min_threshold, unit, supplier_name } = req.body;
    const companyId = req.user.companyId;

    try {
      // Vérifier que le produit appartient bien à l'entreprise
      const check = await pool.query('SELECT * FROM products WHERE id = $1 AND company_id = $2', [productId, companyId]);
      if (check.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Produit introuvable.' });
      }

      const result = await pool.query(
        `UPDATE products SET name = $1, sku = $2, category_id = $3, description = $4, buy_price = $5, sell_price = $6, min_threshold = $7, unit = $8, supplier_name = $9, updated_at = CURRENT_TIMESTAMP
         WHERE id = $10 AND company_id = $11 RETURNING *`,
        [name, sku, category_id, description, buy_price, sell_price, min_threshold, unit, supplier_name, productId, companyId]
      );

      await pool.query(
        'INSERT INTO audit_logs (company_id, user_id, action) VALUES ($1, $2, $3)',
        [companyId, req.user.userId, `Modification du produit ID ${productId}`]
      );

      res.json({ success: true, message: 'Produit mis à jour.', product: result.rows[0] });
    } catch (err) {
      console.error('Erreur modification produit :', err);
      res.status(500).json({ success: false, message: 'Erreur serveur.', error: err.message });
    }
  });

  // SUPPRIMER UN PRODUIT
  router.delete('/:id', verifyToken, async (req, res) => {
    const productId = req.params.id;
    const companyId = req.user.companyId;

    try {
      const check = await pool.query('SELECT * FROM products WHERE id = $1 AND company_id = $2', [productId, companyId]);
      if (check.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Produit introuvable.' });
      }

      await pool.query('DELETE FROM products WHERE id = $1 AND company_id = $2', [productId, companyId]);

      await pool.query(
        'INSERT INTO audit_logs (company_id, user_id, action) VALUES ($1, $2, $3)',
        [companyId, req.user.userId, `Suppression du produit ID ${productId}`]
      );

      res.json({ success: true, message: 'Produit supprimé avec succès.' });
    } catch (err) {
      console.error('Erreur suppression produit :', err);
      res.status(500).json({ success: false, message: 'Erreur serveur.', error: err.message });
    }
  });

  return router;
};
