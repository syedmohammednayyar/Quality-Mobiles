const mongoose = require('mongoose');

// Import Models
const User = require('./models/User');
const Store = require('./models/Store');
const Customer = require('./models/Customer');
const Employee = require('./models/Employee');
const Product = require('./models/Product');
const Sale = require('./models/Sale');
const Buyback = require('./models/Buyback');
const Repair = require('./models/Repair');
const Expense = require('./models/Expense');
const Payment = require('./models/Payment');
const StockMovement = require('./models/StockMovement');

const bcrypt = require('bcrypt');

const MONGODB_URI = 'mongodb://127.0.0.1:27017/quality_mobiles';

async function seed() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected!');

    console.log('Cleaning up existing data...');
    // Clear all collections
    const collections = await mongoose.connection.db.collections();
    for (let collection of collections) {
      console.log(`Dropping collection: ${collection.collectionName}`);
      await collection.drop().catch(err => console.log(`Collection ${collection.collectionName} drop failed (probably empty)`));
    }

    // 1. Create a Store
    console.log('Creating Stores...');
    const storeA = await Store.create({
      name: 'Quality Mobiles - Store A',
      code: 'QM-A',
      store_type: 'main',
      is_active: true
    });

    const storeB = await Store.create({
      name: 'Quality Mobiles - Store B',
      code: 'QM-B',
      store_type: 'main',
      is_active: true
    });

    // 2. Create an Admin User
    console.log('Creating Admin User...');
    const hashedPassword = await bcrypt.hash('Noor1234', 10);
    const admin = await User.create({
      name: 'Noor',
      email: 'noor@gmail.com',
      password: hashedPassword,
      role: 'Admin'
    });

    // 3. Create a Customer
    console.log('Creating Customer...');
    const customer = await Customer.create({
      name: 'John Doe',
      email: 'john@example.com',
      phone: '+1234567890',
      store_ref: storeA._id
    });

    // 4. Create Products for Store A
    console.log('Creating Products for Store A...');
    const p1 = await Product.create({
      job_id: 'JOB-10001',
      store_id: storeA._id,
      name: 'iPhone 15 Pro',
      brand: 'Apple',
      model: '15 Pro 128GB',
      category: 'new_phone',
      sku: 'IPH15P-128',
      selling_price: 1099.99,
      final_price: 1099.99,
      quantity: 10,
      stock_status: 'In Stock'
    });

    const p2 = await Product.create({
      job_id: 'JOB-10002',
      store_id: storeA._id,
      name: 'Samsung S24 Ultra',
      brand: 'Samsung',
      model: 'S24 Ultra 256GB',
      category: 'new_phone',
      sku: 'SAMS24U-256',
      selling_price: 1299.99,
      final_price: 1299.99,
      quantity: 5,
      stock_status: 'In Stock'
    });

    // 5. Create Products for Store B
    console.log('Creating Products for Store B...');
    await Product.create({
      job_id: 'JOB-10003',
      store_id: storeB._id,
      name: 'iPhone 15 Pro (Store B)',
      brand: 'Apple',
      model: '15 Pro 256GB',
      category: 'new_phone',
      sku: 'IPH15P-256-B',
      selling_price: 1199.99,
      final_price: 1199.99,
      quantity: 2,
      stock_status: 'In Stock'
    });

    // 6. Log Initial Stock Movements
    console.log('Logging Stock Movements...');
    await StockMovement.create([
      { product_id: p1._id, to_store: storeA._id, quantity: 10, movement_type: 'PURCHASE', user_id: admin._id, notes: 'Initial Seed' },
      { product_id: p2._id, to_store: storeA._id, quantity: 5, movement_type: 'PURCHASE', user_id: admin._id, notes: 'Initial Seed' }
    ]);

    // 7. Create an Employee
    console.log('Creating Employee...');
    await Employee.create({
      name: 'Mike Sales',
      role: 'Salesman',
      store: 'Quality Mobiles - Store A',
      store_ref: storeA._id,
      login_username: 'mike',
      email: 'mike@qualitymobiles.com',
      phone: '+1122334455',
      join_date: new Date()
    });

    console.log('Seeding completed successfully!');
    console.log('Admin Login: noor@gmail.com / Noor1234');
    process.exit(0);
  } catch (err) {
    console.error('Seeding failed:', err);
    process.exit(1);
  }
}

seed();
