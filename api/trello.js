// Vercel Serverless Function - Trello API Proxy
// Keeps TRELLO_API_KEY and TRELLO_TOKEN server-side

const TRELLO_BASE = 'https://api.trello.com/1';

export default async function handler(req, res) {
    // CORS configuration
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Trello-Token');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const TRELLO_API_KEY = process.env.TRELLO_API_KEY;
    const TRELLO_TOKEN_ENV = process.env.TRELLO_TOKEN;

    // Use per-user token from header if present, otherwise fall back to env var
    const userToken = req.headers['x-trello-token'];
    const TRELLO_TOKEN = userToken || TRELLO_TOKEN_ENV;

    const { action, boardId, cardId, listId } = req.method === 'GET' || req.method === 'DELETE'
        ? req.query
        : { ...req.query, ...req.body };

    // GET /api/trello?action=config — Return app key (public) for OAuth
    if (req.method === 'GET' && action === 'config') {
        if (!TRELLO_API_KEY) {
            return res.status(500).json({ error: 'Trello API key not configured' });
        }
        return res.status(200).json({ appKey: TRELLO_API_KEY });
    }

    // GET /api/trello?action=me — Return current member profile (requires token)
    if (req.method === 'GET' && action === 'me') {
        console.log('Trello /me: hasApiKey:', !!TRELLO_API_KEY, 'apiKeyLen:', TRELLO_API_KEY?.length, 'hasToken:', !!TRELLO_TOKEN, 'tokenLen:', TRELLO_TOKEN?.length, 'tokenSource:', userToken ? 'header' : 'env');
        if (!TRELLO_API_KEY) {
            return res.status(500).json({ error: 'Trello API key not configured on server', hasApiKey: false, hasToken: !!TRELLO_TOKEN });
        }
        if (!TRELLO_TOKEN) {
            return res.status(401).json({ error: 'No token provided', hasApiKey: true, hasToken: false });
        }
        const authParams = `key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`;
        const url = `${TRELLO_BASE}/members/me?${authParams}&fields=id,fullName,username,avatarUrl`;
        const response = await fetch(url);
        if (!response.ok) {
            const errBody = await response.text().catch(() => '');
            console.error('Trello /members/me error:', response.status, errBody, 'tokenLen:', TRELLO_TOKEN.length);
            return res.status(response.status).json({
                error: 'Trello rejected the token',
                details: errBody,
                trelloStatus: response.status,
                tokenLength: TRELLO_TOKEN.length,
                hint: TRELLO_TOKEN.length < 64 ? 'Token seems too short — Trello tokens are typically 64 hex chars. The verification code shown on screen may not be the full API token.' : null
            });
        }
        const member = await response.json();
        return res.status(200).json(member);
    }

    if (!TRELLO_API_KEY || !TRELLO_TOKEN) {
        console.error('Trello credentials not configured');
        return res.status(500).json({
            error: 'Trello not configured',
            message: 'Please configure TRELLO_API_KEY and TRELLO_TOKEN in Vercel environment variables'
        });
    }

    const authParams = `key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`;

    try {
        // GET /api/trello?action=boards — List user's boards
        if (req.method === 'GET' && action === 'boards') {
            console.log('Fetching Trello boards...');
            const url = `${TRELLO_BASE}/members/me/boards?${authParams}&fields=name,desc,dateLastActivity,url,closed&filter=open`;
            const response = await fetch(url);
            if (!response.ok) {
                const err = await response.text();
                console.error('Trello API error:', response.status, err);
                return res.status(response.status).json({ error: 'Trello API error', details: err });
            }
            const boards = await response.json();
            console.log(`Fetched ${boards.length} Trello boards`);
            return res.status(200).json(boards);
        }

        // GET /api/trello?action=board&boardId=XXX — Full board data
        if (req.method === 'GET' && action === 'board') {
            if (!boardId) return res.status(400).json({ error: 'boardId required' });
            console.log(`Fetching Trello board ${boardId}...`);

            // Fetch board, lists, labels, cards (with checklists + attachments), members in parallel
            const [boardRes, listsRes, labelsRes, cardsRes, membersRes] = await Promise.all([
                fetch(`${TRELLO_BASE}/boards/${boardId}?${authParams}&fields=name,desc,dateLastActivity,url`),
                fetch(`${TRELLO_BASE}/boards/${boardId}/lists?${authParams}&fields=name,pos,closed&filter=open`),
                fetch(`${TRELLO_BASE}/boards/${boardId}/labels?${authParams}&fields=name,color`),
                fetch(`${TRELLO_BASE}/boards/${boardId}/cards?${authParams}&fields=name,desc,due,dueComplete,dateLastActivity,idList,idLabels,idMembers,pos,closed&filter=open&checklists=all&attachments=true&attachment_fields=name,url,mimeType,date`),
                fetch(`${TRELLO_BASE}/boards/${boardId}/members?${authParams}&fields=fullName,username,avatarUrl`)
            ]);

            if (!boardRes.ok || !listsRes.ok || !labelsRes.ok || !cardsRes.ok) {
                const errors = [];
                if (!boardRes.ok) errors.push(`board: ${boardRes.status}`);
                if (!listsRes.ok) errors.push(`lists: ${listsRes.status}`);
                if (!labelsRes.ok) errors.push(`labels: ${labelsRes.status}`);
                if (!cardsRes.ok) errors.push(`cards: ${cardsRes.status}`);
                return res.status(502).json({ error: 'Trello API error', details: errors.join(', ') });
            }

            const [board, lists, labels, cards] = await Promise.all([
                boardRes.json(), listsRes.json(), labelsRes.json(), cardsRes.json()
            ]);
            const members = membersRes.ok ? await membersRes.json() : [];

            // Fetch comments for each card (Trello API requires per-card fetch for actions)
            // Batch in groups of 10 to respect rate limits
            const cardComments = {};
            const batchSize = 10;
            for (let i = 0; i < cards.length; i += batchSize) {
                const batch = cards.slice(i, i + batchSize);
                const commentResults = await Promise.all(
                    batch.map(card =>
                        fetch(`${TRELLO_BASE}/cards/${card.id}/actions?${authParams}&filter=commentCard&fields=data,date,memberCreator`)
                            .then(r => r.ok ? r.json() : [])
                            .catch(() => [])
                    )
                );
                batch.forEach((card, idx) => {
                    cardComments[card.id] = commentResults[idx];
                });
            }

            // Attach comments to cards
            for (const card of cards) {
                card.comments = cardComments[card.id] || [];
            }

            console.log(`Board "${board.name}": ${lists.length} lists, ${labels.length} labels, ${cards.length} cards, ${members.length} members`);
            return res.status(200).json({ board, lists, labels, cards, members });
        }

        // PUT /api/trello?action=updateCard — Update a card
        if (req.method === 'PUT' && action === 'updateCard') {
            const { cardId: cid, updates } = req.body;
            if (!cid || !updates) return res.status(400).json({ error: 'cardId and updates required' });
            console.log(`Updating Trello card ${cid}...`, updates);

            // Convert all values to strings for URLSearchParams
            const cleanUpdates = {};
            for (const [k, v] of Object.entries(updates)) {
                if (v != null) cleanUpdates[k] = String(v);
            }
            const params = new URLSearchParams(cleanUpdates);
            const url = `${TRELLO_BASE}/cards/${cid}?${authParams}&${params.toString()}`;
            const response = await fetch(url, { method: 'PUT' });
            if (!response.ok) {
                const err = await response.text();
                console.error(`Trello update error for card ${cid}:`, response.status, err);
                return res.status(response.status).json({ error: 'Trello update error', details: err });
            }
            const card = await response.json();
            console.log(`Updated card "${card.name}"`);
            return res.status(200).json(card);
        }

        // POST /api/trello?action=createCard — Create a card
        if (req.method === 'POST' && action === 'createCard') {
            const { listId: lid, name, desc, due, idLabels } = req.body;
            if (!lid || !name) return res.status(400).json({ error: 'listId and name required' });
            console.log(`Creating Trello card in list ${lid}...`);

            const body = { idList: lid, name, desc: desc || '', key: TRELLO_API_KEY, token: TRELLO_TOKEN };
            if (due) body.due = due;
            if (idLabels) body.idLabels = idLabels;

            const response = await fetch(`${TRELLO_BASE}/cards`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (!response.ok) {
                const err = await response.text();
                return res.status(response.status).json({ error: 'Trello create error', details: err });
            }
            const card = await response.json();
            console.log(`Created card "${card.name}" (${card.id})`);
            return res.status(201).json(card);
        }

        // POST /api/trello?action=addComment — Add a comment to a card
        if (req.method === 'POST' && action === 'addComment') {
            const { cardId: cid, text } = req.body;
            if (!cid || !text) return res.status(400).json({ error: 'cardId and text required' });
            console.log(`Adding comment to card ${cid}...`);

            const response = await fetch(`${TRELLO_BASE}/cards/${cid}/actions/comments?${authParams}&text=${encodeURIComponent(text)}`, {
                method: 'POST'
            });
            if (!response.ok) {
                const err = await response.text();
                return res.status(response.status).json({ error: 'Trello comment error', details: err });
            }
            const comment = await response.json();
            return res.status(201).json(comment);
        }

        // POST /api/trello?action=addChecklist — Add a checklist to a card
        if (req.method === 'POST' && action === 'addChecklist') {
            const { cardId: cid, name: checklistName, items } = req.body;
            if (!cid) return res.status(400).json({ error: 'cardId required' });
            console.log(`Adding checklist to card ${cid}...`);

            // Create checklist
            const clRes = await fetch(`${TRELLO_BASE}/cards/${cid}/checklists?${authParams}&name=${encodeURIComponent(checklistName || 'Checklist')}`, {
                method: 'POST'
            });
            if (!clRes.ok) {
                const err = await clRes.text();
                return res.status(clRes.status).json({ error: 'Trello checklist error', details: err });
            }
            const checklist = await clRes.json();

            // Add items to checklist
            if (items && Array.isArray(items)) {
                for (const item of items) {
                    const checked = item.done ? 'complete' : 'incomplete';
                    await fetch(`${TRELLO_BASE}/checklists/${checklist.id}/checkItems?${authParams}&name=${encodeURIComponent(item.text)}&checked=${checked}`, {
                        method: 'POST'
                    }).catch(e => console.error('Failed to add checklist item:', e));
                }
            }
            return res.status(201).json(checklist);
        }

        // POST /api/trello?action=addChecklistItems — Add items to an EXISTING checklist
        if (req.method === 'POST' && action === 'addChecklistItems') {
            const { checklistId, items } = req.body;
            if (!checklistId) return res.status(400).json({ error: 'checklistId required' });
            if (!items || !Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'items required' });
            console.log(`Adding ${items.length} items to checklist ${checklistId}...`);

            const results = [];
            for (const item of items) {
                const checked = item.done ? 'complete' : 'incomplete';
                try {
                    const itemRes = await fetch(`${TRELLO_BASE}/checklists/${checklistId}/checkItems?${authParams}&name=${encodeURIComponent(item.text)}&checked=${checked}`, {
                        method: 'POST'
                    });
                    if (itemRes.ok) results.push(await itemRes.json());
                } catch (e) {
                    console.error('Failed to add checklist item:', e);
                }
            }
            return res.status(201).json({ checklistId, itemsAdded: results.length, items: results });
        }

        // POST /api/trello?action=uploadAttachment — Upload a file (base64) to a Trello card
        if (req.method === 'POST' && action === 'uploadAttachment') {
            const { cardId: cid, data: base64Data, name: fileName, mimeType } = req.body;
            if (!cid || !base64Data) return res.status(400).json({ error: 'cardId and data required' });
            console.log(`Uploading attachment "${fileName}" to card ${cid}...`);

            // Strip data URL prefix if present
            const raw = base64Data.replace(/^data:[^;]+;base64,/, '');
            const buffer = Buffer.from(raw, 'base64');

            // Build multipart form data
            const boundary = '----TrelloUpload' + Date.now();
            const parts = [];
            parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="key"\r\n\r\n${TRELLO_API_KEY}`);
            parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="token"\r\n\r\n${TRELLO_TOKEN}`);
            parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="name"\r\n\r\n${fileName || 'attachment'}`);
            // File part
            const fileHeader = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName || 'attachment'}"\r\nContent-Type: ${mimeType || 'application/octet-stream'}\r\n\r\n`;
            const fileFooter = `\r\n--${boundary}--\r\n`;

            const bodyParts = Buffer.concat([
                Buffer.from(parts.join('\r\n') + '\r\n'),
                Buffer.from(fileHeader),
                buffer,
                Buffer.from(fileFooter)
            ]);

            const response = await fetch(`${TRELLO_BASE}/cards/${cid}/attachments`, {
                method: 'POST',
                headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
                body: bodyParts
            });
            if (!response.ok) {
                const err = await response.text();
                console.error('Trello upload error:', response.status, err);
                return res.status(response.status).json({ error: 'Trello upload error', details: err });
            }
            const attachment = await response.json();
            console.log(`Uploaded "${fileName}" → ${attachment.id}`);
            return res.status(201).json(attachment);
        }

        // POST /api/trello?action=addAttachment — Add a URL attachment to a card
        if (req.method === 'POST' && action === 'addAttachment') {
            const { cardId: cid, url: attUrl, name: attName } = req.body;
            if (!cid || !attUrl) return res.status(400).json({ error: 'cardId and url required' });
            console.log(`Adding attachment to card ${cid}...`);

            const params = new URLSearchParams({ url: attUrl });
            if (attName) params.append('name', attName);
            const response = await fetch(`${TRELLO_BASE}/cards/${cid}/attachments?${authParams}&${params.toString()}`, {
                method: 'POST'
            });
            if (!response.ok) {
                const err = await response.text();
                return res.status(response.status).json({ error: 'Trello attachment error', details: err });
            }
            const attachment = await response.json();
            return res.status(201).json(attachment);
        }

        // DELETE /api/trello?action=deleteCard&cardId=XXX
        if (req.method === 'DELETE' && action === 'deleteCard') {
            if (!cardId) return res.status(400).json({ error: 'cardId required' });
            console.log(`Deleting Trello card ${cardId}...`);

            const response = await fetch(`${TRELLO_BASE}/cards/${cardId}?${authParams}`, { method: 'DELETE' });
            if (!response.ok) {
                const err = await response.text();
                return res.status(response.status).json({ error: 'Trello delete error', details: err });
            }
            console.log(`Deleted card ${cardId}`);
            return res.status(200).json({ deleted: true });
        }

        return res.status(400).json({
            error: 'Invalid action',
            message: `Action "${action}" with method ${req.method} is not supported. Valid actions: boards (GET), board (GET), updateCard (PUT), createCard (POST), deleteCard (DELETE)`
        });

    } catch (error) {
        console.error('Trello serverless error:', error);
        return res.status(500).json({ error: 'Internal server error', message: error.message });
    }
}
