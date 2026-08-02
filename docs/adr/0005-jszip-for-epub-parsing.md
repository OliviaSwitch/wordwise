# JSZip for EPUB parsing instead of epub.js

EPUB files are parsed with JSZip (unzip) + manual OPF/HTML extraction rather than epub.js. The built-in reader is a simple scrolling preview for annotation interaction (adding words to Blacklist/Whitelist), not a full reading experience — the real reading happens in a dedicated EPUB reader after export. epub.js provides pagination, bookmarks, and rendering features that are unnecessary here and would add unused weight.
