// Vercel Serverless Function - Trello API Proxy
// Keeps TRELLO_API_KEY and TRELLO_TOKEN server-side

const TRELLO_BASE = 'https://api.trello.com/1';

export default async function handler(req, res) {
    // CORS configuration — restrict to known origins in production
    const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
    const origin = req.headers.origin || '';
    const corsOrigin = allowedOrigin === '*' || origin.includes('localhost')
        ? (origin || '*')
        : (origin === allowedOrigin ? allowedOrigin : allowedOrigin);
    res.setHeader('Access-Control-Allow-Origin', corsOrigin);
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
                fetch(`${TRELLO_BASE}/boards/${boardId}/cards?${authParams}&fields=name,desc,due,start,dueComplete,dateLastActivity,idList,idLabels,idMembers,pos,closed&filter=all&checklists=all&attachments=true&attachment_fields=name,url,mimeType,date`),
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
            console.log(`Adding checklist "${checklistName}" to card ${cid} with ${items?.length || 0} items...`);

            // Create checklist
            const clRes = await fetch(`${TRELLO_BASE}/cards/${cid}/checklists?${authParams}&name=${encodeURIComponent(checklistName || 'Checklist')}`, {
                method: 'POST'
            });
            if (!clRes.ok) {
                const err = await clRes.text();
                console.error('Trello checklist creation error:', clRes.status, err);
                return res.status(clRes.status).json({ error: 'Trello checklist error', details: err });
            }
            const checklist = await clRes.json();
            console.log(`Created checklist "${checklist.name}" (${checklist.id})`);

            // Add items to checklist
            const createdItems = [];
            if (items && Array.isArray(items)) {
                for (const item of items) {
                    const checked = item.done ? 'true' : 'false';
                    try {
                        const itemRes = await fetch(`${TRELLO_BASE}/checklists/${checklist.id}/checkItems?${authParams}&name=${encodeURIComponent(item.text)}&checked=${checked}`, {
                            method: 'POST'
                        });
                        if (itemRes.ok) {
                            const itemData = await itemRes.json();
                            createdItems.push(itemData);
                            console.log(`  ✓ Added checkItem "${item.text}" (${itemData.id})`);
                        } else {
                            const errText = await itemRes.text();
                            console.error(`  ✗ Failed to add checkItem "${item.text}": ${itemRes.status} ${errText}`);
                        }
                    } catch (e) {
                        console.error(`  ✗ Network error adding checkItem "${item.text}":`, e.message);
                    }
                }
            }
            console.log(`Checklist "${checklist.name}": ${createdItems.length}/${items?.length || 0} items created`);
            return res.status(201).json({ ...checklist, checkItems: createdItems, itemsCreated: createdItems.length });
        }

        // POST /api/trello?action=addChecklistItems — Add items to an EXISTING checklist
        if (req.method === 'POST' && action === 'addChecklistItems') {
            const { checklistId, items } = req.body;
            if (!checklistId) return res.status(400).json({ error: 'checklistId required' });
            if (!items || !Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'items required' });
            console.log(`Adding ${items.length} items to checklist ${checklistId}...`);

            const results = [];
            for (const item of items) {
                const checked = item.done ? 'true' : 'false';
                try {
                    const itemRes = await fetch(`${TRELLO_BASE}/checklists/${checklistId}/checkItems?${authParams}&name=${encodeURIComponent(item.text)}&checked=${checked}`, {
                        method: 'POST'
                    });
                    if (itemRes.ok) {
                        results.push(await itemRes.json());
                    } else {
                        const errText = await itemRes.text();
                        console.error(`Failed to add checkItem "${item.text}": ${itemRes.status} ${errText}`);
                    }
                } catch (e) {
                    console.error('Failed to add checklist item:', e);
                }
            }
            return res.status(201).json({ checklistId, itemsAdded: results.length, items: results });
        }

        // PUT /api/trello?action=updateCheckItem — Update a checklist item (state, name, due, idMember, pos)
        if (req.method === 'POST' && action === 'updateCheckItem') {
            const { cardId: cid, checkItemId, state: itemState, name: itemName, due: itemDue, idMember: itemMember, pos: itemPos } = req.body;
            if (!cid || !checkItemId) return res.status(400).json({ error: 'cardId and checkItemId required' });
            const params = new URLSearchParams();
            params.append('key', TRELLO_API_KEY);
            params.append('token', TRELLO_TOKEN);
            if (itemState) params.append('state', itemState === 'complete' ? 'complete' : 'incomplete');
            if (itemName !== undefined && itemName !== null) params.append('name', itemName);
            if (itemDue !== undefined) params.append('due', itemDue === null ? '' : itemDue);
            if (itemMember !== undefined) params.append('idMember', itemMember === null ? '' : itemMember);
            if (itemPos !== undefined && itemPos !== null) params.append('pos', String(itemPos));
            console.log(`Updating checkItem ${checkItemId} on card ${cid}...`);
            const resp = await fetch(`${TRELLO_BASE}/cards/${cid}/checkItem/${checkItemId}?${params.toString()}`, { method: 'PUT' });
            if (!resp.ok) {
                const errText = await resp.text();
                console.error('Trello API error:', resp.status, errText);
                return res.status(resp.status).json({ error: errText });
            }
            const data = await resp.json();
            return res.status(200).json(data);
        }

        // PUT /api/trello?action=updateChecklist — Update a checklist (name, pos)
        if (req.method === 'POST' && action === 'updateChecklist') {
            const { checklistId: clId, name: clName, pos: clPos } = req.body;
            if (!clId) return res.status(400).json({ error: 'checklistId required' });
            const params = new URLSearchParams();
            params.append('key', TRELLO_API_KEY);
            params.append('token', TRELLO_TOKEN);
            if (clName !== undefined && clName !== null) params.append('name', clName);
            if (clPos !== undefined && clPos !== null) params.append('pos', String(clPos));
            const resp = await fetch(`${TRELLO_BASE}/checklists/${clId}?${params.toString()}`, { method: 'PUT' });
            if (!resp.ok) {
                const errText = await resp.text();
                console.error('Trello API error:', resp.status, errText);
                return res.status(resp.status).json({ error: errText });
            }
            const data = await resp.json();
            return res.status(200).json(data);
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

        // POST /api/trello?action=createBoardLabel — Create a label on a board
        if (req.method === 'POST' && action === 'createBoardLabel') {
            const { boardId: bid, name: labelName, color: labelColor } = req.body;
            if (!bid) return res.status(400).json({ error: 'boardId required' });
            console.log(`Creating label "${labelName}" (${labelColor}) on board ${bid}...`);
            const params = new URLSearchParams({ name: labelName || '' });
            if (labelColor) params.append('color', labelColor);
            const response = await fetch(`${TRELLO_BASE}/boards/${bid}/labels?${authParams}&${params.toString()}`, { method: 'POST' });
            if (!response.ok) {
                const err = await response.text();
                return res.status(response.status).json({ error: 'Trello create label error', details: err });
            }
            const label = await response.json();
            console.log(`Created label "${label.name}" (${label.id})`);
            return res.status(201).json(label);
        }

        // POST /api/trello?action=addCardLabel — Add a label to a card
        if (req.method === 'POST' && action === 'addCardLabel') {
            const { cardId: cid, labelId: lid } = req.body;
            if (!cid || !lid) return res.status(400).json({ error: 'cardId and labelId required' });
            console.log(`Adding label ${lid} to card ${cid}...`);
            const response = await fetch(`${TRELLO_BASE}/cards/${cid}/idLabels?${authParams}&value=${lid}`, { method: 'POST' });
            if (!response.ok) {
                const err = await response.text();
                // 409 = already has this label, which is fine
                if (response.status === 409) return res.status(200).json({ already: true, cardId: cid, labelId: lid });
                return res.status(response.status).json({ error: 'Trello add label error', details: err });
            }
            return res.status(200).json({ added: true, cardId: cid, labelId: lid });
        }

        // DELETE /api/trello?action=removeCardLabel — Remove a label from a card
        if (req.method === 'DELETE' && action === 'removeCardLabel') {
            const cid = req.query.cardId || req.body?.cardId;
            const lid = req.query.labelId || req.body?.labelId;
            if (!cid || !lid) return res.status(400).json({ error: 'cardId and labelId required' });
            console.log(`Removing label ${lid} from card ${cid}...`);
            const response = await fetch(`${TRELLO_BASE}/cards/${cid}/idLabels/${lid}?${authParams}`, { method: 'DELETE' });
            if (!response.ok) {
                const err = await response.text();
                return res.status(response.status).json({ error: 'Trello remove label error', details: err });
            }
            return res.status(200).json({ removed: true, cardId: cid, labelId: lid });
        }

        // DELETE /api/trello?action=deleteChecklist — Delete an entire checklist
        if (req.method === 'DELETE' && action === 'deleteChecklist') {
            const checklistId = req.query.checklistId || req.body?.checklistId;
            if (!checklistId) return res.status(400).json({ error: 'checklistId required' });
            console.log(`Deleting Trello checklist ${checklistId}...`);
            const response = await fetch(`${TRELLO_BASE}/checklists/${checklistId}?${authParams}`, { method: 'DELETE' });
            if (!response.ok) {
                const err = await response.text();
                return res.status(response.status).json({ error: 'Trello delete checklist error', details: err });
            }
            return res.status(200).json({ deleted: true, checklistId });
        }

        // DELETE /api/trello?action=deleteChecklistItem — Delete a single checklist item
        if (req.method === 'DELETE' && action === 'deleteChecklistItem') {
            const cklId = req.query.checklistId || req.body?.checklistId;
            const itemId = req.query.itemId || req.body?.itemId;
            if (!cklId || !itemId) return res.status(400).json({ error: 'checklistId and itemId required' });
            console.log(`Deleting checklist item ${itemId} from checklist ${cklId}...`);
            const response = await fetch(`${TRELLO_BASE}/checklists/${cklId}/checkItems/${itemId}?${authParams}`, { method: 'DELETE' });
            if (!response.ok) {
                const err = await response.text();
                return res.status(response.status).json({ error: 'Trello delete checkItem error', details: err });
            }
            return res.status(200).json({ deleted: true, checklistId: cklId, itemId });
        }

        // DELETE /api/trello?action=deleteAttachment — Delete an attachment from a card
        if (req.method === 'DELETE' && action === 'deleteAttachment') {
            const cid = req.query.cardId || req.body?.cardId;
            const attId = req.query.attachmentId || req.body?.attachmentId;
            if (!cid || !attId) return res.status(400).json({ error: 'cardId and attachmentId required' });
            console.log(`Deleting attachment ${attId} from card ${cid}...`);
            const response = await fetch(`${TRELLO_BASE}/cards/${cid}/attachments/${attId}?${authParams}`, { method: 'DELETE' });
            if (!response.ok) {
                const err = await response.text();
                return res.status(response.status).json({ error: 'Trello delete attachment error', details: err });
            }
            return res.status(200).json({ deleted: true, cardId: cid, attachmentId: attId });
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

        // PUT /api/trello?action=updateList — Update a list (name, pos)
        if (req.method === 'PUT' && action === 'updateList') {
            const { listId: lid, updates } = req.body;
            if (!lid || !updates) return res.status(400).json({ error: 'listId and updates required' });
            console.log(`Updating Trello list ${lid}...`, updates);
            const cleanUpdates = {};
            for (const [k, v] of Object.entries(updates)) {
                if (v != null) cleanUpdates[k] = String(v);
            }
            const params = new URLSearchParams(cleanUpdates);
            const response = await fetch(`${TRELLO_BASE}/lists/${lid}?${authParams}&${params.toString()}`, { method: 'PUT' });
            if (!response.ok) {
                const err = await response.text();
                return res.status(response.status).json({ error: 'Trello update list error', details: err });
            }
            const list = await response.json();
            console.log(`Updated list "${list.name}"`);
            return res.status(200).json(list);
        }

        // POST /api/trello?action=createList — Create a list on a board
        if (req.method === 'POST' && action === 'createList') {
            const { boardId: bid, name: listName, pos: listPos } = req.body;
            if (!bid || !listName) return res.status(400).json({ error: 'boardId and name required' });
            console.log(`Creating list "${listName}" on board ${bid}...`);
            const params = new URLSearchParams({ name: listName });
            if (listPos != null) params.append('pos', String(listPos));
            const response = await fetch(`${TRELLO_BASE}/boards/${bid}/lists?${authParams}&${params.toString()}`, { method: 'POST' });
            if (!response.ok) {
                const err = await response.text();
                return res.status(response.status).json({ error: 'Trello create list error', details: err });
            }
            const list = await response.json();
            console.log(`Created list "${list.name}" (${list.id})`);
            return res.status(201).json(list);
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
