// Vercel Serverless Function - Guest Authentication

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method === 'POST') {
        const { action, password } = req.body || {};

        if (action === 'verifyGuest') {
            const GUEST_PASSWORD = process.env.GUEST_PASSWORD;
            if (!GUEST_PASSWORD) {
                // No password configured — guest access disabled
                return res.status(503).json({ error: 'Guest access not configured' });
            }
            if (password === GUEST_PASSWORD) {
                return res.status(200).json({ valid: true });
            }
            return res.status(401).json({ error: 'Invalid password' });
        }

        return res.status(400).json({ error: 'Invalid action' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
