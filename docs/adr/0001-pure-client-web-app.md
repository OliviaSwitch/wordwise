# Pure-client web application

WordWise runs entirely in the browser with no backend server. The Gloss Pack (~1.8MB) is loaded client-side, and all text processing (tokenization, lemmatization, ruby injection) happens in JavaScript. Documents are stored in IndexedDB. The app is hosted on GitHub Pages as static files.

This avoids server costs, eliminates privacy concerns (user reading content never leaves their device), and sidesteps the legal complexity of proxying third-party content. The trade-off is that features requiring server-side fetching (URL input, RSS) are deferred until a lightweight CORS proxy is introduced.
