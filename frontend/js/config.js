// Configuration globale de l'API Frontend
const CONFIG = {
  // Remplacez cette URL par l'URL de votre serveur une fois déployé (ex: Render, Railway, etc.)
  // Pour les tests en local, laissez 'http://localhost:3000/api'
  API_BASE_URL: 'https://votre-backend-render.onrender.com/api' 
};

// Fonction utilitaire pour récupérer le token JWT stocké sur le téléphone
function getAuthToken() {
  return localStorage.getItem('saas_token');
}

// Fonction utilitaire pour les requêtes HTTP sécurisées vers l'API
async function apiRequest(endpoint, options = {}) {
  const token = getAuthToken();
  
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };

  try {
    const response = await fetch(`${CONFIG.API_BASE_URL}${endpoint}`, {
      ...options,
      headers
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Une erreur est survenue lors de la communication avec le serveur.');
    }

    return data;
  } catch (error) {
    console.error('Erreur API :', error);
    throw error;
  }
}
