

// LinkedIn profile regex: matches LinkedIn profile URLs
const LINKEDIN_PROFILE_REGEX = /linkedin\.com\/in\//i;

import { ParserInterface } from './parser_interface.js';

class LinkedInParser extends ParserInterface {

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



    async parse(state) {
        if (!this.checkPageMatch()) return;

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
                state.set(k, v);
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