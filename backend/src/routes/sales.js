const express = require('express');
const router = express.Router();
const { verifyToken } = require('../auth');

module.exports = function(pool) {

  // LISTER LES VENTES DE L'ENTREPRISE
  router.get('/', verifyToken, async (req, res) => {
    try {
      const companyId = req.user.companyId;
      const result = await pool.query(
        `SELECT s.*, c.name as client_name 
         FROM sales s 
         LEFT JOIN clients c ON s.client_id = c.id 
         WHERE s.company_id = $1 
         ORDER BY s.created_at DESC`,
        [companyId]
      );
      res.json({ success: true, sales: result.rows });
    } catch (err) {
      console.error('Erreur récupération ventes :', err);
      res.status(500).json({ success: false, message: 'Erreur serveur.', error: err.message });
    }
  });

  // ENREGISTRER UNE NOUVELLE VENTE
  router.post('/', verifyToken, async (req, res) => {
    const { clientId, items, paymentMethod, discount } = req.body;
    const companyId = req.user.companyId;
    const userId = req.user.userId;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Le panier est vide.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      let totalAmount = 0;
      let totalCogs = 0; // Coût total des marchandises vendues (COGS)
      const saleItemsData = [];

      // 1. Vérifier les stocks et calculer les prix / COGS pour chaque article
      for (const item of items) {
        const prodResult = await client.query(
          'SELECT * FROM products WHERE id = $1 AND company_id = $2',
          [item.productId, companyId]
        );

        if (prodResult.rows.length === 0) {
          throw new Error(`Produit ID ${item.productId} introuvable.`);
        }

        const product = prodResult.rows[0];

        if (product.stock < item.quantity) {
          throw new Error(`Stock insuffisant pour le produit : ${product.name} (Disponible : ${product.stock})`);
        }

        const unitPrice = product.sell_price;
        const buyPrice = product.buy_price;
        const itemTotal = unitPrice * item.quantity;
        const itemCogs = buyPrice * item.quantity;

        totalAmount += itemTotal;
        totalCogs += itemCogs;

        saleItemsData.push({
          productId: product.id,
          quantity: item.quantity,
          unitPrice,
          totalPrice: itemTotal
        });
      }

      const finalAmount = totalAmount - (discount || 0);

      // 2. Insérer la vente principale
      const saleResult = await client.query(
        `INSERT INTO sales (company_id, client_id, total_amount, cogs, discount, payment_method, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [companyId, clientId || null, finalAmount, totalCogs, discount || 0, paymentMethod || 'especes', userId]
      );
      const saleId = saleResult.rows[0].id;

      // 3. Insérer les lignes de vente et mettre à jour le stock + mouvements
      for (const si of saleItemsData) {
        await client.query(
          `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, total_price)
           VALUES ($1, $2, $3, $4, $5)`,
          [saleId, si.productId, si.quantity, si.unitPrice, si.totalPrice]
        );

        // Mettre à jour le stock du produit
        await client.query(
          'UPDATE products SET stock = stock - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [si.quantity, si.productId]
        );

        // Enregistrer le mouvement de stock
        await client.query(
          `INSERT INTO stock_movements (company_id, product_id, type, quantity, reason, created_by)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [companyId, si.productId, 'vente', si.quantity, `Vente #ID ${saleId}`, userId]
        );
      }

      // 4. Journal d'audit
      await client.query(
        'INSERT INTO audit_logs (company_id, user_id, action) VALUES ($1, $2, $3)',
        [companyId, userId, `Validation de la vente #${saleId} pour un montant de ${finalAmount}`]
      );

      await client.query('COMMIT');
      res.status(201).json({ success: true, message: 'Vente enregistrée avec succès.', saleId, totalAmount: finalAmount });

    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Erreur enregistrement vente :', err);
      res.status(400).json({ success: false, message: err.message || 'Erreur lors de la vente.' });
    } finally {
      client.release();
    }
  });

  return router;
};
