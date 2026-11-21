const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  try {
    const count = await p.user.count();
    console.log('USER_COUNT', count);
    const sample = await p.user.findMany({ take: 3, select: { email: true, role: true } });
    console.log('SAMPLE', JSON.stringify(sample));
  } catch (e) {
    console.error('PRISMA_ERR', e.message);
    process.exitCode = 1;
  } finally {
    await p.$disconnect();
  }
})();
