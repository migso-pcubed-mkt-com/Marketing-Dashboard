(function() {
    var hash = window.location.hash;
    var token = '';
    if (hash && hash.indexOf('#token=') === 0) {
        token = hash.substring(7);
    }
    if (!token) {
        document.querySelector('.msg p').textContent = 'No token received. Please try again.';
        return;
    }

    var delivered = false;

    // Trello sets Cross-Origin-Opener-Policy on its auth page, which severs
    // window.opener even after redirect back to same-origin. Use three channels
    // in parallel so at least one reaches the main window.
    try {
        if (window.opener) {
            window.opener.postMessage({ trelloToken: token }, window.location.origin);
            delivered = true;
        }
    } catch (e) {}

    try {
        if (typeof BroadcastChannel !== 'undefined') {
            var bc = new BroadcastChannel('mkt_trello_oauth');
            bc.postMessage({ trelloToken: token });
            delivered = true;
            setTimeout(function() { try { bc.close(); } catch (e) {} }, 200);
        }
    } catch (e) {}

    try {
        localStorage.setItem('mkt_trello_oauth_token', JSON.stringify({ token: token, at: Date.now() }));
        delivered = true;
    } catch (e) {}

    if (delivered) {
        setTimeout(function() { window.close(); }, 500);
    } else {
        document.querySelector('.msg p').textContent = 'Could not communicate with the parent window.';
    }
})();
