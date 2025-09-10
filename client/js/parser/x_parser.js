// x_parser.js - Minimal viable X/Twitter parser

class XParser {
    constructor() {
        this.name = 'XParser';
    }

    async checkPageMatch(url) {
        const testUrl = url || window.location.href;
        return testUrl.includes('x.com') || testUrl.includes('twitter.com');
    }

    async initialize(state) {
        state.Booking = state.Booking || {};
        state.Booking.source = 'x';
    }

    async parse(state) {
        // Minimal implementation - just set source
        state.Booking = state.Booking || {};
        state.Booking.source = 'x';
    }
}

export default XParser;