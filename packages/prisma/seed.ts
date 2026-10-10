import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ Database seeding aborted. Seeding is not allowed in production.');
    process.exit(1);
  }
  if (process.env.ALLOW_SEED !== 'true') {
    console.error('❌ Database seeding aborted. Seeding is locked unless ALLOW_SEED=true is set.');
    process.exit(1);
  }
  console.log('🌱 Seeding database...');

  // Create admin user
  const adminPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@farmconnect.in' },
    update: {},
    create: {
      email: 'admin@farmconnect.in',
      password: adminPassword,
      firstName: 'Admin',
      lastName: 'User',
      role: 'ADMIN',
      phone: '+1-555-0001',
    },
  });
  console.log('✅ Ensured Admin User exists');

  // Create farmer user
  const farmerPassword = await bcrypt.hash('farmer123', 10);
  const farmer = await prisma.user.upsert({
    where: { email: 'farmer@farmconnect.in' },
    update: {},
    create: {
      email: 'farmer@farmconnect.in',
      password: farmerPassword,
      firstName: 'John',
      lastName: 'Farmer',
      role: 'FARMER',
      phone: '+1-555-0002',
    },
  }) as any;

  // Create Farm for the farmer
  const farm = await prisma.farm.upsert({
    where: { userId: farmer.id },
    update: {},
    create: {
      name: 'Green Valley Farm',
      description: 'Organic vegetable and grain farm',
      location: {
        lat: 40.7128,
        lng: -74.0060,
        address: '123 Farm Road, Agricultural Valley, CA 90210',
      },
      size: 150.5,
      certification: 'USDA Organic',
      userId: farmer.id,
    },
  });

  // Create default Field for the Farm
  const defaultField = await prisma.field.upsert({
    where: {
      farmId_name: {
        farmId: farm.id,
        name: 'Default Field',
      },
    },
    update: {},
    create: {
      farmId: farm.id,
      name: 'Default Field',
      soilType: 'Loam',
    },
  });

  // Create Crops and link to default Field
  const seededWheat = await prisma.crop.upsert({
    where: { qrCode: 'FARMCONNECT-WHEAT-001' },
    update: {},
    create: {
      name: 'Wheat Field A',
      type: 'WHEAT',
      variety: 'Hard Red Winter Wheat',
      plantingDate: new Date('2024-03-01'),
      expectedHarvest: new Date('2024-07-15'),
      growthStage: 'VEGETATIVE',
      area: 50.0,
      estimatedYield: 2250.0,
      qrCode: 'FARMCONNECT-WHEAT-001',
      farmId: farm.id,
      fieldId: defaultField.id,
    },
  });

  const seededCorn = await prisma.crop.upsert({
    where: { qrCode: 'FARMCONNECT-CORN-002' },
    update: {},
    create: {
      name: 'Corn Field B',
      type: 'CORN',
      variety: 'Sweet Corn Hybrid',
      plantingDate: new Date('2024-04-01'),
      expectedHarvest: new Date('2024-08-01'),
      growthStage: 'PLANTED',
      area: 35.0,
      estimatedYield: 3150.0,
      qrCode: 'FARMCONNECT-CORN-002',
      farmId: farm.id,
      fieldId: defaultField.id,
    },
  });

  const seededSoybean = await prisma.crop.upsert({
    where: { qrCode: 'FARMCONNECT-SOY-003' },
    update: {},
    create: {
      name: 'Soybean Field C',
      type: 'SOYBEANS',
      variety: 'GMO-Free Soybeans',
      plantingDate: new Date('2024-03-15'),
      expectedHarvest: new Date('2024-09-01'),
      growthStage: 'FLOWERING',
      area: 40.0,
      estimatedYield: 1600.0,
      qrCode: 'FARMCONNECT-SOY-003',
      farmId: farm.id,
      fieldId: defaultField.id,
    },
  });

  // Attach farm and crops relations mock data to farmer for downstream references in script
  farmer.farm = {
    ...farm,
    crops: [seededWheat, seededCorn, seededSoybean],
  };
  console.log('✅ Ensured Farmer exists with Farm and Crops');

  // Create distributor user
  const distributorPassword = await bcrypt.hash('dist123', 10);
  const distributor = await prisma.user.upsert({
    where: { email: 'distributor@farmconnect.in' },
    update: {},
    create: {
      email: 'distributor@farmconnect.in',
      password: distributorPassword,
      firstName: 'Sarah',
      lastName: 'Distributor',
      role: 'DISTRIBUTOR',
      phone: '+1-555-0003',
    },
  });
  console.log('✅ Ensured Distributor User exists');

  // Create consumer user
  const consumerPassword = await bcrypt.hash('consumer123', 10);
  const consumer = await prisma.user.upsert({
    where: { email: 'consumer@farmconnect.in' },
    update: {},
    create: {
      email: 'consumer@farmconnect.in',
      password: consumerPassword,
      firstName: 'Mike',
      lastName: 'Consumer',
      role: 'CONSUMER',
      phone: '+1-555-0004',
    },
  });
  console.log('✅ Ensured Consumer User exists');

  // Create AI predictions for wheat crop
  const wheatCrop = farmer.farm!.crops[0];
  await prisma.aIPrediction.create({
    data: {
      cropId: wheatCrop.id,
      predictedYield: 2250.0,
      confidence: 0.87,
      factors: {
        weather: {
          temperature: 25.5,
          rainfall: 650.0,
          humidity: 65.0,
        },
        soil: {
          ph_level: 6.5,
          nitrogen: 55.0,
          phosphorus: 35.0,
          potassium: 45.0,
        },
        historical: 1.02,
      },
    },
  });
  console.log('✅ Created AI Prediction for Wheat');

  // Create products from harvested crops
  let product = await prisma.product.findUnique({
    where: { sku: 'WHEAT-FLOUR-5KG-001' }
  });
  if (!product) {
    product = await prisma.product.create({
      data: {
        name: 'Premium Wheat Flour - 5kg',
        sku: 'WHEAT-FLOUR-5KG-001',
        cropId: wheatCrop.id,
        quantity: 1000.0, // 1000 kg
        price: 150.0,
        rating: 4.8,
        packagingDate: new Date('2024-07-20'),
        expiryDate: new Date('2025-07-20'),
        batchNumber: 'BATCH-2024-001',
        storageLocation: 'Warehouse A, Section 3',
        status: 'ACTIVE',
      },
    });
    console.log('✅ Created Product from Wheat');
  } else {
    product = await prisma.product.update({
      where: { sku: 'WHEAT-FLOUR-5KG-001' },
      data: {
        price: 150.0,
        rating: 4.8
      }
    });
    console.log('✅ Updated Product with Price/Rating from Wheat');
  }

  // Create supply chain events
  const wheatEventPlanted = await prisma.supplyChainEvent.create({
    data: {
      productId: product.id,
      eventType: 'PLANTED',
      timestamp: new Date('2024-03-01T08:00:00Z'),
      location: 'Green Valley Farm - Field A',
      actorId: farmer.id,
      metadata: JSON.stringify({
        soilPreparation: 'Plowed and fertilized',
        seedDensity: '120 kg/hectare',
        weatherConditions: 'Clear, 15°C',
      }),
      verified: true,
    },
  });
  console.log('✅ Created Supply Chain Event: PLANTED');

  const wheatEventVegetative = await prisma.supplyChainEvent.create({
    data: {
      productId: product.id,
      eventType: 'QUALITY_CHECK',
      timestamp: new Date('2024-05-01T10:30:00Z'),
      location: 'Green Valley Farm - Field A',
      actorId: farmer.id,
      metadata: JSON.stringify({
        plantHeight: '45 cm',
        healthStatus: 'Excellent',
        pestPresence: 'None detected',
      }),
      verified: true,
    },
  });
  console.log('✅ Created Supply Chain Event: QUALITY_CHECK');

  const productEventPackaged = await prisma.supplyChainEvent.create({
    data: {
      productId: product.id,
      eventType: 'PACKAGED',
      timestamp: new Date('2024-07-20T14:00:00Z'),
      location: 'Processing Facility B',
      actorId: distributor.id,
      metadata: JSON.stringify({
        packagingType: 'Food-grade bags',
        qualityGrade: 'Premium',
        moistureContent: '12%',
      }),
      transactionHash: '0x' + Math.random().toString(16).substr(2, 40),
      blockNumber: Math.floor(Math.random() * 10000000) + 1000000,
      verified: true,
    },
  });
  console.log('✅ Created Supply Chain Event: PACKAGED (Blockchain)');

  const productEventShipped = await prisma.supplyChainEvent.create({
    data: {
      productId: product.id,
      eventType: 'SHIPPED',
      timestamp: new Date('2024-07-21T09:00:00Z'),
      location: 'Distribution Center - Dock 5',
      actorId: distributor.id,
      metadata: JSON.stringify({
        carrier: 'Fresh Transport Inc.',
        vehicleId: 'TRK-456',
        destination: 'Metro Supermarket Chain',
        temperatureControl: 'Ambient',
        latitude: 40.7580,
        longitude: -73.9855,
      }),
      transactionHash: '0x' + Math.random().toString(16).substr(2, 40),
      blockNumber: Math.floor(Math.random() * 10000000) + 1000001,
      verified: true,
    },
  });
  console.log('✅ Created Supply Chain Event: SHIPPED (Blockchain)');

  // Add more detailed events for the WOW demo
  const wheatEventHarvested = await prisma.supplyChainEvent.create({
    data: {
      productId: product.id,
      eventType: 'HARVESTED',
      timestamp: new Date('2024-07-15T07:30:00Z'),
      location: 'Green Valley Farm - Field A',
      actorId: farmer.id,
      metadata: JSON.stringify({
        harvestMethod: 'Combine harvester',
        moistureContent: '13.5%',
        yieldAmount: '2,250 kg',
        qualityGrade: 'Premium',
        weatherConditions: 'Sunny, 22°C',
        latitude: 40.7128,
        longitude: -74.0060,
      }),
      transactionHash: '0x' + Math.random().toString(16).substr(2, 40),
      blockNumber: Math.floor(Math.random() * 10000000) + 1000002,
      verified: true,
    },
  });
  console.log('✅ Created Supply Chain Event: HARVESTED (Blockchain)');

  const wheatEventProcessed = await prisma.supplyChainEvent.create({
    data: {
      productId: product.id,
      eventType: 'PROCESSED',
      timestamp: new Date('2024-07-18T11:00:00Z'),
      location: 'Mill Processing Facility',
      actorId: distributor.id,
      metadata: JSON.stringify({
        processingType: 'Milling and grading',
        equipmentUsed: 'Industrial mill #3',
        outputQuantity: '2,200 kg flour',
        byproducts: 'Bran and germ separated',
        qualityChecks: 'Passed all tests',
        latitude: 40.7306,
        longitude: -73.9352,
      }),
      transactionHash: '0x' + Math.random().toString(16).substr(2, 40),
      blockNumber: Math.floor(Math.random() * 10000000) + 1000003,
      verified: true,
    },
  });
  console.log('✅ Created Supply Chain Event: PROCESSED (Blockchain)');

  const wheatEventDelivered = await prisma.supplyChainEvent.create({
    data: {
      productId: product.id,
      eventType: 'RECEIVED',
      timestamp: new Date('2024-07-22T15:30:00Z'),
      location: 'Metro Supermarket - Warehouse',
      actorId: distributor.id,
      metadata: JSON.stringify({
        receivedBy: 'Warehouse Manager Tom',
        conditionOnArrival: 'Excellent',
        storageAssignment: 'Cold Storage Unit 12',
        inspectionNotes: 'No damage, proper packaging',
        latitude: 40.7589,
        longitude: -73.9851,
      }),
      transactionHash: '0x' + Math.random().toString(16).substr(2, 40),
      blockNumber: Math.floor(Math.random() * 10000000) + 1000004,
      verified: true,
    },
  });
  console.log('✅ Created Supply Chain Event: RECEIVED (Blockchain)');

  const wheatEventRetail = await prisma.supplyChainEvent.create({
    data: {
      productId: product.id,
      eventType: 'RETAIL',
      timestamp: new Date('2024-07-23T08:00:00Z'),
      location: 'Metro Supermarket - Store #456',
      actorId: distributor.id,
      metadata: JSON.stringify({
        shelfLocation: 'Aisle 7, Shelf B',
        displayType: 'Organic products section',
        pricePerUnit: '$12.99',
        stockQuantity: '50 units',
        promotionalMaterial: 'Organic certification badge displayed',
        latitude: 40.7614,
        longitude: -73.9776,
      }),
      transactionHash: '0x' + Math.random().toString(16).substr(2, 40),
      blockNumber: Math.floor(Math.random() * 10000000) + 1000005,
      verified: true,
    },
  });
  console.log('✅ Created Supply Chain Event: RETAIL (Blockchain)');

  // Create audit logs
  await prisma.auditLog.create({
    data: {
      action: 'USER_REGISTERED',
      entity: 'User',
      entityId: farmer.id,
      userId: farmer.id,
      details: {
        email: farmer.email,
        role: farmer.role,
        ipAddress: '192.168.1.100',
      },
    },
  });

  await prisma.auditLog.create({
    data: {
      action: 'FARM_REGISTERED',
      entity: 'Farm',
      entityId: farmer.farm!.id,
      userId: farmer.id,
      details: {
        farmName: farmer.farm!.name,
        size: farmer.farm!.size,
        certification: farmer.farm!.certification,
      },
    },
  });
  console.log('✅ Created Audit Logs');

  console.log('\n🎉 Database seeding completed successfully!');
  console.log('\n📊 Summary:');
  console.log(`   - Users: ${await prisma.user.count()}`);
  console.log(`   - Farms: ${await prisma.farm.count()}`);
  console.log(`   - Crops: ${await prisma.crop.count()}`);
  console.log(`   - Products: ${await prisma.product.count()}`);
  console.log(`   - AI Predictions: ${await prisma.aIPrediction.count()}`);
  console.log(`   - Supply Chain Events: ${await prisma.supplyChainEvent.count()}`);
  console.log(`   - Audit Logs: ${await prisma.auditLog.count()}`);
  
  console.log('\n🔐 Test Credentials:');
  console.log('   Admin: admin@farmconnect.in / admin123');
  console.log('   Farmer: farmer@farmconnect.in / farmer123');
  console.log('   Distributor: distributor@farmconnect.in / dist123');
  console.log('   Consumer: consumer@farmconnect.in / consumer123');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
