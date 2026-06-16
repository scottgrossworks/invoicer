/**
 * CSV Exporter - Exports all database tables to a single CSV file
 * Uses csv-writer library for proper CSV formatting
 */

const fs = require('fs').promises;
const path = require('path');

/**
 * Export all database data to a single CSV file with table separators
 * @param {PrismaClient} prisma - Prisma client instance
 * @param {string} exportPath - Full path to output CSV file
 * @returns {Promise<{success: boolean, message: string, path?: string}>}
 */
async function exportAllDataToCSV(prisma, exportPath) {
  try {
    // Query all data from all tables
    const clients = await prisma.client.findMany();
    const bookings = await prisma.booking.findMany();
    // Config table removed (U4). Export the SquareConnection rows instead, with
    // OAuth tokens redacted so the CSV never carries secrets (KTD15).
    const squareConnections = (await prisma.squareConnection.findMany()).map(c => ({
      ...c,
      accessToken: c.accessToken ? '***REDACTED***' : null,
      refreshToken: c.refreshToken ? '***REDACTED***' : null
    }));

    // Build CSV content manually for combined file with table separators
    const csvLines = [];

    // CLIENT TABLE
    csvLines.push('TABLE,Client');
    if (clients.length > 0) {
      // Header row
      const clientHeaders = Object.keys(clients[0]);
      csvLines.push(clientHeaders.join(','));

      // Data rows
      for (const client of clients) {
        const row = clientHeaders.map(header => {
          const value = client[header];
          // Handle null/undefined
          if (value === null || value === undefined) return '';
          // Convert dates to ISO string
          if (value instanceof Date) return value.toISOString();
          // Escape CSV special characters
          const strValue = String(value);
          if (strValue.includes(',') || strValue.includes('"') || strValue.includes('\n')) {
            return `"${strValue.replace(/"/g, '""')}"`;
          }
          return strValue;
        });
        csvLines.push(row.join(','));
      }
    } else {
      csvLines.push('No client records found');
    }

    // Empty line separator
    csvLines.push('');

    // BOOKING TABLE
    csvLines.push('TABLE,Booking');
    if (bookings.length > 0) {
      const bookingHeaders = Object.keys(bookings[0]);
      csvLines.push(bookingHeaders.join(','));

      for (const booking of bookings) {
        const row = bookingHeaders.map(header => {
          const value = booking[header];
          if (value === null || value === undefined) return '';
          if (value instanceof Date) return value.toISOString();
          const strValue = String(value);
          if (strValue.includes(',') || strValue.includes('"') || strValue.includes('\n')) {
            return `"${strValue.replace(/"/g, '""')}"`;
          }
          return strValue;
        });
        csvLines.push(row.join(','));
      }
    } else {
      csvLines.push('No booking records found');
    }

    // Empty line separator
    csvLines.push('');

    // SQUARE CONNECTION TABLE
    csvLines.push('TABLE,SquareConnection');
    if (squareConnections.length > 0) {
      const connHeaders = Object.keys(squareConnections[0]);
      csvLines.push(connHeaders.join(','));

      for (const conn of squareConnections) {
        const row = connHeaders.map(header => {
          const value = conn[header];
          if (value === null || value === undefined) return '';
          if (value instanceof Date) return value.toISOString();
          if (typeof value === 'bigint') return String(value);
          const strValue = String(value);
          if (strValue.includes(',') || strValue.includes('"') || strValue.includes('\n')) {
            return `"${strValue.replace(/"/g, '""')}"`;
          }
          return strValue;
        });
        csvLines.push(row.join(','));
      }
    } else {
      csvLines.push('No SquareConnection records found');
    }

    // Write to file
    const csvContent = csvLines.join('\n');
    await fs.writeFile(exportPath, csvContent, 'utf-8');

    return {
      success: true,
      message: `Successfully exported ${clients.length} clients, ${bookings.length} bookings, ${squareConnections.length} square connections`,
      path: exportPath
    };

  } catch (error) {
    console.error('CSV export failed:', error);
    return {
      success: false,
      message: `Export failed: ${error.message}`
    };
  }
}

module.exports = { exportAllDataToCSV };
