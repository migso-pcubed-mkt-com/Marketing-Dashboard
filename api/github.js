// Vercel Serverless Function - GitHub API Proxy
// Cette function sécurise votre token GitHub en le gardant côté serveur

export default async function handler(req, res) {
    // Configuration CORS pour permettre les appels depuis votre frontend
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Gérer les requêtes OPTIONS (preflight)
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Récupérer le token depuis les variables d'environnement Vercel
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

    if (!GITHUB_TOKEN) {
        console.error('❌ GITHUB_TOKEN non configuré dans Vercel');
        return res.status(500).json({
            error: 'Token GitHub non configuré',
            message: 'Veuillez configurer GITHUB_TOKEN dans les variables d\'environnement Vercel'
        });
    }

    // Configuration GitHub (à synchroniser avec votre frontend)
    const GITHUB_CONFIG = {
        owner: 'migso-pcubed-mkt-com',
        repo: 'Marketing-Dashboard',
        branch: 'main',
        path: 'data.json'
    };

    try {
        // GET - Charger les données depuis GitHub
        if (req.method === 'GET') {
            console.log('📥 GET request - Loading from GitHub...');

            const url = `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${GITHUB_CONFIG.path}?ref=${GITHUB_CONFIG.branch}`;

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${GITHUB_TOKEN}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Cache-Control': 'no-cache'
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('GitHub API error:', response.status, errorText);

                return res.status(response.status).json({
                    error: `GitHub API error: ${response.status}`,
                    details: errorText
                });
            }

            const data = await response.json();
            console.log('✅ Loaded from GitHub. SHA:', data.sha.substring(0, 8));

            return res.status(200).json(data);
        }

        // PUT - Sauvegarder les données vers GitHub
        if (req.method === 'PUT') {
            console.log('💾 PUT request - Saving to GitHub...');

            const { content, message, sha } = req.body;

            if (!content || !message) {
                return res.status(400).json({
                    error: 'Missing required fields',
                    message: 'content and message are required'
                });
            }

            const url = `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${GITHUB_CONFIG.path}`;

            const body = {
                message,
                content,
                branch: GITHUB_CONFIG.branch
            };

            // Ajouter le SHA si fourni (pour les updates)
            if (sha) {
                body.sha = sha;
            }

            console.log('Saving with SHA:', sha ? sha.substring(0, 8) + '...' : 'none (new file)');

            const response = await fetch(url, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${GITHUB_TOKEN}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const errorText = await response.text();
                let errorDetails;
                try {
                    errorDetails = JSON.parse(errorText);
                } catch (e) {
                    errorDetails = { message: errorText };
                }

                console.error('GitHub save error:', response.status, errorDetails);

                return res.status(response.status).json({
                    error: `GitHub save error: ${response.status}`,
                    details: errorDetails
                });
            }

            const data = await response.json();
            console.log('✅ Saved to GitHub. New SHA:', data.content.sha.substring(0, 8));

            return res.status(200).json(data);
        }

        // Méthode non supportée
        return res.status(405).json({
            error: 'Method not allowed',
            message: `Method ${req.method} is not supported. Use GET or PUT.`
        });

    } catch (error) {
        console.error('❌ Serverless function error:', error);
        return res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
}
