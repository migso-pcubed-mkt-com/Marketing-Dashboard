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

    const ghGetHeaders = {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Cache-Control': 'no-cache'
    };
    const apiRoot = `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}`;

    // The Contents API only inlines base64 content for files < 1 MB. Between 1 and
    // 100 MB it returns the metadata (sha/size) with an empty content field — and some
    // media types reject the request entirely. data.json exceeds 1 MB, so resolve the
    // sha via the parent directory listing (no size limit) and the content via the Git
    // Blobs API (base64 up to 100 MB).
    const fetchShaFromDirListing = async () => {
        const dir = GITHUB_CONFIG.path.includes('/') ? GITHUB_CONFIG.path.slice(0, GITHUB_CONFIG.path.lastIndexOf('/')) : '';
        const listResp = await fetch(`${apiRoot}/contents/${dir}?ref=${GITHUB_CONFIG.branch}`, { headers: ghGetHeaders });
        if (!listResp.ok) return null;
        const entries = await listResp.json();
        const entry = Array.isArray(entries) && entries.find(e => e.path === GITHUB_CONFIG.path);
        return entry ? { sha: entry.sha, size: entry.size } : null;
    };

    const fetchBlobBase64 = async (sha) => {
        const blobResp = await fetch(`${apiRoot}/git/blobs/${sha}`, { headers: ghGetHeaders });
        if (!blobResp.ok) return null;
        const blob = await blobResp.json();
        return blob && blob.encoding === 'base64' ? blob.content : null;
    };

    // Make expired/revoked token failures self-explanatory for the client banner.
    const tokenHint = (status) => (status === 401 || status === 403)
        ? ' — GITHUB_TOKEN in Vercel is likely expired or revoked; regenerate it in GitHub and update the Vercel environment variable'
        : '';

    try {
        // GET - Load data from GitHub
        if (req.method === 'GET') {
            console.log('📥 GET request - Loading from GitHub...');

            const url = `${apiRoot}/contents/${GITHUB_CONFIG.path}?ref=${GITHUB_CONFIG.branch}`;
            const response = await fetch(url, { method: 'GET', headers: ghGetHeaders });

            let data = null;
            if (response.ok) {
                data = await response.json();
            } else if (response.status !== 404) {
                // Non-404 failure (e.g. 403 "too_large" on big files): try the
                // dir-listing + blob route before giving up.
                const meta = await fetchShaFromDirListing();
                if (meta) data = { sha: meta.sha, size: meta.size, content: '' };
            }

            if (!data) {
                const errorText = response.ok ? '' : await response.text().catch(() => '');
                console.error('GitHub API error:', response.status, errorText);
                return res.status(response.status).json({
                    error: `GitHub API error: ${response.status}${tokenHint(response.status)}`,
                    details: errorText
                });
            }

            // Large file (1-100 MB): content comes back empty — fetch it via the Blobs API.
            if (!data.content && data.sha) {
                const blobContent = await fetchBlobBase64(data.sha);
                if (blobContent) {
                    data.content = blobContent;
                    data.encoding = 'base64';
                } else {
                    console.error('GitHub blob fetch failed for sha', data.sha?.substring(0, 8));
                    return res.status(502).json({
                        error: 'GitHub blob fetch failed',
                        details: `File ${GITHUB_CONFIG.path} is larger than 1 MB and the blob API call failed`
                    });
                }
            }

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

            const url = `${apiRoot}/contents/${GITHUB_CONFIG.path}`;
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
                    // File GET can fail or omit sha handling for files > 1 MB — the
                    // directory listing always returns the sha regardless of file size.
                    let latestSha = null;
                    const latest = await fetch(`${url}?ref=${GITHUB_CONFIG.branch}`, { method: 'GET', headers: ghGetHeaders });
                    if (latest.ok) {
                        latestSha = (await latest.json()).sha;
                    } else {
                        const meta = await fetchShaFromDirListing();
                        latestSha = meta?.sha || null;
                    }
                    if (latestSha) {
                        console.warn('⚠️ GitHub SHA conflict — retrying with latest SHA', latestSha.substring(0, 8));
                        response = await putWithSha(latestSha);
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
                    error: `GitHub save error: ${response.status}${tokenHint(response.status)}`,
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
