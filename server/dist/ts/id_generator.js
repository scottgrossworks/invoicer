"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.IDGenerator = void 0;
const crypto = __importStar(require("crypto"));
class IDGenerator {
    /**
     * Generates a unique, reversible ID from name, start date/time, and location
     * Format: base64url(hash(name#startDateTime#location)) + base64url(name#startDateTime#location)
     * This allows both verification and reversal of the ID
     */
    static generateID(components) {
        const { name, startDateTime, location } = components;
        // Create the combined string
        const combined = `${name}${this.SEPARATOR}${startDateTime}${this.SEPARATOR}${location}`;
        // Generate hash for verification
        const hash = crypto.createHash(this.HASH_ALGORITHM).update(combined).digest(this.ENCODING);
        // Encode the original data
        const encoded = Buffer.from(combined, 'utf8').toString(this.ENCODING);
        // Combine hash + encoded data
        return `${hash}.${encoded}`;
    }
    /**
     * Decodes an ID back to its original components
     * Verifies the hash to ensure data integrity
     */
    static decodeID(id) {
        try {
            const parts = id.split('.');
            if (parts.length !== 2) {
                return null;
            }
            const [hash, encoded] = parts;
            // Decode the original data
            const combined = Buffer.from(encoded, this.ENCODING).toString('utf8');
            // Verify the hash
            const expectedHash = crypto.createHash(this.HASH_ALGORITHM).update(combined).digest(this.ENCODING);
            if (hash !== expectedHash) {
                return null; // Hash verification failed
            }
            // Split the combined string
            const [name, startDateTime, location] = combined.split(this.SEPARATOR);
            if (!name || !startDateTime || !location) {
                return null; // Missing components
            }
            return {
                name,
                startDateTime,
                location,
                originalHash: hash
            };
        }
        catch (error) {
            return null;
        }
    }
    /**
     * Validates if an ID is properly formatted and has valid hash
     */
    static isValidID(id) {
        return this.decodeID(id) !== null;
    }
    /**
     * Extracts just the name from an ID without full decoding
     */
    static extractNameFromID(id) {
        const decoded = this.decodeID(id);
        return decoded?.name || null;
    }
    /**
     * Extracts just the date/time from an ID without full decoding
     */
    static extractDateTimeFromID(id) {
        const decoded = this.decodeID(id);
        return decoded?.startDateTime || null;
    }
    /**
     * Extracts just the location from an ID without full decoding
     */
    static extractLocationFromID(id) {
        const decoded = this.decodeID(id);
        return decoded?.location || null;
    }
}
exports.IDGenerator = IDGenerator;
IDGenerator.SEPARATOR = '#';
IDGenerator.ENCODING = 'base64url';
IDGenerator.HASH_ALGORITHM = 'sha256';
//# sourceMappingURL=id_generator.js.map