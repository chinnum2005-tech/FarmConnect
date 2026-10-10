const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash('password123', 10);
  
  await prisma.user.updateMany({
    data: { password: hash }
  });
  
  const users = await prisma.user.findMany({
    select: { email: true, firstName: true, role: true }
  });
  
  console.log(JSON.stringify(users, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
