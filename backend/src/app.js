const express = require('express');
const cors = require('cors');

module.exports = function(pool) {
  const app = express();

  // Middlewares globaux
  app.use(cors());
  app.use(express.json());

  // Route de test principale
  app.get('/api/status', async (req, res) => {
    try {
      const dbResult = await pool.query('SELECT NOW()');
      res.json({
        success: true,
        message: 'API SaaS Pro pleinement opérationnelle !',
        database_time: dbResult.rows[0].now
      });
    } catch (err) {
      console.error('Erreur base de données :', err);
      res.status(500).json({ success: false, message: 'Erreur de connexion à la base de données.' });
    }
  });

  // Importation et enregistrement des modules de routes
  const authRoutes = require('./routes/auth')(pool);
  const productRoutes = require('./routes/products')(pool);
  const salesRoutes = require('./routes/sales')(pool);
  const expenseRoutes = require('./routes/expenses')(pool);
  const reportRoutes = require('./routes/reports')(pool);
  const paymentRoutes = require('./routes/payments')(pool);

  app.use('/api/auth', authRoutes);
  app.use('/api/products', productRoutes);
  app.use('/api/sales', salesRoutes);
  app.use('/api/expenses', expenseRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/payments', paymentRoutes);

  return app;
};
