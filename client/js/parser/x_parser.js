// x_parser.js
import { ParserInterface } from './parser_interface.js';

// X/Twitter-specific regex patterns
const X_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:x\.com|twitter\.com)\/([a-zA-Z0-9_-]{4,15})/i;

// Define comprehensive reserved paths list
const RESERVED_PATHS = [
    'home', 'explore', 'notifications', 'messages',
    'search', 'settings', 'i', 'compose', 'admin',
    'help', 'about', 'privacy', 'terms', 'downloads',
    'bookmarks', 'lists', 'topics', 'moments'
];

export class XParser extends ParserInterface {
    constructor() {
        super();
        this.name = 'XParser';
        this.supportedKeys = ['profile', 'handle', 'name', 'bio'];
    }

    async checkPageMatch(url) {
        const testUrl = url || window.location.href;
        if (!X_REGEX.test(testUrl)) {
            return false;
        }
        // Extract path from URL
        const urlPath = new URL(testUrl).pathname.slice(1);
        // Check if path is one of the reserved paths
        return !RESERVED_PATHS.includes(urlPath.toLowerCase());
    }

    async parse(state) {
        if (!this.checkPageMatch()) return;

        const data = {};

        // Extract X/Twitter profile data for client creation
        const nameEl = document.querySelector('[data-testid="UserName"]') ||
                      document.querySelector('[data-testid="UserProfileHeader-Name"]');
        if (nameEl) data.name = nameEl.textContent?.trim();

        const handleEl = document.querySelector('[data-testid="UserName"]') ||
                        document.querySelector('[role="link"]');
        if (handleEl) {
            const handle = handleEl.textContent?.trim();
            if (handle?.startsWith('@')) data.handle = handle;
        }

        const bioEl = document.querySelector('[data-testid="UserDescription"]') ||
                     document.querySelector('[data-testid="UserProfileHeader-bio"]');
        if (bioEl) data.notes = bioEl.textContent?.trim();

        const locationEl = document.querySelector('[data-testid="user-location"]') ||
                          document.querySelector('[role="link"] + span');
        if (locationEl) data.location = locationEl.textContent?.trim();

        const websiteEl = document.querySelector('[data-testid="user-website"] a');
        if (websiteEl) data.www = websiteEl.href;

        // Set profile URL for client record
        const profileUrl = this._getProfileUrl();
        if (profileUrl) data.linkedin = profileUrl;

        // Update state with extracted client data
        Object.entries(data).forEach(([k, v]) => {
            if (v !== null && v !== undefined && v !== '') {
                state.set(k, v);
            }
        });
    }

    // Helper method for profile URL extraction
    _getProfileUrl() {
        // Check URL first (most reliable)
        const url = window.location.href;
        const urlMatch = url.match(X_REGEX);

        if (urlMatch &&
            urlMatch[1].length >= 4 &&
            urlMatch[1].length <= 15 &&
            !RESERVED_PATHS.includes(urlMatch[1].toLowerCase())) {
            return `x.com/${urlMatch[1].toLowerCase()}`;
        }

        // Try to extract from canonical link
        const canonicalLink = document.querySelector('link[rel="canonical"]');
        if (canonicalLink) {
            const canonicalUrl = canonicalLink.getAttribute('href');
            const canonicalMatch = canonicalUrl.match(X_REGEX);

            if (canonicalMatch && !RESERVED_PATHS.includes(canonicalMatch[1].toLowerCase())) {
                return `x.com/${canonicalMatch[1]}`;
            }
        }

        return null;
    }
}