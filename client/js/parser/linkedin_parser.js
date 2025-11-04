

// LinkedIn profile regex: matches LinkedIn profile URLs
const LINKEDIN_PROFILE_REGEX = /linkedin\.com\/in\//i;

import { PortalParser } from './parser.js';

class LinkedInParser extends PortalParser {

    constructor() {
        super();
        this.name = 'LinkedInParser';
        this.supportedKeys = ['profile', 'name', 'title', 'org', 'location'];
        this.realUrl = null;
        this._ready = false;
    }

    async checkPageMatch(url) {
        const testUrl = url || window.location.href;
        return testUrl && LINKEDIN_PROFILE_REGEX.test(testUrl);
    }

    async initialize(state) {
        // Initialize sub-objects
        state.Client = state.Client || {};
        state.Booking = state.Booking || {};
        state.Config = state.Config || {};
        
        // LinkedIn parser - minimal defaults for Client fields only
        state.Client.name = null;
        state.Client.email = null;
        state.Client.phone = null;
        state.Client.company = null;
        state.Client.notes = null;
        state.Booking.source = 'linkedin';
    }

    async parse(state) {
        if (!this.checkPageMatch()) return;
        
        // Ensure sub-objects exist (in case parse is called directly without initialize)
        state.Client = state.Client || {};
        state.Booking = state.Booking || {};
        state.Config = state.Config || {};

        const data = {};

        // Extract LinkedIn profile data for client creation
        const nameEl = document.querySelector('h1');
        if (nameEl) data.name = nameEl.textContent?.trim();

        const titleEl = document.querySelector('[data-field="headline"]') ||
                       document.querySelector('.pv-top-card-section__headline') ||
                       document.querySelector('.profile-overview-card__headline');
        if (titleEl) data.title = titleEl.textContent?.trim();

        const orgEl = document.querySelector('.pv-top-card-v2-section__company-name') ||
                     document.querySelector('.profile-overview-card__company-name');
        if (orgEl) data.org = orgEl.textContent?.trim();

        const locationEl = document.querySelector('.pv-top-card-section__location') ||
                          document.querySelector('.profile-overview-card__location');
        if (locationEl) data.location = locationEl.textContent?.trim();

        // Set profile URL for client record
        const profileUrl = this._getProfileUrl();
        if (profileUrl) data.linkedin = profileUrl;

        // Update state with extracted client data
        Object.entries(data).forEach(([k, v]) => {
            if (v !== null && v !== undefined && v !== '') {
                state.Client[k] = v;
            }
        });
    }

    // Helper method for profile URL extraction
    _getProfileUrl() {
        const url = window.location.href;
        return url.replace(/^https?:\/\/(www\.)?/, '');
    }
}





export default LinkedInParser;