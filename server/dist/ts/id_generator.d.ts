export interface IDComponents {
    name: string;
    startDateTime: string;
    location: string;
}
export interface DecodedID {
    name: string;
    startDateTime: string;
    location: string;
    originalHash: string;
}
export declare class IDGenerator {
    private static readonly SEPARATOR;
    private static readonly ENCODING;
    private static readonly HASH_ALGORITHM;
    /**
     * Generates a unique, reversible ID from name, start date/time, and location
     * Format: base64url(hash(name#startDateTime#location)) + base64url(name#startDateTime#location)
     * This allows both verification and reversal of the ID
     */
    static generateID(components: IDComponents): string;
    /**
     * Decodes an ID back to its original components
     * Verifies the hash to ensure data integrity
     */
    static decodeID(id: string): DecodedID | null;
    /**
     * Validates if an ID is properly formatted and has valid hash
     */
    static isValidID(id: string): boolean;
    /**
     * Extracts just the name from an ID without full decoding
     */
    static extractNameFromID(id: string): string | null;
    /**
     * Extracts just the date/time from an ID without full decoding
     */
    static extractDateTimeFromID(id: string): string | null;
    /**
     * Extracts just the location from an ID without full decoding
     */
    static extractLocationFromID(id: string): string | null;
}
//# sourceMappingURL=id_generator.d.ts.map