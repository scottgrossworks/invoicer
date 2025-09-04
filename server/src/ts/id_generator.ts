import * as crypto from 'crypto';

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

export class IDGenerator {
  private static readonly SEPARATOR = '#';
  private static readonly ENCODING = 'base64url';
  private static readonly HASH_ALGORITHM = 'sha256';

  /**
   * Generates a unique, reversible ID from name, start date/time, and location
   * Format: base64url(hash(name#startDateTime#location)) + base64url(name#startDateTime#location)
   * This allows both verification and reversal of the ID
   */
  public static generateID(components: IDComponents): string {
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
  public static decodeID(id: string): DecodedID | null {
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
    } catch (error) {
      return null;
    }
  }

  /**
   * Validates if an ID is properly formatted and has valid hash
   */
  public static isValidID(id: string): boolean {
    return this.decodeID(id) !== null;
  }

  /**
   * Extracts just the name from an ID without full decoding
   */
  public static extractNameFromID(id: string): string | null {
    const decoded = this.decodeID(id);
    return decoded?.name || null;
  }

  /**
   * Extracts just the date/time from an ID without full decoding
   */
  public static extractDateTimeFromID(id: string): string | null {
    const decoded = this.decodeID(id);
    return decoded?.startDateTime || null;
  }

  /**
   * Extracts just the location from an ID without full decoding
   */
  public static extractLocationFromID(id: string): string | null {
    const decoded = this.decodeID(id);
    return decoded?.location || null;
  }
}
