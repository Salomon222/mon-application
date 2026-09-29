const express = require('express');
const router = express.Router();
const { verifyToken } = require('../auth');

module.exports = function(pool) {

  // TABLEAU DE BORD FINANCIER ET COMMERCIAL
  router.get('/dashboard', verifyToken, async (req, res) => {
    const companyId = req.user.companyId;

    try {
      // 1. Chiffre d'affaires total, COGS total et Marge brute globale
      const salesQuery = await pool.query(
        `SELECT 
           COALESCE(SUM(total_amount), 0) as total_revenue,
           COALESCE(SUM(cogs), 0) as total_cogs,
           COUNT(id) as total_sales_count
         FROM sales WHERE company_id = $1`,
        [companyId]
      );
      const salesData = salesQuery.rows[0];
      const totalRevenue = parseFloat(salesData.total_revenue);
      const totalCogs = parseFloat(salesData.total_cogs);
      const grossProfit = totalRevenue - totalCogs;

      // 2. Total des dépenses opérationnelles
      const expensesQuery = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) as total_expenses 
         FROM expenses WHERE company_id = $1`,
        [companyId]
      );
      const totalExpenses = parseFloat(expensesQuery.rows[0].total_expenses);

      // 3. Résultat net réel (Marge brute - Dépenses)
      const netProfit = grossProfit - totalExpenses;

      // 4. Valeur totale du stock et produits en alerte
      const stockQuery = await pool.query(
        `SELECT 
           COALESCE(SUM(stock * buy_price), 0) as stock_valuation,
           COUNT(CASE WHEN stock <= min_threshold THEN 1 END) as low_stock_count
         FROM products WHERE company_id = $1`,
        [companyId]
      );
      const stockData = stockQuery.rows[0];

      // 5. Produits les plus vendus
      const topProductsQuery = await pool.query(
        `SELECT p.name, SUM(si.quantity) as total_qty_sold, SUM(si.total_price) as total_sales_amount
         FROM sale_items si
         JOIN sales s ON si.sale_id = s.id
         JOIN products p ON si.product_id = p.id
         WHERE s.company_id = $1
         GROUP BY p.id, p.name
         ORDER BY total_qty_sold DESC
         LIMIT 5`,
        [companyId]
      );

      res.json({
        success: true,
        metrics: {
          totalRevenue,
          totalCogs,
          grossProfit,
          totalExpenses,
          netProfit,
          totalSalesCount: parseInt(salesData.total_sales_count),
          stockValuation: parseFloat(stockData.stock_valuation),
          lowStockCount: parseInt(stockData.low_stock_count)
        },
        topProducts: topProductsQuery.rows
      });

    } catch (err) {
      console.error('Erreur génération rapport dashboard :', err);
      res.status(500).json({ success: false, message: 'Erreur serveur.', error: err.message });
    }
  });

  return router;
};
