import prisma from '../apps/backend/src/database/prisma';

async function main() {
  console.log('--- DB INSPECTION START ---');
  
  const productCount = await prisma.product.count();
  const activeProductCount = await prisma.product.count({ where: { status: 'ACTIVE' } });
  console.log(`Total Products: ${productCount}, Active Products: ${activeProductCount}`);

  const products = await prisma.product.findMany({
    take: 10,
    include: {
      crop: {
        include: {
          farm: {
            include: {
              user: true
            }
          }
        }
      }
    }
  });
  console.log('Sample Products:', JSON.stringify(products.map(p => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    status: p.status,
    cropId: p.cropId,
    cropName: p.crop?.name,
    farmName: p.crop?.farm?.name,
    farmerUser: p.crop?.farm?.user ? `${p.crop.farm.user.firstName} ${p.crop.farm.user.lastName}` : null
  })), null, 2));

  const cropCount = await prisma.crop.count();
  console.log(`Total Crops: ${cropCount}`);
  const crops = await prisma.crop.findMany({
    take: 10,
    select: {
      id: true,
      name: true,
      type: true,
      qrCode: true,
      growthStage: true,
      farmId: true
    }
  });
  console.log('Sample Crops:', JSON.stringify(crops, null, 2));

  const eventCount = await prisma.supplyChainEvent.count();
  console.log(`Total SupplyChainEvents: ${eventCount}`);
  const events = await prisma.supplyChainEvent.findMany({
    take: 10,
    select: {
      id: true,
      eventType: true,
      verified: true,
      chainStatus: true,
      transactionHash: true,
      blockNumber: true,
      productId: true,
      cropId: true
    }
  });
  console.log('Sample Events:', JSON.stringify(events, null, 2));

  console.log('--- DB INSPECTION END ---');
}

main()
  .catch(err => {
    console.error('Inspection failed:', err);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
