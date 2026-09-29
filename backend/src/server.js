const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration de la base de données PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Middlewares
app.use(cors());
app.use(express.json());

// Route de test pour vérifier que le serveur et la base de données répondent
app.get('/api/status', async (req, res) => {
  try {
    const dbResult = await pool.query('SELECT NOW()');
    res.json({
      success: true,
      message: 'Serveur SaaS Pro opérationnel !',
      database_time: dbResult.rows[0].now
    });
  } catch (err) {
    console.error('Erreur de connexion à la base de données :', err);
    res.status(500).json({
      success: false,
      message: 'Erreur de connexion à la base de données',
      error: err.message
    });
  }
});

// Lancement du serveur
app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});
