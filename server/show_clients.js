const { PrismaClient } = require('@prisma/client');

async function showAllClients() {
  const prisma = new PrismaClient();

  try {
    console.log('Connecting to database...');
    await prisma.$connect();

    console.log('Fetching all clients...\n');
    const clients = await prisma.client.findMany({
      orderBy: {
        createdAt: 'desc'
      }
    });

    if (clients.length === 0) {
      console.log('No clients found in the database.');
      return;
    }

    console.log(`Found ${clients.length} client(s):\n`);
    console.log('─'.repeat(100));

    clients.forEach((client, index) => {
      console.log(`${index + 1}. ${client.name}`);
      if (client.company) console.log(`   Company: ${client.company}`);
      if (client.email) console.log(`   Email: ${client.email}`);
      if (client.phone) console.log(`   Phone: ${client.phone}`);

      if (client.notes) console.log(`   Notes: ${client.notes}`);
      console.log(`   Created: ${client.createdAt.toLocaleDateString()}`);
      console.log(`   Updated: ${client.updatedAt.toLocaleDateString()}`);
      console.log(`   ID: ${client.id}`);
      console.log('─'.repeat(100));
    });

  } catch (error) {
    console.error('Error fetching clients:', error);
  } finally {
    await prisma.$disconnect();
  }
}

showAllClients();
