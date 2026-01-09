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
    const configs = await prisma.config.findMany();

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

    // CONFIG TABLE
    csvLines.push('TABLE,Config');
    if (configs.length > 0) {
      const configHeaders = Object.keys(configs[0]);
      csvLines.push(configHeaders.join(','));

      for (const config of configs) {
        const row = configHeaders.map(header => {
          const value = config[header];
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
      csvLines.push('No config records found');
    }

    // Write to file
    const csvContent = csvLines.join('\n');
    await fs.writeFile(exportPath, csvContent, 'utf-8');

    return {
      success: true,
      message: `Successfully exported ${clients.length} clients, ${bookings.length} bookings, ${configs.length} configs`,
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
