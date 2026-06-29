// Vercel Serverless Function - GitHub API Proxy
// This function secures your GitHub token by keeping it server-side

export default async function handler(req, res) {
    // CORS configuration — reflect any origin only when unrestricted (ALLOWED_ORIGIN
    // unset, i.e. dev); otherwise always return the configured origin so browsers block
    // others. (Previous code had a dead ternary + a spoofable localhost substring match.)
    const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
    const origin = req.headers.origin || '';
    const corsOrigin = allowedOrigin === '*' ? (origin || '*') : allowedOrigin;
    res.setHeader('Access-Control-Allow-Origin', corsOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle OPTIONS requests (preflight)
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Retrieve token from Vercel environment variables
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

    if (!GITHUB_TOKEN) {
        console.error('❌ GITHUB_TOKEN not configured in Vercel');
        return res.status(500).json({
            error: 'GitHub token not configured',
            message: 'Please configure GITHUB_TOKEN in Vercel environment variables'
        });
    }

    // GitHub configuration (sync with your frontend)
    const GITHUB_CONFIG = {
        owner: 'migso-pcubed-mkt-com',
        repo: 'Marketing-Dashboard',
        branch: 'main',
        path: 'data.json'
    };

    try {
        // GET - Load data from GitHub
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

        // PUT - Save data to GitHub
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
            const ghHeaders = {
                'Authorization': `Bearer ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            };

            const putWithSha = (useSha) => {
                const body = { message, content, branch: GITHUB_CONFIG.branch };
                if (useSha) body.sha = useSha;
                return fetch(url, { method: 'PUT', headers: ghHeaders, body: JSON.stringify(body) });
            };

            console.log('Saving with SHA:', sha ? sha.substring(0, 8) + '...' : 'none (new file)');
            let response = await putWithSha(sha);

            // Auto-resolve SHA conflicts: GitHub returns 409 (or 422 when the supplied sha
            // is stale) if another writer updated data.json since we read the SHA. Re-fetch
            // the latest SHA and retry once (last-write-wins; the app merges before saving).
            if (response.status === 409 || response.status === 422) {
                try {
                    const latest = await fetch(`${url}?ref=${GITHUB_CONFIG.branch}`, {
                        method: 'GET',
                        headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json', 'Cache-Control': 'no-cache' }
                    });
                    if (latest.ok) {
                        const latestData = await latest.json();
                        console.warn('⚠️ GitHub SHA conflict — retrying with latest SHA', latestData.sha?.substring(0, 8));
                        response = await putWithSha(latestData.sha);
                    }
                } catch (e) {
                    console.error('SHA conflict re-fetch failed:', e.message);
                }
            }

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

        // Method not supported
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
