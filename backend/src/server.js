const { Pool } = require('pg');
require('dotenv').config();
const createApp = require('./app');

const PORT = process.env.PORT || 3000;

// Configuration de la base de données PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Création de l'application via notre module centralisé
const app = createApp(pool);

// Lancement du serveur
app.listen(PORT, () => {
  console.log(`Serveur SaaS Pro démarré et à l'écoute sur le port ${PORT}`);
});

