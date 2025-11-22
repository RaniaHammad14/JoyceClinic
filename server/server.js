//server.js
const express = require('express');
const sql = require('mssql');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');



// دالة حساب المدة من الوقت المحدد
function calculateDurationFromTime(startTime, endTime) {
  try {
    // إذا كانت الأوقات بصيغة HH:MM فقط، نضيف :00
    if (startTime.length === 5) startTime = startTime + ':00';
    if (endTime.length === 5) endTime = endTime + ':00';
    
    // استخدام التوقيت المصري
    const now = new Date();
    const today = now.toLocaleString("en-US", {timeZone: "Africa/Cairo"}).split(',')[0];
    
    const start = new Date(`${today}T${startTime}`);
    const end = new Date(`${today}T${endTime}`);
    
    // إذا كان الوقت النهاية أقل من الوقت البداية (يعني عبر منتصف الليل)
    if (end < start) {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowDate = tomorrow.toLocaleString("en-US", {timeZone: "Africa/Cairo"}).split(',')[0];
      
      const endNextDay = new Date(`${tomorrowDate}T${endTime}`);
      const diffMs = endNextDay - start;
      const diffMinutes = Math.floor(diffMs / 60000);
      return diffMinutes;
    } else {
      const diffMs = end - start;
      const diffMinutes = Math.floor(diffMs / 60000);
      return diffMinutes;
    }
  } catch (error) {
    console.error('❌ خطأ في حساب المدة:', error);
    return 0;
  }
}

const app = express();
const PORT = 3000;

// ✅ إعداد الترميز العربي الصحيح
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ✅ Middleware لفرض UTF-8 على كل الـ responses
app.use((req, res, next) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  next();
});


const dbConfig = {
  user: 'sa',
  password: '123456',
  server: 'localhost',
  port: 1433,
  database: 'master',
  options: {
    encrypt: false,
    trustServerCertificate: true,
    useUTC: false,
    timezone: 'Africa/Cairo',
    // ✅ إضافة دعم UTF-8 الكامل
    enableArithAbort: true,
    requestTimeout: 30000,
    connectionIsolationLevel: sql.ISOLATION_LEVEL.READ_COMMITTED,
    // ✅ هذا المهم للعربي
    appName: 'BeYou',
    parseJSON: true
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  },
  connectionTimeout: 30000,
  requestTimeout: 30000
};

// دالة مساعدة لتنسيق الوقت للتعارضات
function formatTimeForConflict(timeStr) {
  if (!timeStr) return '--:--';
  
  if (typeof timeStr === 'string' && timeStr.includes(':')) {
    const parts = timeStr.split(':');
    let hours = parseInt(parts[0]);
    const minutes = parts[1];
    
    const period = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    
    return `${hours}:${minutes} ${period}`;
  }
  
  try {
    const date = new Date(timeStr);
    if (!isNaN(date.getTime())) {
      const time = date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
      return time;
    }
  } catch (e) {
    console.error('خطأ في تنسيق الوقت:', e);
  }
  
  return timeStr;
}

app.use(cors());
app.use(bodyParser.json());
// middleware لضبط التوقيت المصري
app.use((req, res, next) => {
  // ضبط الوقت للتوقيت المصري لجميع الطلبات
  req.egyptTime = new Date().toLocaleString("en-US", {timeZone: "Africa/Cairo"});
  req.egyptDate = new Date().toLocaleString("en-US", {timeZone: "Africa/Cairo"}).split(',')[0];
  next();
});
// 👇 ضيف الكود ده
app.use((req, res, next) => {
  if (req.path.endsWith('.html')) {
    res.type('text/html; charset=utf-8');
  } else if (req.path.endsWith('.js')) {
    res.type('application/javascript; charset=utf-8');
  } else if (req.path.endsWith('.css')) {
    res.type('text/css; charset=utf-8');
  }
  next();
});
app.use(express.static(path.join(__dirname, '../public')));

app.get('/', (req, res) => {
  res.redirect('/login/login.html');
});

app.get('/.well-known/appspecific/com.chrome.devtools.json', (req, res) => {
  res.sendStatus(204);
});
// استخدام خدمة محددة من عرض
app.post('/api/purchased-offers/:id/use-service', async (req, res) => {
  const { id } = req.params;
  const { service_index, service_name, used_by } = req.body;
  
  if (service_index === undefined || !used_by) {
    return res.status(400).json({ message: 'فهرس الخدمة واسم المستخدم مطلوبان' });
  }

  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // جلب بيانات الجلسات الخاصة بالخدمة
      const sessionsRes = await transaction.request()
        .input('purchased_offer_id', sql.Int, id)
        .input('service_index', sql.Int, service_index)
        .query(`
          SELECT * FROM dbo.offer_service_sessions 
          WHERE purchased_offer_id = @purchased_offer_id AND service_index = @service_index
        `);
      
      if (!sessionsRes.recordset || sessionsRes.recordset.length === 0) {
        await transaction.rollback();
        return res.status(404).json({ message: 'الجلسات غير موجودة لهذه الخدمة' });
      }
      
      const serviceSession = sessionsRes.recordset[0];
      
      if (serviceSession.remaining_sessions <= 0) {
        await transaction.rollback();
        return res.status(400).json({ message: 'لا توجد جلسات متبقية لهذه الخدمة' });
      }

      // تحديث الجلسات المتبقية للخدمة المحددة فقط
      const newRemaining = serviceSession.remaining_sessions - 1;
      
      await transaction.request()
        .input('id', sql.Int, serviceSession.id)
        .input('remaining_sessions', sql.Int, newRemaining)
        .query(`
          UPDATE dbo.offer_service_sessions 
          SET remaining_sessions = @remaining_sessions
          WHERE id = @id
        `);

      await transaction.commit();
      
      return res.json({ 
        message: `تم استخدام خدمة ${service_name} بنجاح`,
        service_remaining: newRemaining
      });
      
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) {
    console.error('Error using service:', err.message);
    return res.status(500).json({ message: 'حدث خطأ أثناء استخدام الخدمة' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});
// endpoint للتحقق من هيكل الجداول
app.get('/api/debug/tables', async (req, res) => {
  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    
    // التحقق من وجود الجداول
    const tablesRes = await pool.request().query(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_NAME IN ('client_purchased_offers', 'offer_service_sessions', 'offers')
    `);
    
    // التحقق من أعمدة كل جدول
    const clientPurchasedOffersColumns = await pool.request().query(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'client_purchased_offers'
    `);
    
    const offerServiceSessionsColumns = await pool.request().query(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'offer_service_sessions'
    `);
    
    const offersColumns = await pool.request().query(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'offers'
    `);
    
    return res.json({
      tables: tablesRes.recordset,
      client_purchased_offers: clientPurchasedOffersColumns.recordset,
      offer_service_sessions: offerServiceSessionsColumns.recordset,
      offers: offersColumns.recordset
    });
  } catch (err) {
    console.error('Error checking tables:', err.message);
    return res.status(500).json({ message: 'خطأ في التحقق من الجداول', error: err.message });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});
async function ensureDatabaseExists() {
  let pool;
  try {
    console.log('Connecting to SQL Server...');
    pool = await sql.connect(dbConfig);
    console.log('Connected to SQL Server');
    
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = 'beyou')
      BEGIN
        CREATE DATABASE beyou;
      END
    `);
    console.log('Database beyou is ready.');
  } catch (err) {
    console.error('Error checking database:', err.message);
    throw err;
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
}
// === دالة إنشاء جداول المخزون ===
async function ensureStockTablesExist() {
  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);

    // 1. جدول فئات المنتجات
    await pool.request().query(`
      IF NOT EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_NAME = 'product_categories' AND TABLE_SCHEMA = 'dbo'
      )
      BEGIN
        CREATE TABLE dbo.product_categories (
          id INT IDENTITY(1,1) PRIMARY KEY,
          name NVARCHAR(100) NOT NULL UNIQUE,
          description NVARCHAR(500),
          icon NVARCHAR(50),
          created_at DATETIME DEFAULT (GETUTCDATE() AT TIME ZONE 'UTC' AT TIME ZONE 'Egypt Standard Time')
        );
      END
    `);

    // 2. جدول المنتجات
    await pool.request().query(`
      IF NOT EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_NAME = 'products' AND TABLE_SCHEMA = 'dbo'
      )
      BEGIN
        CREATE TABLE dbo.products (
          id INT IDENTITY(1,1) PRIMARY KEY,
          barcode NVARCHAR(50) UNIQUE,
          name NVARCHAR(200) NOT NULL,
          category_id INT,
          supplier_id INT,
          description NVARCHAR(MAX),
          unit NVARCHAR(50) NOT NULL DEFAULT 'قطعة',
          purchase_price DECIMAL(10,2) DEFAULT 0,
          selling_price DECIMAL(10,2) DEFAULT 0,
          current_stock INT DEFAULT 0,
          min_stock INT DEFAULT 5,
          max_stock INT DEFAULT 100,
          reorder_point INT DEFAULT 10,
          location NVARCHAR(100),
          status NVARCHAR(20) DEFAULT 'active',
          created_at DATETIME DEFAULT GETDATE(),
          updated_at DATETIME DEFAULT GETDATE(),
          CONSTRAINT FK_products_category FOREIGN KEY (category_id) 
            REFERENCES dbo.product_categories(id),
          CONSTRAINT FK_products_supplier FOREIGN KEY (supplier_id) 
            REFERENCES dbo.suppliers(id)
        );
      END
    `);

    // 3. جدول حركات المخزون
    await pool.request().query(`
      IF NOT EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_NAME = 'stock_movements' AND TABLE_SCHEMA = 'dbo'
      )
      BEGIN
        CREATE TABLE dbo.stock_movements (
          id INT IDENTITY(1,1) PRIMARY KEY,
          product_id INT NOT NULL,
          movement_type NVARCHAR(50) NOT NULL,
          quantity INT NOT NULL,
          previous_stock INT NOT NULL,
          new_stock INT NOT NULL,
          reference_number NVARCHAR(100),
          supplier_id INT,
          notes NVARCHAR(500),
          created_by NVARCHAR(100) NOT NULL,
          created_at DATETIME DEFAULT GETDATE(),
          CONSTRAINT FK_stock_movements_product FOREIGN KEY (product_id) 
            REFERENCES dbo.products(id) ON DELETE CASCADE
        );
      END
    `);

    // 4. جدول طلبات الشراء
    await pool.request().query(`
      IF NOT EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_NAME = 'purchase_orders' AND TABLE_SCHEMA = 'dbo'
      )
      BEGIN
        CREATE TABLE dbo.purchase_orders (
          id INT IDENTITY(1,1) PRIMARY KEY,
          order_number NVARCHAR(50) NOT NULL UNIQUE,
          supplier_id INT NOT NULL,
          order_date DATE NOT NULL,
          expected_date DATE,
          received_date DATE,
          total_amount DECIMAL(10,2) DEFAULT 0,
          status NVARCHAR(20) DEFAULT 'pending',
          notes NVARCHAR(500),
          created_by NVARCHAR(100) NOT NULL,
          created_at DATETIME DEFAULT GETDATE(),
          CONSTRAINT FK_purchase_orders_supplier FOREIGN KEY (supplier_id) 
            REFERENCES dbo.suppliers(id)
        );
      END
    `);

    // 5. جدول تفاصيل طلبات الشراء
    await pool.request().query(`
      IF NOT EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_NAME = 'purchase_order_items' AND TABLE_SCHEMA = 'dbo'
      )
      BEGIN
        CREATE TABLE dbo.purchase_order_items (
          id INT IDENTITY(1,1) PRIMARY KEY,
          order_id INT NOT NULL,
          product_id INT NOT NULL,
          quantity INT NOT NULL,
          unit_price DECIMAL(10,2) NOT NULL,
          total_price DECIMAL(10,2) NOT NULL,
          received_quantity INT DEFAULT 0,
          CONSTRAINT FK_purchase_items_order FOREIGN KEY (order_id) 
            REFERENCES dbo.purchase_orders(id) ON DELETE CASCADE,
          CONSTRAINT FK_purchase_items_product FOREIGN KEY (product_id) 
            REFERENCES dbo.products(id)
        );
      END
    `);

    // 6. جدول تحويلات المخزون
    await pool.request().query(`
      IF NOT EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_NAME = 'stock_transfers' AND TABLE_SCHEMA = 'dbo'
      )
      BEGIN
        CREATE TABLE dbo.stock_transfers (
          id INT IDENTITY(1,1) PRIMARY KEY,
          transfer_number NVARCHAR(50) NOT NULL UNIQUE,
          from_location NVARCHAR(100) NOT NULL,
          to_location NVARCHAR(100) NOT NULL,
          transfer_date DATE NOT NULL,
          status NVARCHAR(20) DEFAULT 'pending',
          notes NVARCHAR(500),
          created_by NVARCHAR(100) NOT NULL,
          created_at DATETIME DEFAULT (GETUTCDATE() AT TIME ZONE 'UTC' AT TIME ZONE 'Egypt Standard Time')
        );
      END
    `);

    // إدراج فئات افتراضية
    const catCount = await pool.request().query('SELECT COUNT(*) AS cnt FROM dbo.product_categories');
    if (catCount.recordset[0].cnt === 0) {
      await pool.request().query(`
        INSERT INTO dbo.product_categories (name, description, icon) VALUES 
        (N'منتجات العناية بالبشرة', N'كريمات ومستحضرات العناية', '🧴'),
        (N'منتجات الشعر', N'شامبو وبلسم ومنتجات تصفيف', '💇'),
        (N'مستحضرات التجميل', N'مكياج وأدوات تجميل', '💄'),
        (N'أدوات ومعدات', N'أدوات الصالون والمعدات', '🔧'),
        (N'مواد التعقيم', N'معقمات ومطهرات', '🧼'),
        (N'مستلزمات أخرى', N'مستلزمات متنوعة', '📦');
      `);
    }

    console.log('Stock tables are ready.');
  } catch (err) {
    console.error('Error ensuring stock tables:', err.message);
    throw err;
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
}


// === APIs المخزون ===

// 1. جلب جميع الفئات
app.get('/api/product-categories', async (req, res) => {
  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    const result = await pool.request()
      .query('SELECT * FROM dbo.product_categories ORDER BY name');
    return res.json(result.recordset || []);
  } catch (err) {
    console.error('Error fetching categories:', err.message);
    return res.status(500).json({ message: 'خطأ في جلب الفئات' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

// 2. إضافة فئة جديدة
app.post('/api/product-categories', async (req, res) => {
  const { name, description, icon } = req.body;
  
  if (!name) {
    return res.status(400).json({ message: 'اسم الفئة مطلوب' });
  }

  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    
    const result = await pool.request()
      .input('name', sql.NVarChar, name.trim())
      .input('description', sql.NVarChar, description || null)
      .input('icon', sql.NVarChar, icon || '📦')
      .query(`
        INSERT INTO dbo.product_categories (name, description, icon)
        VALUES (@name, @description, @icon);
        SELECT SCOPE_IDENTITY() AS id;
      `);
    
    const newId = result.recordset[0].id;
    return res.status(201).json({ message: 'تم إضافة الفئة بنجاح', id: newId });
  } catch (err) {
    console.error('Error creating category:', err.message);
    return res.status(500).json({ message: 'خطأ في إضافة الفئة' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

// 3. جلب جميع المنتجات مع معلومات إضافية
app.get('/api/products', async (req, res) => {
  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    const result = await pool.request().query(`
      SELECT 
        p.*,
        c.name AS category_name,
        s.name AS supplier_name,
        CASE 
          WHEN p.current_stock <= p.min_stock THEN 'low'
          WHEN p.current_stock >= p.max_stock THEN 'overstocked'
          ELSE 'normal'
        END AS stock_status
      FROM dbo.products p
      LEFT JOIN dbo.product_categories c ON p.category_id = c.id
      LEFT JOIN dbo.suppliers s ON p.supplier_id = s.id
      ORDER BY p.name
    `);
    return res.json(result.recordset || []);
  } catch (err) {
    console.error('Error fetching products:', err.message);
    return res.status(500).json({ message: 'خطأ في جلب المنتجات' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

// 4. إضافة منتج جديد
app.post('/api/products', async (req, res) => {
  const { 
    barcode, name, category_id, supplier_id, description, 
    unit, purchase_price, selling_price, current_stock, 
    min_stock, max_stock, reorder_point, location, created_by 
  } = req.body;
  
  if (!name || !category_id) {
    return res.status(400).json({ message: 'الاسم والفئة مطلوبان' });
  }

  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const result = await transaction.request()
        .input('barcode', sql.NVarChar, barcode || null)
        .input('name', sql.NVarChar, name.trim())
        .input('category_id', sql.Int, category_id)
        .input('supplier_id', sql.Int, supplier_id || null)
        .input('description', sql.NVarChar, description || null)
        .input('unit', sql.NVarChar, unit || 'قطعة')
        .input('purchase_price', sql.Decimal(10,2), parseFloat(purchase_price) || 0)
        .input('selling_price', sql.Decimal(10,2), parseFloat(selling_price) || 0)
        .input('current_stock', sql.Int, parseInt(current_stock) || 0)
        .input('min_stock', sql.Int, parseInt(min_stock) || 5)
        .input('max_stock', sql.Int, parseInt(max_stock) || 100)
        .input('reorder_point', sql.Int, parseInt(reorder_point) || 10)
        .input('location', sql.NVarChar, location || null)
        .query(`
          INSERT INTO dbo.products 
          (barcode, name, category_id, supplier_id, description, unit, 
           purchase_price, selling_price, current_stock, min_stock, 
           max_stock, reorder_point, location)
          VALUES 
          (@barcode, @name, @category_id, @supplier_id, @description, @unit,
           @purchase_price, @selling_price, @current_stock, @min_stock,
           @max_stock, @reorder_point, @location);
          SELECT SCOPE_IDENTITY() AS id;
        `);
      
      const newId = result.recordset[0].id;

      // تسجيل حركة مخزون افتتاحية إذا كان هناك كمية
      const stockQty = parseInt(current_stock) || 0;
      if (stockQty > 0) {
        await transaction.request()
          .input('product_id', sql.Int, newId)
          .input('quantity', sql.Int, stockQty)
          .input('created_by', sql.NVarChar, created_by || 'النظام')
          .query(`
            INSERT INTO dbo.stock_movements 
            (product_id, movement_type, quantity, previous_stock, new_stock, notes, created_by)
            VALUES 
            (@product_id, 'افتتاحي', @quantity, 0, @quantity, 'رصيد افتتاحي', @created_by);
          `);
      }

      await transaction.commit();
      return res.status(201).json({ message: 'تم إضافة المنتج بنجاح', id: newId });
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) {
    console.error('Error creating product:', err.message);
    return res.status(500).json({ message: 'خطأ في إضافة المنتج' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

// 5. تحديث منتج
app.put('/api/products/:id', async (req, res) => {
  const { id } = req.params;
  const { 
    name, category_id, supplier_id, description, unit,
    purchase_price, selling_price, min_stock, max_stock,
    reorder_point, location, status 
  } = req.body;

  if (!name) {
    return res.status(400).json({ message: 'اسم المنتج مطلوب' });
  }

  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    
    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('name', sql.NVarChar, name.trim())
      .input('category_id', sql.Int, category_id)
      .input('supplier_id', sql.Int, supplier_id || null)
      .input('description', sql.NVarChar, description || null)
      .input('unit', sql.NVarChar, unit || 'قطعة')
      .input('purchase_price', sql.Decimal(10,2), parseFloat(purchase_price) || 0)
      .input('selling_price', sql.Decimal(10,2), parseFloat(selling_price) || 0)
      .input('min_stock', sql.Int, parseInt(min_stock) || 5)
      .input('max_stock', sql.Int, parseInt(max_stock) || 100)
      .input('reorder_point', sql.Int, parseInt(reorder_point) || 10)
      .input('location', sql.NVarChar, location || null)
      .input('status', sql.NVarChar, status || 'active')
      .query(`
        UPDATE dbo.products 
        SET name = @name, category_id = @category_id, supplier_id = @supplier_id,
            description = @description, unit = @unit, purchase_price = @purchase_price,
            selling_price = @selling_price, min_stock = @min_stock, max_stock = @max_stock,
            reorder_point = @reorder_point, location = @location, status = @status,
            updated_at = GETDATE()
        WHERE id = @id
      `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: 'المنتج غير موجود' });
    }
    
    return res.json({ message: 'تم تحديث المنتج بنجاح' });
  } catch (err) {
    console.error('Error updating product:', err.message);
    return res.status(500).json({ message: 'خطأ في تحديث المنتج' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

// 6. حذف منتج
app.delete('/api/products/:id', async (req, res) => {
  const { id } = req.params;
  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM dbo.products WHERE id = @id');

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: 'المنتج غير موجود' });
    }
    return res.json({ message: 'تم حذف المنتج بنجاح' });
  } catch (err) {
    console.error('Error deleting product:', err.message);
    return res.status(500).json({ message: 'خطأ في حذف المنتج' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

// 7. إضافة حركة مخزون (إضافة/سحب/تعديل)
app.post('/api/stock-movements', async (req, res) => {
  const { 
    product_id, movement_type, quantity, reference_number,
    supplier_id, notes, created_by 
  } = req.body;
  
  if (!product_id || !movement_type || !quantity || !created_by) {
    return res.status(400).json({ message: 'جميع الحقول المطلوبة يجب ملؤها' });
  }

  const parsedQty = parseInt(quantity);
  if (parsedQty === 0) {
    return res.status(400).json({ message: 'الكمية يجب أن تكون أكبر أو أقل من صفر' });
  }

  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // جلب الرصيد الحالي
      const productRes = await transaction.request()
        .input('product_id', sql.Int, product_id)
        .query('SELECT current_stock FROM dbo.products WHERE id = @product_id');
      
      if (!productRes.recordset || productRes.recordset.length === 0) {
        await transaction.rollback();
        return res.status(404).json({ message: 'المنتج غير موجود' });
      }

      const currentStock = productRes.recordset[0].current_stock;
      let newStock = currentStock;

      // حساب الرصيد الجديد بناءً على نوع الحركة
      if (movement_type === 'إضافة' || movement_type === 'شراء') {
        newStock = currentStock + parsedQty;
      } else if (movement_type === 'سحب' || movement_type === 'بيع' || movement_type === 'تالف') {
        if (currentStock < parsedQty) {
          await transaction.rollback();
          return res.status(400).json({ message: 'الكمية المطلوبة أكبر من المتوفر' });
        }
        newStock = currentStock - parsedQty;
      } else if (movement_type === 'تعديل') {
        newStock = parsedQty;
      }

      // تسجيل الحركة
      await transaction.request()
        .input('product_id', sql.Int, product_id)
        .input('movement_type', sql.NVarChar, movement_type)
        .input('quantity', sql.Int, Math.abs(parsedQty))
        .input('previous_stock', sql.Int, currentStock)
        .input('new_stock', sql.Int, newStock)
        .input('reference_number', sql.NVarChar, reference_number || null)
        .input('supplier_id', sql.Int, supplier_id || null)
        .input('notes', sql.NVarChar, notes || null)
        .input('created_by', sql.NVarChar, created_by)
        .query(`
          INSERT INTO dbo.stock_movements 
          (product_id, movement_type, quantity, previous_stock, new_stock, 
           reference_number, supplier_id, notes, created_by)
          VALUES 
          (@product_id, @movement_type, @quantity, @previous_stock, @new_stock,
           @reference_number, @supplier_id, @notes, @created_by);
        `);

      // تحديث رصيد المنتج
      await transaction.request()
        .input('product_id', sql.Int, product_id)
        .input('new_stock', sql.Int, newStock)
        .query(`
          UPDATE dbo.products 
          SET current_stock = @new_stock, updated_at = GETDATE()
          WHERE id = @product_id
        `);

      await transaction.commit();
      return res.status(201).json({ 
        message: 'تم تسجيل الحركة بنجاح',
        new_stock: newStock 
      });
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) {
    console.error('Error creating stock movement:', err.message);
    return res.status(500).json({ message: 'خطأ في تسجيل الحركة' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

// 8. جلب حركات مخزون منتج معين
app.get('/api/products/:id/movements', async (req, res) => {
  const { id } = req.params;
  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    const result = await pool.request()
      .input('product_id', sql.Int, id)
      .query(`
        SELECT m.*, s.name AS supplier_name
        FROM dbo.stock_movements m
        LEFT JOIN dbo.suppliers s ON m.supplier_id = s.id
        WHERE m.product_id = @product_id
        ORDER BY m.created_at DESC
      `);
    return res.json(result.recordset || []);
  } catch (err) {
    console.error('Error fetching movements:', err.message);
    return res.status(500).json({ message: 'خطأ في جلب الحركات' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

// 9. جلب جميع الحركات
app.get('/api/stock-movements', async (req, res) => {
  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    const result = await pool.request().query(`
      SELECT 
        m.*,
        p.name AS product_name,
        s.name AS supplier_name
      FROM dbo.stock_movements m
      INNER JOIN dbo.products p ON m.product_id = p.id
      LEFT JOIN dbo.suppliers s ON m.supplier_id = s.id
      ORDER BY m.created_at DESC
    `);
    return res.json(result.recordset || []);
  } catch (err) {
    console.error('Error fetching movements:', err.message);
    return res.status(500).json({ message: 'خطأ في جلب الحركات' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

// 10. إحصائيات المخزون
app.get('/api/stock/stats', async (req, res) => {
  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    
    // عدد المنتجات
    const productsCount = await pool.request()
      .query('SELECT COUNT(*) AS total FROM dbo.products WHERE status = \'active\'');
    
    // المنتجات المنخفضة
    const lowStock = await pool.request()
      .query('SELECT COUNT(*) AS total FROM dbo.products WHERE current_stock <= min_stock AND status = \'active\'');
    
    // المنتجات النافذة
    const outOfStock = await pool.request()
      .query('SELECT COUNT(*) AS total FROM dbo.products WHERE current_stock = 0 AND status = \'active\'');
    
    // قيمة المخزون
    const inventoryValue = await pool.request()
      .query('SELECT ISNULL(SUM(current_stock * purchase_price), 0) AS total FROM dbo.products WHERE status = \'active\'');
    
    // الحركات اليوم
    const todayMovements = await pool.request()
      .query(`
        SELECT COUNT(*) AS total 
        FROM dbo.stock_movements 
        WHERE CAST(created_at AS DATE) = CAST(GETDATE() AS DATE)
      `);

    const stats = {
      total_products: productsCount.recordset[0]?.total || 0,
      low_stock: lowStock.recordset[0]?.total || 0,
      out_of_stock: outOfStock.recordset[0]?.total || 0,
      inventory_value: parseFloat(inventoryValue.recordset[0]?.total || 0),
      today_movements: todayMovements.recordset[0]?.total || 0
    };
    
    return res.json(stats);
  } catch (err) {
    console.error('Error fetching stock stats:', err.message);
    return res.json({
      total_products: 0,
      low_stock: 0,
      out_of_stock: 0,
      inventory_value: 0,
      today_movements: 0
    });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

async function ensureClientsTableExists() {
  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);

    // 1️⃣ جدول العملاء (الأساسي)
    await pool.request().query(`
      IF NOT EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_NAME = 'clients' AND TABLE_SCHEMA = 'dbo'
      )
      BEGIN
        CREATE TABLE dbo.clients (
          id INT IDENTITY(1,1) PRIMARY KEY,
          name NVARCHAR(100) NOT NULL,
          phone NVARCHAR(11) NOT NULL UNIQUE,
          balance_basic DECIMAL(10,2) DEFAULT 0,
          balance_offers DECIMAL(10,2) DEFAULT 0,
          balance_laser DECIMAL(10,2) DEFAULT 0,
          balance_skin DECIMAL(10,2) DEFAULT 0,
          balance_old DECIMAL(10,2) DEFAULT 0,
          created_at DATETIME DEFAULT (GETUTCDATE() AT TIME ZONE 'UTC' AT TIME ZONE 'Egypt Standard Time')
        );
      END
    `);

    // 2️⃣ جدول الأرقام الإضافية
    await pool.request().query(`
      IF NOT EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_NAME = 'client_phones' AND TABLE_SCHEMA = 'dbo'
      )
      BEGIN
        CREATE TABLE dbo.client_phones (
          id INT IDENTITY(1,1) PRIMARY KEY,
          client_id INT NOT NULL,
          phone NVARCHAR(11) NOT NULL,
          phone_type NVARCHAR(50) DEFAULT N'إضافي',
          notes NVARCHAR(200),
          created_at DATETIME DEFAULT GETDATE(),
          CONSTRAINT FK_client_phones_client FOREIGN KEY (client_id) 
            REFERENCES dbo.clients(id) ON DELETE CASCADE
        );
      END
    `);

    // 3️⃣ جدول المعاملات
    await pool.request().query(`
      IF NOT EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_NAME = 'transactions' AND TABLE_SCHEMA = 'dbo'
      )
      BEGIN
        CREATE TABLE dbo.transactions (
          id INT IDENTITY(1,1) PRIMARY KEY,
          client_id INT NOT NULL,
          transaction_type NVARCHAR(50) NOT NULL,
          amount DECIMAL(10,2) NOT NULL,
          balance_type NVARCHAR(50) NOT NULL,
          payment_method NVARCHAR(50),
          created_by NVARCHAR(100) NOT NULL,
          notes NVARCHAR(500),
          created_at DATETIME DEFAULT GETDATE(),
          CONSTRAINT FK_transactions_client FOREIGN KEY (client_id) 
            REFERENCES dbo.clients(id) ON DELETE CASCADE
        );
      END
    `);

    await pool.request().query(`
      IF NOT EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'transactions' AND COLUMN_NAME = 'shift_id'
      )
      BEGIN
        ALTER TABLE dbo.transactions ADD shift_id INT NULL;
      END
    `);

    // 4️⃣ جدول العروض المشتراة (هنا! قبل الجداول اللي بتشاور عليه)
    await pool.request().query(`
      IF NOT EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_NAME = 'client_purchased_offers' AND TABLE_SCHEMA = 'dbo'
      )
      BEGIN
        CREATE TABLE dbo.client_purchased_offers (
          id INT IDENTITY(1,1) PRIMARY KEY,
          client_id INT NOT NULL,
          offer_id INT NOT NULL,
          offer_name NVARCHAR(200) NOT NULL,
          offer_type NVARCHAR(20) NOT NULL,
          services NVARCHAR(MAX) NOT NULL,
          purchase_price DECIMAL(10,2) NOT NULL,
          payment_method NVARCHAR(50) NOT NULL,
          purchase_date DATETIME DEFAULT GETDATE(),
          status NVARCHAR(20) DEFAULT 'active',
          notes NVARCHAR(500),
          created_by NVARCHAR(100) NOT NULL,
          CONSTRAINT FK_purchased_offers_client FOREIGN KEY (client_id) 
            REFERENCES dbo.clients(id) ON DELETE CASCADE,
          CONSTRAINT FK_purchased_offers_offer FOREIGN KEY (offer_id) 
            REFERENCES dbo.offers(id)
        );
      END
      ELSE
      BEGIN
        -- إزالة الحقول غير الضرورية إذا كانت موجودة
        IF EXISTS (
          SELECT * FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_NAME = 'client_purchased_offers' AND COLUMN_NAME = 'total_sessions'
        )
        BEGIN
          ALTER TABLE dbo.client_purchased_offers DROP COLUMN total_sessions;
        END
        
        IF EXISTS (
          SELECT * FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_NAME = 'client_purchased_offers' AND COLUMN_NAME = 'remaining_sessions'
        )
        BEGIN
          ALTER TABLE dbo.client_purchased_offers DROP COLUMN remaining_sessions;
        END
      END
    `);

    // 5️⃣ جدول جلسات الخدمات (بعد client_purchased_offers)
    await pool.request().query(`
      IF NOT EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_NAME = 'offer_service_sessions' AND TABLE_SCHEMA = 'dbo'
      )
      BEGIN
        CREATE TABLE dbo.offer_service_sessions (
          id INT IDENTITY(1,1) PRIMARY KEY,
          purchased_offer_id INT NOT NULL,
          service_id INT NOT NULL,
          service_name NVARCHAR(200) NOT NULL,
          total_sessions INT NOT NULL,
          remaining_sessions INT NOT NULL,
          created_at DATETIME DEFAULT GETDATE(),
          CONSTRAINT FK_service_sessions_offer FOREIGN KEY (purchased_offer_id) 
            REFERENCES dbo.client_purchased_offers(id) ON DELETE CASCADE
        );
      END
    `);

    // 6️⃣ جدول استخدام الخدمات الفردية (بعد client_purchased_offers)
    await pool.request().query(`
      IF NOT EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_NAME = 'offer_service_usage' AND TABLE_SCHEMA = 'dbo'
      )
      BEGIN
        CREATE TABLE dbo.offer_service_usage (
          id INT IDENTITY(1,1) PRIMARY KEY,
          purchased_offer_id INT NOT NULL,
          service_id INT NOT NULL,
          service_name NVARCHAR(200) NOT NULL,
          used_by NVARCHAR(100) NOT NULL,
          used_at DATETIME DEFAULT GETDATE(),
          CONSTRAINT FK_service_usage_offer FOREIGN KEY (purchased_offer_id) 
            REFERENCES dbo.client_purchased_offers(id) ON DELETE CASCADE
        );
      END
    `);

    console.log('✅ Clients and related tables are ready.');
  } catch (err) {
    console.error('Error ensuring clients table:', err.message);
    throw err;
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
}
async function fixBookingsTable() {
  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);

    // إضافة client_name إذا لم يكن موجوداً أو تعديله ليقبل NULL مؤقتاً
    await pool.request().query(`
      IF NOT EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'bookings' AND COLUMN_NAME = 'client_name'
      )
      BEGIN
        ALTER TABLE dbo.bookings ADD client_name NVARCHAR(100) NULL;
      END
      ELSE
      BEGIN
        -- إذا كان الحقل موجوداً ولكنه لا يقبل NULL، نجعله يقبل NULL مؤقتاً
        ALTER TABLE dbo.bookings ALTER COLUMN client_name NVARCHAR(100) NULL;
      END
    `);

    // إضافة duration إذا لم يكن موجوداً
    await pool.request().query(`
      IF NOT EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'bookings' AND COLUMN_NAME = 'duration'
      )
      BEGIN
        ALTER TABLE dbo.bookings ADD duration INT NULL;
      END
      ELSE
      BEGIN
        -- إذا كان الحقل موجوداً ولكنه لا يقبل NULL، نجعله يقبل NULL مؤقتاً
        ALTER TABLE dbo.bookings ALTER COLUMN duration INT NULL;
      END
    `);

    // إضافة shift_id لربط الحجز بالشيفت
    await pool.request().query(`
      IF NOT EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'bookings' AND COLUMN_NAME = 'shift_id'
      )
      BEGIN
        ALTER TABLE dbo.bookings ADD shift_id INT NULL;
      END
    `);

    console.log('✅ Bookings table fixed with client_name, duration, and shift_id!');
  } catch (err) {
    console.error('❌ Error fixing bookings table:', err.message);
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
}

// === APIs الموردين ===

// جلب جميع الموردين
app.get('/api/suppliers', async (req, res) => {
  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    const result = await pool.request()
      .query('SELECT * FROM dbo.suppliers ORDER BY id DESC');
    return res.json(result.recordset || []);
  } catch (err) {
    console.error('Error fetching suppliers:', err.message);
    return res.status(500).json({ message: 'حدث خطأ أثناء جلب الموردين' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

// جلب مورد واحد
app.get('/api/suppliers/:id', async (req, res) => {
  const { id } = req.params;
  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM dbo.suppliers WHERE id = @id');
    
    if (result.recordset && result.recordset.length > 0) {
      return res.json(result.recordset[0]);
    } else {
      return res.status(404).json({ message: 'المورد غير موجود' });
    }
  } catch (err) {
    console.error('Error fetching supplier:', err.message);
    return res.status(500).json({ message: 'حدث خطأ أثناء جلب المورد' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

// إضافة مورد جديد
app.post('/api/suppliers', async (req, res) => {
  const { name, phone, email, company, address, balance, credit_limit, notes } = req.body;
  
  if (!name || !phone) {
    return res.status(400).json({ message: 'الاسم ورقم الهاتف مطلوبان' });
  }

  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    
    const checkRes = await pool.request()
      .input('phone', sql.NVarChar, phone)
      .query('SELECT id FROM dbo.suppliers WHERE phone = @phone');
    
    if (checkRes.recordset && checkRes.recordset.length > 0) {
      return res.status(400).json({ message: 'رقم الهاتف مسجل مسبقاً' });
    }

    const result = await pool.request()
      .input('name', sql.NVarChar, name.trim())
      .input('phone', sql.NVarChar, phone.trim())
      .input('email', sql.NVarChar, email ? email.trim() : null)
      .input('company', sql.NVarChar, company ? company.trim() : null)
      .input('address', sql.NVarChar, address ? address.trim() : null)
      .input('balance', sql.Decimal(10,2), parseFloat(balance) || 0)
      .input('credit_limit', sql.Decimal(10,2), parseFloat(credit_limit) || 0)
      .input('notes', sql.NVarChar, notes ? notes.trim() : null)
      .query(`
        INSERT INTO dbo.suppliers (name, phone, email, company, address, balance, credit_limit, notes)
        VALUES (@name, @phone, @email, @company, @address, @balance, @credit_limit, @notes);
        SELECT SCOPE_IDENTITY() AS id;
      `);
    
    const newId = result.recordset[0].id;
    return res.status(201).json({ message: 'تم إضافة المورد بنجاح', id: newId });
  } catch (err) {
    console.error('Error creating supplier:', err.message);
    return res.status(500).json({ message: 'حدث خطأ أثناء إضافة المورد' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

// تحديث مورد
app.put('/api/suppliers/:id', async (req, res) => {
  const { id } = req.params;
  const { name, phone, email, company, address, credit_limit, status, notes } = req.body;

  if (!name) {
    return res.status(400).json({ message: 'الاسم مطلوب' });
  }

  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    
    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('name', sql.NVarChar, name.trim())
      .input('phone', sql.NVarChar, phone ? phone.trim() : null)
      .input('email', sql.NVarChar, email ? email.trim() : null)
      .input('company', sql.NVarChar, company ? company.trim() : null)
      .input('address', sql.NVarChar, address ? address.trim() : null)
      .input('credit_limit', sql.Decimal(10,2), parseFloat(credit_limit) || 0)
      .input('status', sql.NVarChar, status || 'active')
      .input('notes', sql.NVarChar, notes ? notes.trim() : null)
      .query(`
        UPDATE dbo.suppliers 
        SET name = @name, phone = @phone, email = @email, company = @company,
            address = @address, credit_limit = @credit_limit, status = @status, notes = @notes
        WHERE id = @id
      `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: 'المورد غير موجود' });
    }
    
    return res.json({ message: 'تم تحديث المورد بنجاح' });
  } catch (err) {
    console.error('Error updating supplier:', err.message);
    return res.status(500).json({ message: 'حدث خطأ أثناء تحديث المورد' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

// حذف مورد
app.delete('/api/suppliers/:id', async (req, res) => {
  const { id } = req.params;
  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM dbo.suppliers WHERE id = @id');

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: 'المورد غير موجود' });
    }
    return res.json({ message: 'تم حذف المورد بنجاح' });
  } catch (err) {
    console.error('Error deleting supplier:', err.message);
    return res.status(500).json({ message: 'حدث خطأ أثناء حذف المورد' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

// جلب جميع الفواتير
app.get('/api/supplier-invoices', async (req, res) => {
  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    const result = await pool.request().query(`
      SELECT i.*, s.name AS supplier_name
      FROM dbo.supplier_invoices i
      INNER JOIN dbo.suppliers s ON i.supplier_id = s.id
      ORDER BY i.created_at DESC
    `);
    return res.json(result.recordset || []);
  } catch (err) {
    console.error('Error fetching invoices:', err.message);
    return res.status(500).json({ message: 'حدث خطأ أثناء جلب الفواتير' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

// جلب فواتير مورد معين
app.get('/api/suppliers/:supplierId/invoices', async (req, res) => {
  const { supplierId } = req.params;
  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    const result = await pool.request()
      .input('supplier_id', sql.Int, supplierId)
      .query('SELECT * FROM dbo.supplier_invoices WHERE supplier_id = @supplier_id ORDER BY created_at DESC');
    return res.json(result.recordset || []);
  } catch (err) {
    console.error('Error fetching supplier invoices:', err.message);
    return res.status(500).json({ message: 'حدث خطأ أثناء جلب فواتير المورد' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

// إضافة فاتورة جديدة
app.post('/api/supplier-invoices', async (req, res) => {
  const { invoice_number, supplier_id, invoice_date, due_date, total_amount, paid_amount, description } = req.body;
  
  if (!invoice_number || !supplier_id || !invoice_date || !total_amount) {
    return res.status(400).json({ message: 'جميع الحقول المطلوبة يجب ملؤها' });
  }

  const parsedTotal = parseFloat(total_amount);
  const parsedPaid = parseFloat(paid_amount) || 0;
  const remaining = parsedTotal - parsedPaid;

  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    
    const checkRes = await pool.request()
      .input('invoice_number', sql.NVarChar, invoice_number)
      .query('SELECT id FROM dbo.supplier_invoices WHERE invoice_number = @invoice_number');
    
    if (checkRes.recordset && checkRes.recordset.length > 0) {
      return res.status(400).json({ message: 'رقم الفاتورة موجود مسبقاً' });
    }

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const invoiceResult = await transaction.request()
        .input('invoice_number', sql.NVarChar, invoice_number.trim())
        .input('supplier_id', sql.Int, supplier_id)
        .input('invoice_date', sql.Date, invoice_date)
        .input('due_date', sql.Date, due_date || null)
        .input('total_amount', sql.Decimal(10,2), parsedTotal)
        .input('paid_amount', sql.Decimal(10,2), parsedPaid)
        .input('remaining_amount', sql.Decimal(10,2), remaining)
        .input('status', sql.NVarChar, remaining === 0 ? 'paid' : (parsedPaid > 0 ? 'partial' : 'pending'))
        .input('description', sql.NVarChar, description || null)
        .query(`
          INSERT INTO dbo.supplier_invoices 
          (invoice_number, supplier_id, invoice_date, due_date, total_amount, paid_amount, remaining_amount, status, description)
          VALUES (@invoice_number, @supplier_id, @invoice_date, @due_date, @total_amount, @paid_amount, @remaining_amount, @status, @description);
          SELECT SCOPE_IDENTITY() AS id;
        `);
      
      const newInvoiceId = invoiceResult.recordset[0].id;

      await transaction.request()
        .input('supplier_id', sql.Int, supplier_id)
        .input('remaining', sql.Decimal(10,2), remaining)
        .query('UPDATE dbo.suppliers SET balance = balance + @remaining, last_transaction = GETDATE() WHERE id = @supplier_id');

      await transaction.commit();
      return res.status(201).json({ message: 'تم إضافة الفاتورة بنجاح', id: newInvoiceId });
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) {
    console.error('Error creating invoice:', err.message);
    return res.status(500).json({ message: 'حدث خطأ أثناء إضافة الفاتورة' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

// حذف فاتورة (يتم تنفيذه في المنشور التالي بسبب طول الكود)
app.delete('/api/supplier-invoices/:id', async (req, res) => {
  const { id } = req.params;
  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const invoiceRes = await transaction.request()
        .input('id', sql.Int, id)
        .query('SELECT supplier_id, remaining_amount FROM dbo.supplier_invoices WHERE id = @id');
      
      if (!invoiceRes.recordset || invoiceRes.recordset.length === 0) {
        await transaction.rollback();
        return res.status(404).json({ message: 'الفاتورة غير موجودة' });
      }

      const invoice = invoiceRes.recordset[0];
      await transaction.request()
        .input('supplier_id', sql.Int, invoice.supplier_id)
        .input('remaining', sql.Decimal(10,2), invoice.remaining_amount)
        .query('UPDATE dbo.suppliers SET balance = balance - @remaining WHERE id = @supplier_id');

      await transaction.request()
        .input('id', sql.Int, id)
        .query('DELETE FROM dbo.supplier_invoices WHERE id = @id');

      await transaction.commit();
      return res.json({ message: 'تم حذف الفاتورة بنجاح' });
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) {
    console.error('Error deleting invoice:', err.message);
    return res.status(500).json({ message: 'حدث خطأ أثناء حذف الفاتورة' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

// جلب جميع المدفوعات
app.get('/api/supplier-payments', async (req, res) => {
  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    const result = await pool.request().query(`
      SELECT p.*, s.name AS supplier_name, i.invoice_number
      FROM dbo.supplier_payments p
      INNER JOIN dbo.suppliers s ON p.supplier_id = s.id
      INNER JOIN dbo.supplier_invoices i ON p.invoice_id = i.id
      ORDER BY p.created_at DESC
    `);
    return res.json(result.recordset || []);
  } catch (err) {
    console.error('Error fetching payments:', err.message);
    return res.status(500).json({ message: 'حدث خطأ أثناء جلب المدفوعات' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

// إضافة دفعة جديدة
app.post('/api/supplier-payments', async (req, res) => {
  const { invoice_id, supplier_id, amount, payment_method, payment_date, reference_number, notes, created_by } = req.body;
  
  if (!invoice_id || !supplier_id || !amount || !payment_method || !payment_date || !created_by) {
    return res.status(400).json({ message: 'جميع الحقول المطلوبة يجب ملؤها' });
  }

  const parsedAmount = parseFloat(amount);
  if (parsedAmount <= 0) {
    return res.status(400).json({ message: 'المبلغ يجب أن يكون أكبر من صفر' });
  }

  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const invoiceRes = await transaction.request()
        .input('invoice_id', sql.Int, invoice_id)
        .query('SELECT remaining_amount, paid_amount FROM dbo.supplier_invoices WHERE id = @invoice_id');
      
      if (!invoiceRes.recordset || invoiceRes.recordset.length === 0) {
        await transaction.rollback();
        return res.status(404).json({ message: 'الفاتورة غير موجودة' });
      }

      const remainingAmount = parseFloat(invoiceRes.recordset[0].remaining_amount);
      
      if (parsedAmount > remainingAmount) {
        await transaction.rollback();
        return res.status(400).json({ message: 'المبلغ المدفوع أكبر من المتبقي على الفاتورة' });
      }

      const paymentResult = await transaction.request()
        .input('invoice_id', sql.Int, invoice_id)
        .input('supplier_id', sql.Int, supplier_id)
        .input('amount', sql.Decimal(10,2), parsedAmount)
        .input('payment_method', sql.NVarChar, payment_method)
        .input('payment_date', sql.Date, payment_date)
        .input('reference_number', sql.NVarChar, reference_number || null)
        .input('notes', sql.NVarChar, notes || null)
        .input('created_by', sql.NVarChar, created_by)
        .query(`
          INSERT INTO dbo.supplier_payments 
          (invoice_id, supplier_id, amount, payment_method, payment_date, reference_number, notes, created_by)
          VALUES (@invoice_id, @supplier_id, @amount, @payment_method, @payment_date, @reference_number, @notes, @created_by);
          SELECT SCOPE_IDENTITY() AS id;
        `);
      
      const newPaymentId = paymentResult.recordset[0].id;
      const newRemaining = remainingAmount - parsedAmount;
      const newStatus = newRemaining === 0 ? 'paid' : 'partial';

      await transaction.request()
        .input('invoice_id', sql.Int, invoice_id)
        .input('amount', sql.Decimal(10,2), parsedAmount)
        .input('remaining_amount', sql.Decimal(10,2), newRemaining)
        .input('status', sql.NVarChar, newStatus)
        .query(`
          UPDATE dbo.supplier_invoices 
          SET paid_amount = paid_amount + @amount, remaining_amount = @remaining_amount, status = @status
          WHERE id = @invoice_id
        `);

      await transaction.request()
        .input('supplier_id', sql.Int, supplier_id)
        .input('amount', sql.Decimal(10,2), parsedAmount)
        .query('UPDATE dbo.suppliers SET balance = balance - @amount, last_transaction = GETDATE() WHERE id = @supplier_id');

      await transaction.commit();
      return res.status(201).json({ message: 'تم تسجيل الدفعة بنجاح', id: newPaymentId });
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) {
    console.error('Error creating payment:', err.message);
    return res.status(500).json({ message: 'حدث خطأ أثناء تسجيل الدفعة' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

// حذف دفعة
app.delete('/api/supplier-payments/:id', async (req, res) => {
  const { id } = req.params;
  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const paymentRes = await transaction.request()
        .input('id', sql.Int, id)
        .query('SELECT invoice_id, supplier_id, amount FROM dbo.supplier_payments WHERE id = @id');
      
      if (!paymentRes.recordset || paymentRes.recordset.length === 0) {
        await transaction.rollback();
        return res.status(404).json({ message: 'الدفعة غير موجودة' });
      }

      const payment = paymentRes.recordset[0];

      await transaction.request()
        .input('invoice_id', sql.Int, payment.invoice_id)
        .input('amount', sql.Decimal(10,2), payment.amount)
        .query(`
          UPDATE dbo.supplier_invoices 
          SET paid_amount = paid_amount - @amount,
              remaining_amount = remaining_amount + @amount,
              status = CASE 
                WHEN paid_amount - @amount = 0 THEN 'pending'
                WHEN remaining_amount + @amount > 0 THEN 'partial'
                ELSE 'paid'
              END
          WHERE id = @invoice_id
        `);

      await transaction.request()
        .input('supplier_id', sql.Int, payment.supplier_id)
        .input('amount', sql.Decimal(10,2), payment.amount)
        .query('UPDATE dbo.suppliers SET balance = balance + @amount WHERE id = @supplier_id');

      await transaction.request()
        .input('id', sql.Int, id)
        .query('DELETE FROM dbo.supplier_payments WHERE id = @id');

      await transaction.commit();
      return res.json({ message: 'تم حذف الدفعة بنجاح' });
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) {
    console.error('Error deleting payment:', err.message);
    return res.status(500).json({ message: 'حدث خطأ أثناء حذف الدفعة' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

// إحصائيات الموردين - نسخة محسنة ومحمية من الأخطاء
app.get('/api/suppliers/stats', async (req, res) => {
  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    
    // عدد الموردين
    const suppliersCount = await pool.request()
      .query('SELECT COUNT(*) AS total FROM dbo.suppliers');
    
    // المستحقات
    const totalDue = await pool.request()
      .query('SELECT ISNULL(SUM(balance), 0) AS total FROM dbo.suppliers WHERE balance > 0');
    
    // المدفوعات الشهرية
    const monthlyPayments = await pool.request()
      .query(`
        SELECT ISNULL(SUM(amount), 0) AS total 
        FROM dbo.supplier_payments 
        WHERE MONTH(payment_date) = MONTH(GETDATE()) AND YEAR(payment_date) = YEAR(GETDATE())
      `);
    
    // الفواتير المعلقة
    const pendingInvoices = await pool.request()
      .query("SELECT COUNT(*) AS total FROM dbo.supplier_invoices WHERE status = 'pending'");
    
    // التأكد من أن جميع القيم صحيحة
    const stats = {
      total_suppliers: suppliersCount.recordset[0]?.total || 0,
      total_due: parseFloat(totalDue.recordset[0]?.total || 0),
      monthly_payments: parseFloat(monthlyPayments.recordset[0]?.total || 0),
      pending_invoices: pendingInvoices.recordset[0]?.total || 0
    };
    
    return res.json(stats);
  } catch (err) {
    console.error('Error fetching suppliers stats:', err.message);
    console.error('Full error:', err); // لمعرفة الخطأ الكامل
    // إرجاع قيم افتراضية بدلاً من خطأ 500
    return res.json({
      total_suppliers: 0,
      total_due: 0,
      monthly_payments: 0,
      pending_invoices: 0
    });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

// === APIs الشيفتات ===

// 1. جلب الشيفت المفتوح للمستخدم
app.get('/api/shifts/current/:userId', async (req, res) => {
  const { userId } = req.params;
  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    const result = await pool.request()
      .input('userId', sql.Int, userId)
      .query(`
        SELECT * FROM dbo.shifts 
        WHERE user_id = @userId AND status = 'open'
        ORDER BY start_time DESC
      `);
    
    if (result.recordset && result.recordset.length > 0) {
      return res.json(result.recordset[0]);
    } else {
      return res.json(null);
    }
  } catch (err) {
    console.error('Error fetching current shift:', err.message);
    return res.status(500).json({ message: 'حدث خطأ أثناء جلب الشيفت' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

// 2. بدء شيفت جديد
app.post('/api/shifts/start', async (req, res) => {
  const { user_id, user_name, shift_type } = req.body;
  
  if (!user_id || !user_name || !shift_type) {
    return res.status(400).json({ message: 'جميع الحقول مطلوبة' });
  }

  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    
    // التحقق من عدم وجود شيفت مفتوح
    const checkRes = await pool.request()
      .input('user_id', sql.Int, user_id)
      .query('SELECT id FROM dbo.shifts WHERE user_id = @user_id AND status = \'open\'');
    
    if (checkRes.recordset && checkRes.recordset.length > 0) {
      return res.status(400).json({ message: 'لديك شيفت مفتوح بالفعل' });
    }

    const result = await pool.request()
      .input('user_id', sql.Int, user_id)
      .input('user_name', sql.NVarChar, user_name)
      .input('shift_type', sql.NVarChar, shift_type)
      .query(`
        INSERT INTO dbo.shifts (user_id, user_name, shift_type)
        VALUES (@user_id, @user_name, @shift_type);
        SELECT SCOPE_IDENTITY() AS id;
      `);
    
    const newId = result.recordset[0].id;
    return res.status(201).json({ message: 'تم بدء الشيفت بنجاح', id: newId });
  } catch (err) {
    console.error('Error starting shift:', err.message);
    return res.status(500).json({ message: 'حدث خطأ أثناء بدء الشيفت' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

// 3. إضافة عملية للشيفت
app.post('/api/shifts/:id/operation', async (req, res) => {
  const { id } = req.params;
  const { operation_type, client_name, client_phone, amount, payment_method, balance_type, description } = req.body;
  
  if (!operation_type || !amount) {
    return res.status(400).json({ message: 'نوع العملية والمبلغ مطلوبان' });
  }

  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    
    await pool.request()
      .input('shift_id', sql.Int, id)
      .input('operation_type', sql.NVarChar, operation_type)
      .input('client_name', sql.NVarChar, client_name || null)
      .input('client_phone', sql.NVarChar, client_phone || null)
      .input('amount', sql.Decimal(10, 2), parseFloat(amount))
      .input('payment_method', sql.NVarChar, payment_method || null)
      .input('balance_type', sql.NVarChar, balance_type || null)
      .input('description', sql.NVarChar, description || null)
      .query(`
        INSERT INTO dbo.shift_operations 
        (shift_id, operation_type, client_name, client_phone, amount, payment_method, balance_type, description)
        VALUES (@shift_id, @operation_type, @client_name, @client_phone, @amount, @payment_method, @balance_type, @description);
      `);
    
    // تحديث إجماليات الشيفت
    let updateField = '';
    if (payment_method === 'نقدي') updateField = 'total_cash';
    else if (payment_method === 'محفظة') updateField = 'total_wallet';
    else if (payment_method === 'فيزا') updateField = 'total_visa';
    else if (payment_method === 'تحويل داخلي') updateField = 'total_internal';
    
    if (updateField) {
      await pool.request()
        .input('shift_id', sql.Int, id)
        .input('amount', sql.Decimal(10, 2), parseFloat(amount))
        .query(`
          UPDATE dbo.shifts 
          SET ${updateField} = ${updateField} + @amount
          WHERE id = @shift_id
        `);
    }
    
    return res.status(201).json({ message: 'تم إضافة العملية بنجاح' });
  } catch (err) {
    console.error('Error adding operation:', err.message);
    return res.status(500).json({ message: 'حدث خطأ أثناء إضافة العملية' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

// 4. جلب عمليات الشيفت
app.get('/api/shifts/:id/operations', async (req, res) => {
  const { id } = req.params;
  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    const result = await pool.request()
      .input('shift_id', sql.Int, id)
      .query('SELECT * FROM dbo.shift_operations WHERE shift_id = @shift_id ORDER BY operation_time DESC');
    return res.json(result.recordset || []);
  } catch (err) {
    console.error('Error fetching operations:', err.message);
    return res.status(500).json({ message: 'حدث خطأ أثناء جلب العمليات' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

// 5. إغلاق الشيفت
app.post('/api/shifts/:id/close', async (req, res) => {
  const { id } = req.params;
  const { notes } = req.body;
  
  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    
    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('notes', sql.NVarChar, notes || null)
      .query(`
        UPDATE dbo.shifts 
        SET status = 'closed', end_time = GETDATE(), notes = @notes
        WHERE id = @id AND status = 'open';
        SELECT @@ROWCOUNT AS affected;
      `);
    
    if (result.recordset[0].affected === 0) {
      return res.status(404).json({ message: 'الشيفت غير موجود أو مغلق بالفعل' });
    }
    
    return res.json({ message: 'تم إغلاق الشيفت بنجاح' });
  } catch (err) {
    console.error('Error closing shift:', err.message);
    return res.status(500).json({ message: 'حدث خطأ أثناء إغلاق الشيفت' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

// 6. جلب جميع شيفتات اليوم
app.get('/api/shifts/today', async (req, res) => {
  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    const result = await pool.request().query(`
      SELECT * FROM dbo.shifts 
      WHERE CAST(start_time AS DATE) = CAST(GETDATE() AS DATE)
      ORDER BY start_time DESC
    `);
    return res.json(result.recordset || []);
  } catch (err) {
    console.error('Error fetching today shifts:', err.message);
    return res.status(500).json({ message: 'حدث خطأ أثناء جلب شيفتات اليوم' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

// 7. جلب تفاصيل شيفت
app.get('/api/shifts/:id', async (req, res) => {
  const { id } = req.params;
  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM dbo.shifts WHERE id = @id');
    
    if (result.recordset && result.recordset.length > 0) {
      return res.json(result.recordset[0]);
    } else {
      return res.status(404).json({ message: 'الشيفت غير موجود' });
    }
  } catch (err) {
    console.error('Error fetching shift:', err.message);
    return res.status(500).json({ message: 'حدث خطأ أثناء جلب الشيفت' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

// دالة إنشاء جداول الشيفتات
async function ensureShiftsTablesExist() {
  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);

    // جدول الشيفتات
    await pool.request().query(`
      IF NOT EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_NAME = 'shifts' AND TABLE_SCHEMA = 'dbo'
      )
      BEGIN
        CREATE TABLE dbo.shifts (
          id INT IDENTITY(1,1) PRIMARY KEY,
          shift_type NVARCHAR(20) NOT NULL,
          user_id INT NOT NULL,
          user_name NVARCHAR(100) NOT NULL,
          start_time DATETIME NOT NULL DEFAULT GETDATE(),
          end_time DATETIME NULL,
          status NVARCHAR(20) NOT NULL DEFAULT 'open',
          total_cash DECIMAL(10,2) DEFAULT 0,
          total_wallet DECIMAL(10,2) DEFAULT 0,
          total_visa DECIMAL(10,2) DEFAULT 0,
          total_internal DECIMAL(10,2) DEFAULT 0,
          total_deductions DECIMAL(10,2) DEFAULT 0,
          notes NVARCHAR(500),
          created_at DATETIME DEFAULT GETDATE(),
          CONSTRAINT FK_shifts_user FOREIGN KEY (user_id) 
            REFERENCES dbo.accounts(id)
        );
      END
    `);

    // جدول عمليات الشيفت
    await pool.request().query(`
      IF NOT EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_NAME = 'shift_operations' AND TABLE_SCHEMA = 'dbo'
      )
      BEGIN
        CREATE TABLE dbo.shift_operations (
          id INT IDENTITY(1,1) PRIMARY KEY,
          shift_id INT NOT NULL,
          operation_type NVARCHAR(50) NOT NULL,
          client_name NVARCHAR(100),
          client_phone NVARCHAR(11),
          amount DECIMAL(10,2) NOT NULL,
          payment_method NVARCHAR(50),
          balance_type NVARCHAR(50),
          description NVARCHAR(500),
          booking_id INT NULL,
          operation_time DATETIME DEFAULT GETDATE(),
          CONSTRAINT FK_shift_operations_shift FOREIGN KEY (shift_id) 
            REFERENCES dbo.shifts(id) ON DELETE CASCADE
        );
      END
    `);
    
    // إضافة حقل booking_id للجدول الموجود
    await pool.request().query(`
      IF NOT EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'shift_operations' AND COLUMN_NAME = 'booking_id'
      )
      BEGIN
        ALTER TABLE dbo.shift_operations ADD booking_id INT NULL;
      END
    `);

    // إضافة shift_id للمعاملات
    await pool.request().query(`
      IF NOT EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'transactions' AND COLUMN_NAME = 'shift_id'
      )
      BEGIN
        ALTER TABLE dbo.transactions ADD shift_id INT NULL;
      END
    `);

    console.log('Shifts tables are ready.');
  } catch (err) {
    console.error('Error ensuring shifts tables:', err.message);
    throw err;
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
}

// === APIs المحاسب والخزنة ===

// 1. حفظ تقرير يوم في الخزنة
app.post('/api/treasury/save-daily-report', async (req, res) => {
  const { date, total_cash, total_wallet, total_visa, total_internal, shifts_count, saved_by } = req.body;
  
  if (!date || !saved_by) {
    return res.status(400).json({ message: 'التاريخ واسم الموظف مطلوبان' });
  }

  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    
    // التحقق من عدم وجود تقرير لنفس التاريخ
    const checkRes = await pool.request()
      .input('date', sql.Date, date)
      .query('SELECT id FROM dbo.daily_reports WHERE report_date = @date');
    
    if (checkRes.recordset && checkRes.recordset.length > 0) {
      return res.status(400).json({ message: 'يوجد تقرير محفوظ لهذا التاريخ بالفعل' });
    }

    const result = await pool.request()
      .input('report_date', sql.Date, date)
      .input('total_cash', sql.Decimal(10,2), parseFloat(total_cash) || 0)
      .input('total_wallet', sql.Decimal(10,2), parseFloat(total_wallet) || 0)
      .input('total_visa', sql.Decimal(10,2), parseFloat(total_visa) || 0)
      .input('total_internal', sql.Decimal(10,2), parseFloat(total_internal) || 0)
      .input('shifts_count', sql.Int, parseInt(shifts_count) || 0)
      .input('saved_by', sql.NVarChar, saved_by)
      .query(`
        INSERT INTO dbo.daily_reports (report_date, total_cash, total_wallet, total_visa, total_internal, shifts_count, saved_by)
        VALUES (@report_date, @total_cash, @total_wallet, @total_visa, @total_internal, @shifts_count, @saved_by);
        SELECT SCOPE_IDENTITY() AS id;
      `);
    
    const newId = result.recordset[0].id;
    return res.status(201).json({ message: 'تم حفظ التقرير في الخزنة بنجاح', id: newId });
  } catch (err) {
    console.error('Error saving daily report:', err.message);
    return res.status(500).json({ message: 'حدث خطأ أثناء حفظ التقرير' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

// 2. جلب تقارير الخزنة
app.get('/api/treasury/reports', async (req, res) => {
  const { startDate, endDate } = req.query;
  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    
    let query = 'SELECT * FROM dbo.daily_reports';
    const conditions = [];
    const request = pool.request();
    
    if (startDate) {
      conditions.push('report_date >= @startDate');
      request.input('startDate', sql.Date, startDate);
    }
    
    if (endDate) {
      conditions.push('report_date <= @endDate');
      request.input('endDate', sql.Date, endDate);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ' ORDER BY report_date DESC';
    
    const result = await request.query(query);
    return res.json(result.recordset || []);
  } catch (err) {
    console.error('Error fetching treasury reports:', err.message);
    return res.status(500).json({ message: 'حدث خطأ أثناء جلب التقارير' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

// 3. إضافة عهدة جديدة
app.post('/api/custodies', async (req, res) => {
  const { person_name, amount, reason, created_by } = req.body;
  
  if (!person_name || !amount || !created_by) {
    return res.status(400).json({ message: 'الاسم والمبلغ مطلوبان' });
  }

  const parsedAmount = parseFloat(amount);
  if (parsedAmount <= 0) {
    return res.status(400).json({ message: 'المبلغ يجب أن يكون أكبر من صفر' });
  }

  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    
    const result = await pool.request()
      .input('person_name', sql.NVarChar, person_name.trim())
      .input('amount', sql.Decimal(10,2), parsedAmount)
      .input('reason', sql.NVarChar, reason || null)
      .input('created_by', sql.NVarChar, created_by)
      .query(`
        INSERT INTO dbo.custodies (person_name, amount, reason, created_by)
        VALUES (@person_name, @amount, @reason, @created_by);
        SELECT SCOPE_IDENTITY() AS id;
      `);
    
    const newId = result.recordset[0].id;
    return res.status(201).json({ message: 'تم إضافة العهدة بنجاح', id: newId });
  } catch (err) {
    console.error('Error creating custody:', err.message);
    return res.status(500).json({ message: 'حدث خطأ أثناء إضافة العهدة' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

// 4. جلب جميع العهد
app.get('/api/custodies', async (req, res) => {
  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    const result = await pool.request()
      .query('SELECT * FROM dbo.custodies ORDER BY created_at DESC');
    return res.json(result.recordset || []);
  } catch (err) {
    console.error('Error fetching custodies:', err.message);
    return res.status(500).json({ message: 'حدث خطأ أثناء جلب العهد' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

// 5. تأكيد استرداد العهدة
app.post('/api/custodies/:id/return', async (req, res) => {
  const { id } = req.params;
  const { returned_by } = req.body;
  
  if (!returned_by) {
    return res.status(400).json({ message: 'اسم من قام بالاسترداد مطلوب' });
  }

  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    
    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('returned_by', sql.NVarChar, returned_by)
      .query(`
        UPDATE dbo.custodies 
        SET status = 'returned', returned_at = GETDATE(), returned_by = @returned_by
        WHERE id = @id AND status = 'active';
        SELECT @@ROWCOUNT AS affected;
      `);
    
    if (result.recordset[0].affected === 0) {
      return res.status(404).json({ message: 'العهدة غير موجودة أو تم استردادها بالفعل' });
    }
    
    return res.json({ message: 'تم تأكيد استرداد العهدة بنجاح' });
  } catch (err) {
    console.error('Error returning custody:', err.message);
    return res.status(500).json({ message: 'حدث خطأ أثناء استرداد العهدة' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

// 6. إضافة مصروف
app.post('/api/expenses', async (req, res) => {
  const { amount, reason, taken_by, created_by } = req.body;
  
  if (!amount || !reason || !created_by) {
    return res.status(400).json({ message: 'المبلغ والسبب مطلوبان' });
  }

  const parsedAmount = parseFloat(amount);
  if (parsedAmount <= 0) {
    return res.status(400).json({ message: 'المبلغ يجب أن يكون أكبر من صفر' });
  }

  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    
    const result = await pool.request()
      .input('amount', sql.Decimal(10,2), parsedAmount)
      .input('reason', sql.NVarChar, reason.trim())
      .input('taken_by', sql.NVarChar, taken_by || null)
      .input('created_by', sql.NVarChar, created_by)
      .query(`
        INSERT INTO dbo.expenses (amount, reason, taken_by, created_by)
        VALUES (@amount, @reason, @taken_by, @created_by);
        SELECT SCOPE_IDENTITY() AS id;
      `);
    
    const newId = result.recordset[0].id;
    return res.status(201).json({ message: 'تم إضافة المصروف بنجاح', id: newId });
  } catch (err) {
    console.error('Error creating expense:', err.message);
    return res.status(500).json({ message: 'حدث خطأ أثناء إضافة المصروف' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

// 7. جلب جميع المصروفات
app.get('/api/expenses', async (req, res) => {
  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    const result = await pool.request()
      .query('SELECT * FROM dbo.expenses ORDER BY created_at DESC');
    return res.json(result.recordset || []);
  } catch (err) {
    console.error('Error fetching expenses:', err.message);
    return res.status(500).json({ message: 'حدث خطأ أثناء جلب المصروفات' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

// 8. حساب إجمالي الخزنة
app.get('/api/treasury/balance', async (req, res) => {
  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    
    // إجمالي التقارير المحفوظة
    const reportsRes = await pool.request().query(`
      SELECT 
        ISNULL(SUM(total_cash), 0) AS total_cash,
        ISNULL(SUM(total_wallet), 0) AS total_wallet,
        ISNULL(SUM(total_visa), 0) AS total_visa
      FROM dbo.daily_reports
    `);
    
    // إجمالي العهد النشطة (غير المستردة)
    const custodiesRes = await pool.request().query(`
      SELECT ISNULL(SUM(amount), 0) AS active_custodies
      FROM dbo.custodies
      WHERE status = 'active'
    `);
    
    // إجمالي المصروفات
    const expensesRes = await pool.request().query(`
      SELECT ISNULL(SUM(amount), 0) AS total_expenses
      FROM dbo.expenses
    `);
    
    const reports = reportsRes.recordset[0];
    const activeCustodies = custodiesRes.recordset[0].active_custodies;
    const totalExpenses = expensesRes.recordset[0].total_expenses;
    
    const totalIncome = parseFloat(reports.total_cash) + 
                       parseFloat(reports.total_wallet) + 
                       parseFloat(reports.total_visa);
    
    const availableBalance = totalIncome - parseFloat(activeCustodies) - parseFloat(totalExpenses);
    
    return res.json({
      total_cash: parseFloat(reports.total_cash),
      total_wallet: parseFloat(reports.total_wallet),
      total_visa: parseFloat(reports.total_visa),
      total_income: totalIncome,
      active_custodies: parseFloat(activeCustodies),
      total_expenses: parseFloat(totalExpenses),
      available_balance: availableBalance
    });
  } catch (err) {
    console.error('Error calculating treasury balance:', err.message);
    return res.status(500).json({ message: 'حدث خطأ أثناء حساب رصيد الخزنة' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});


// دالة إنشاء جداول المحاسب
async function ensureTreasuryTablesExist() {
  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);

    // جدول التقارير اليومية
    await pool.request().query(`
      IF NOT EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_NAME = 'daily_reports' AND TABLE_SCHEMA = 'dbo'
      )
      BEGIN
        CREATE TABLE dbo.daily_reports (
          id INT IDENTITY(1,1) PRIMARY KEY,
          report_date DATE NOT NULL UNIQUE,
          total_cash DECIMAL(10,2) DEFAULT 0,
          total_wallet DECIMAL(10,2) DEFAULT 0,
          total_visa DECIMAL(10,2) DEFAULT 0,
          total_internal DECIMAL(10,2) DEFAULT 0,
          shifts_count INT DEFAULT 0,
          saved_by NVARCHAR(100) NOT NULL,
          created_at DATETIME DEFAULT (GETUTCDATE() AT TIME ZONE 'UTC' AT TIME ZONE 'Egypt Standard Time')
        );
      END
    `);

    // جدول العهد
    await pool.request().query(`
      IF NOT EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_NAME = 'custodies' AND TABLE_SCHEMA = 'dbo'
      )
      BEGIN
        CREATE TABLE dbo.custodies (
          id INT IDENTITY(1,1) PRIMARY KEY,
          person_name NVARCHAR(100) NOT NULL,
          amount DECIMAL(10,2) NOT NULL,
          reason NVARCHAR(500),
          status NVARCHAR(20) NOT NULL DEFAULT 'active',
          created_by NVARCHAR(100) NOT NULL,
          returned_by NVARCHAR(100),
          created_at DATETIME DEFAULT GETDATE(),
          returned_at DATETIME
        );
      END
    `);

    // جدول المصروفات
    await pool.request().query(`
      IF NOT EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_NAME = 'expenses' AND TABLE_SCHEMA = 'dbo'
      )
      BEGIN
        CREATE TABLE dbo.expenses (
          id INT IDENTITY(1,1) PRIMARY KEY,
          amount DECIMAL(10,2) NOT NULL,
          reason NVARCHAR(500) NOT NULL,
          taken_by NVARCHAR(100),
          created_by NVARCHAR(100) NOT NULL,
          created_at DATETIME DEFAULT (GETUTCDATE() AT TIME ZONE 'UTC' AT TIME ZONE 'Egypt Standard Time')
        );
      END
    `);

    console.log('Treasury tables are ready.');
  } catch (err) {
    console.error('Error ensuring treasury tables:', err.message);
    throw err;
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
}

// 6. جلب الحجوزات الملغاة لدكتور معين (مع فلتر التاريخ)
app.get('/api/bookings/doctor/:doctorId/cancelled', async (req, res) => {
  const { doctorId } = req.params;
  const { startDate, endDate } = req.query;
  
  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    
    let query = `
      SELECT 
        b.*,
        c.name AS client_name,
        c.phone AS client_phone,
        a.name AS doctor_name,
        FORMAT(CAST(b.start_time AS DATETIME), 'HH:mm') AS start_time_formatted,
        FORMAT(CAST(b.end_time AS DATETIME), 'HH:mm') AS end_time_formatted
      FROM dbo.bookings b
      INNER JOIN dbo.clients c ON b.client_id = c.id
      INNER JOIN dbo.accounts a ON b.doctor_id = a.id
      WHERE b.doctor_id = @doctor_id AND b.status = N'ملغي'
    `;
    
    const request = pool.request().input('doctor_id', sql.Int, doctorId);
    
    if (startDate) {
      query += ' AND b.cancellation_date >= @start_date';
      request.input('start_date', sql.DateTime, startDate);
    }
    
    if (endDate) {
      query += ' AND b.cancellation_date <= @end_date';
      request.input('end_date', sql.DateTime, endDate + ' 23:59:59');
    }
    
    query += ' ORDER BY b.cancellation_date DESC, b.booking_date DESC';
    
    const result = await request.query(query);
    const bookings = result.recordset || [];
    
    // تعديل صيغة الوقت
    bookings.forEach(booking => {
      booking.start_time = booking.start_time_formatted;
      booking.end_time = booking.end_time_formatted;
      delete booking.start_time_formatted;
      delete booking.end_time_formatted;
    });
    
    // جلب الخدمات
    for (let booking of bookings) {
      const servicesRes = await pool.request()
        .input('booking_id', sql.Int, booking.id)
        .query('SELECT * FROM dbo.booking_services WHERE booking_id = @booking_id ORDER BY id');
      booking.services = servicesRes.recordset || [];
    }
    
    return res.json(bookings);
  } catch (err) {
    console.error('Error fetching cancelled bookings:', err.message);
    return res.status(500).json({ message: 'حدث خطأ' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

// 7. إعادة جدولة حجز ملغي
app.put('/api/bookings/:id/reschedule', async (req, res) => {
  const { id } = req.params;
  const { booking_date, start_time, end_time, status, doctor_id } = req.body; // ⭐ إضافة doctor_id

  if (!booking_date || !start_time || !end_time) {
    return res.status(400).json({ message: 'جميع الحقول مطلوبة' });
  }

  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // جلب بيانات الحجز
      const bookingRes = await transaction.request()
        .input('id', sql.Int, id)
        .query('SELECT * FROM dbo.bookings WHERE id = @id');
      
      if (!bookingRes.recordset || bookingRes.recordset.length === 0) {
        await transaction.rollback();
        return res.status(404).json({ message: 'الحجز غير موجود' });
      }
      
      const booking = bookingRes.recordset[0];
      
      // التحقق من أن الحجز ملغي
      if (booking.status !== 'ملغي') {
        await transaction.rollback();
        return res.status(400).json({ message: 'هذا الحجز ليس ملغياً' });
      }

      // ⭐ التحقق من أن الوقت لم يمضي بالفعل
      const now = new Date();
      const selectedDate = new Date(booking_date);
      selectedDate.setHours(parseInt(start_time.split(':')[0]), parseInt(start_time.split(':')[1]), 0, 0);

      // إذا كان التاريخ المختار هو اليوم
      if (selectedDate.toDateString() === now.toDateString()) {
        if (selectedDate <= now) {
          await transaction.rollback();
          return res.status(400).json({ 
            message: '⚠️ لا يمكن الحجز في وقت مضى بالفعل!\n\nالوقت الحالي: ' + 
                     now.toLocaleTimeString('ar-EG', {hour: '2-digit', minute: '2-digit'}) 
          });
        }
      }

      // تحويل الوقت إلى format صحيح
      const formatTime = (timeStr) => {
        if (!timeStr) return null;
        if (timeStr.length === 5) return `${timeStr}:00`;
        return timeStr;
      };
      
      const formattedStartTime = formatTime(start_time);
      const formattedEndTime = formatTime(end_time);

      // ⭐ إذا تم تغيير الدكتور - نتحقق من الجدول الجديد
const targetDoctorId = doctor_id ? parseInt(doctor_id) : booking.doctor_id;

if (targetDoctorId !== booking.doctor_id) {
  console.log(`🔄 تغيير الدكتور من ${booking.doctor_id} إلى ${targetDoctorId}`);
}

// التحقق من عدم وجود تعارض في جدول الدكتور المختار
const conflictCheckRes = await transaction.request()
  .input('doctor_id', sql.Int, targetDoctorId)
  .input('booking_date', sql.Date, booking_date)
  .input('start_time', sql.VarChar, formattedStartTime)
  .input('end_time', sql.VarChar, formattedEndTime)
  .input('current_booking_id', sql.Int, id)
  .query(`
    SELECT id, client_name, start_time, end_time 
    FROM dbo.bookings 
    WHERE doctor_id = @doctor_id 
      AND booking_date = @booking_date 
      AND id != @current_booking_id
      AND status NOT IN ('ملغي', 'انتهت')
      AND (@start_time < end_time AND @end_time > start_time)
  `);

if (conflictCheckRes.recordset && conflictCheckRes.recordset.length > 0) {
  const conflict = conflictCheckRes.recordset[0];
  await transaction.rollback();
  return res.status(400).json({ 
    message: `⚠️ يوجد تعارض في جدول الدكتور!\n\nموعد موجود: ${formatTimeForConflict(conflict.start_time)} - ${formatTimeForConflict(conflict.end_time)}\nالعميل: ${conflict.client_name}` 
  });
}
      // حساب المدة
      const calculateDuration = (start, end) => {
        const startParts = start.split(':');
        const endParts = end.split(':');
        const startMinutes = parseInt(startParts[0]) * 60 + parseInt(startParts[1]);
        const endMinutes = parseInt(endParts[0]) * 60 + parseInt(endParts[1]);
        return endMinutes - startMinutes;
      };

      const duration = calculateDuration(start_time, end_time);

// تحديث الحجز (مع إمكانية تغيير الدكتور)
const result = await transaction.request()
  .input('id', sql.Int, id)
  .input('booking_date', sql.Date, booking_date)
  .input('start_time', sql.VarChar, formattedStartTime)
  .input('end_time', sql.VarChar, formattedEndTime)
  .input('duration', sql.Int, duration)
  .input('status', sql.NVarChar, status || 'جاري')
  .input('doctor_id', sql.Int, targetDoctorId) // ⭐ الدكتور الجديد
  .query(`
    UPDATE dbo.bookings 
    SET booking_date = @booking_date,
        start_time = @start_time,
        end_time = @end_time,
        duration = @duration,
        status = @status,
        doctor_id = @doctor_id
    WHERE id = @id
  `);

      if (result.rowsAffected[0] === 0) {
        await transaction.rollback();
        return res.status(404).json({ message: 'الحجز غير موجود' });
      }

      await transaction.commit();
      return res.json({ message: 'تم إعادة جدولة الحجز بنجاح ✨' });
      
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) {
    console.error('Error rescheduling booking:', err.message);
    return res.status(500).json({ message: 'حدث خطأ أثناء إعادة الجدولة' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

async function ensureSuppliersTablesExist() {
  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);

    // جدول الموردين
    await pool.request().query(`
      IF NOT EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_NAME = 'suppliers' AND TABLE_SCHEMA = 'dbo'
      )
      BEGIN
        CREATE TABLE dbo.suppliers (
          id INT IDENTITY(1,1) PRIMARY KEY,
          name NVARCHAR(100) NOT NULL,
          phone NVARCHAR(20),
          email NVARCHAR(100),
          company NVARCHAR(100),
          address NVARCHAR(500),
          balance DECIMAL(10,2) DEFAULT 0,
          credit_limit DECIMAL(10,2) DEFAULT 0,
          status NVARCHAR(20) DEFAULT 'active',
          notes NVARCHAR(MAX),
          created_at DATETIME DEFAULT GETDATE(),
          last_transaction DATETIME DEFAULT GETDATE()
        );
      END
    `);

    // جدول فواتير الموردين
    await pool.request().query(`
      IF NOT EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_NAME = 'supplier_invoices' AND TABLE_SCHEMA = 'dbo'
      )
      BEGIN
        CREATE TABLE dbo.supplier_invoices (
          id INT IDENTITY(1,1) PRIMARY KEY,
          invoice_number NVARCHAR(50) NOT NULL UNIQUE,
          supplier_id INT NOT NULL,
          invoice_date DATE NOT NULL,
          due_date DATE,
          total_amount DECIMAL(10,2) NOT NULL,
          paid_amount DECIMAL(10,2) DEFAULT 0,
          remaining_amount DECIMAL(10,2),
          status NVARCHAR(20) DEFAULT 'pending',
          description NVARCHAR(MAX),
          created_at DATETIME DEFAULT GETDATE(),
          CONSTRAINT FK_supplier_invoices_supplier FOREIGN KEY (supplier_id) 
            REFERENCES dbo.suppliers(id) ON DELETE CASCADE
        );
      END
    `);

    // جدول مدفوعات الموردين
    await pool.request().query(`
      IF NOT EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_NAME = 'supplier_payments' AND TABLE_SCHEMA = 'dbo'
      )
      BEGIN
        CREATE TABLE dbo.supplier_payments (
          id INT IDENTITY(1,1) PRIMARY KEY,
          invoice_id INT NOT NULL,
          supplier_id INT NOT NULL,
          amount DECIMAL(10,2) NOT NULL,
          payment_method NVARCHAR(50) NOT NULL,
          payment_date DATE NOT NULL,
          reference_number NVARCHAR(100),
          notes NVARCHAR(500),
          created_by NVARCHAR(100) NOT NULL,
          created_at DATETIME DEFAULT GETDATE(),
          CONSTRAINT FK_supplier_payments_invoice FOREIGN KEY (invoice_id) 
            REFERENCES dbo.supplier_invoices(id),
          CONSTRAINT FK_supplier_payments_supplier FOREIGN KEY (supplier_id) 
            REFERENCES dbo.suppliers(id)
        );
      END
    `);

    console.log('Suppliers tables are ready.');
  } catch (err) {
    console.error('Error ensuring suppliers tables:', err.message);
    throw err;
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
}


async function ensureAccountsTableExists() {
  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);

    await pool.request().query(`
      IF NOT EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_NAME = 'accounts' AND TABLE_SCHEMA = 'dbo'
      )
      BEGIN
        CREATE TABLE dbo.accounts (
          id INT IDENTITY(1,1) PRIMARY KEY,
          name NVARCHAR(100) NOT NULL,
          phone NVARCHAR(20) NOT NULL UNIQUE,
          password NVARCHAR(255) NOT NULL,
          role NVARCHAR(50) NOT NULL,
          fixed_salary DECIMAL(10,2) DEFAULT 0

        );
      END
    `);
    // إضافة حقل fixed_salary إذا لم يكن موجوداً
await pool.request().query(`
  IF NOT EXISTS (
    SELECT * FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'accounts' AND COLUMN_NAME = 'fixed_salary'
  )
  BEGIN
    ALTER TABLE dbo.accounts ADD fixed_salary DECIMAL(10,2) DEFAULT 0;
  END
`);
console.log('✅ Fixed salary column checked/added.');

    const countRes = await pool.request().query('SELECT COUNT(*) AS cnt FROM dbo.accounts');
    const cnt = countRes.recordset && countRes.recordset[0] ? countRes.recordset[0].cnt : 0;

    if (cnt === 0) {
      await pool.request().query(`
        INSERT INTO dbo.accounts (name, phone, password, role)
        VALUES (N'عبدالله طاهر', N'01028725687', N'zeronet11', N'ادمن');
      `);
      console.log('Default admin account inserted.');
    }

  } catch (err) {
    console.error('Error ensuring accounts table:', err.message);
    throw err;
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
}

async function ensureServicesTablesExist() {
  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);

    await pool.request().query(`
      IF NOT EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_NAME = 'service_categories' AND TABLE_SCHEMA = 'dbo'
      )
      BEGIN
        CREATE TABLE dbo.service_categories (
          id INT IDENTITY(1,1) PRIMARY KEY,
          name NVARCHAR(100) NOT NULL UNIQUE,
          created_at DATETIME DEFAULT (GETUTCDATE() AT TIME ZONE 'UTC' AT TIME ZONE 'Egypt Standard Time')
        );
      END
    `);

    await pool.request().query(`
      IF NOT EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_NAME = 'services' AND TABLE_SCHEMA = 'dbo'
      )
      BEGIN
        CREATE TABLE dbo.services (
          id INT IDENTITY(1,1) PRIMARY KEY,
          category_id INT NOT NULL,
          name NVARCHAR(200) NOT NULL,
          duration INT NOT NULL,
          price DECIMAL(10,2) NOT NULL,
          created_at DATETIME DEFAULT GETDATE(),
          CONSTRAINT FK_services_category FOREIGN KEY (category_id) 
            REFERENCES dbo.service_categories(id) ON DELETE CASCADE
        );
      END
    `);

    const catCount = await pool.request().query('SELECT COUNT(*) AS cnt FROM dbo.service_categories');
    if (catCount.recordset[0].cnt === 0) {
      await pool.request().query(`
        INSERT INTO dbo.service_categories (name) VALUES 
        (N'العناية بالبشرة'),
        (N'الليزر'),
        (N'المكياج'),
        (N'العناية بالشعر');
      `);
      
      await pool.request().query(`
        INSERT INTO dbo.services (category_id, name, duration, price) VALUES 
        (1, N'تنظيف بشرة عميق', 60, 300.00),
        (1, N'ماسك مغذي للبشرة', 45, 200.00),
        (2, N'إزالة شعر بالليزر - وجه', 30, 400.00),
        (2, N'إزالة شعر بالليزر - جسم كامل', 120, 1500.00),
        (3, N'مكياج سهرة', 90, 500.00),
        (4, N'صبغة شعر', 120, 350.00);
      `);
    }

  } catch (err) {
    console.error('Error ensuring service tables:', err.message);
    throw err;
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
}

  async function ensureBookingsTablesExist() {
  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);

    // جدول الحجوزات
    await pool.request().query(`
      IF NOT EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_NAME = 'bookings' AND TABLE_SCHEMA = 'dbo'
      )
      BEGIN
        CREATE TABLE dbo.bookings (
          id INT IDENTITY(1,1) PRIMARY KEY,
          client_id INT NOT NULL,
          client_name NVARCHAR(100),
          doctor_id INT NOT NULL,
          booking_date DATE NOT NULL,
          start_time TIME NOT NULL,
          end_time TIME NOT NULL,
          total_price DECIMAL(10,2) NOT NULL,
          duration INT,
          balance_type NVARCHAR(50),
          status NVARCHAR(20) NOT NULL DEFAULT N'جاري',
          notes NVARCHAR(500),
          shift_id INT,
          created_by NVARCHAR(100) NOT NULL,
          created_at DATETIME DEFAULT GETDATE(),
          cancellation_reason NVARCHAR(200),
          cancellation_date DATETIME,
          CONSTRAINT FK_bookings_client FOREIGN KEY (client_id) 
            REFERENCES dbo.clients(id),
          CONSTRAINT FK_bookings_doctor FOREIGN KEY (doctor_id) 
            REFERENCES dbo.accounts(id)
        );
      END
    `);

    // جدول خدمات الحجز
    await pool.request().query(`
      IF NOT EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_NAME = 'booking_services' AND TABLE_SCHEMA = 'dbo'
      )
      BEGIN
        CREATE TABLE dbo.booking_services (
          id INT IDENTITY(1,1) PRIMARY KEY,
          booking_id INT NOT NULL,
          service_id INT NOT NULL,
          service_name NVARCHAR(200) NOT NULL,
          category_name NVARCHAR(100) NOT NULL,
          duration INT NOT NULL,
          price DECIMAL(10,2) NOT NULL,
          CONSTRAINT FK_booking_services_booking FOREIGN KEY (booking_id) 
            REFERENCES dbo.bookings(id) ON DELETE CASCADE,
          CONSTRAINT FK_booking_services_service FOREIGN KEY (service_id) 
            REFERENCES dbo.services(id)
        );
      END
    `);
    // ⭐ جدول تفاصيل الجلسات
    await pool.request().query(`
      IF NOT EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_NAME = 'session_details' AND TABLE_SCHEMA = 'dbo'
      )
      BEGIN
        CREATE TABLE dbo.session_details (
          id INT IDENTITY(1,1) PRIMARY KEY,
          booking_id INT NOT NULL,
          service_id INT NOT NULL,
          service_index INT NOT NULL DEFAULT 0,
          service_name NVARCHAR(200) NOT NULL,
          detail_type NVARCHAR(20) NOT NULL,
          
          -- تفاصيل الليزر
          session_number INT NULL,
          session_type NVARCHAR(100) NULL,
          pulses INT NULL,
          power DECIMAL(10,2) NULL,
          puls_duration DECIMAL(10,2) NULL,
          spot_size DECIMAL(10,2) NULL,
          skin_type NVARCHAR(50) NULL,
          
          -- تفاصيل البشرة
          product_used NVARCHAR(200) NULL,
          quantity DECIMAL(10,2) NULL,
          
          -- حقول مشتركة
          notes NVARCHAR(MAX) NULL,
          doctor_name NVARCHAR(100) NOT NULL,
          doctor_role NVARCHAR(50) NOT NULL,
          created_at DATETIME DEFAULT GETDATE(),
          
          CONSTRAINT FK_session_details_booking FOREIGN KEY (booking_id) 
            REFERENCES dbo.bookings(id) ON DELETE CASCADE
        );
      END
      ELSE
      BEGIN
        -- إذا كان الجدول موجود، تحقق من وجود service_index
        IF NOT EXISTS (
          SELECT * FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_NAME = 'session_details' AND COLUMN_NAME = 'service_index'
        )
        BEGIN
          ALTER TABLE dbo.session_details ADD service_index INT NOT NULL DEFAULT 0;
        END
      END
    `);

    console.log('✅ Bookings tables are ready.');
  } catch (err) {
    console.error('❌ Error ensuring bookings tables:', err.message);
    throw err;
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
}

// إضافة أعمدة سبب الإلغاء
app.post('/api/database/add-cancellation-fields', async (req, res) => {
  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    
    // إضافة سبب الإلغاء
    await pool.request().query(`
      IF NOT EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'bookings' AND COLUMN_NAME = 'cancellation_reason'
      )
      BEGIN
        ALTER TABLE dbo.bookings ADD cancellation_reason NVARCHAR(200) NULL;
      END
    `);
    
    // إضافة تاريخ الإلغاء
    await pool.request().query(`
      IF NOT EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'bookings' AND COLUMN_NAME = 'cancellation_date'
      )
      BEGIN
        ALTER TABLE dbo.bookings ADD cancellation_date DATETIME NULL;
      END
    `);
    
    return res.json({ message: 'تم إضافة حقول الإلغاء بنجاح' });
  } catch (err) {
    console.error('Error adding cancellation fields:', err.message);
    return res.status(500).json({ message: 'حدث خطأ' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

// إلغاء حجز مع سبب الإلغاء
app.put('/api/bookings/:id/cancel', async (req, res) => {
  const { id } = req.params;
  const { status, cancellation_reason } = req.body;

  if (!status || !cancellation_reason) {
    return res.status(400).json({ message: 'الحالة وسبب الإلغاء مطلوبان' });
  }

  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // جلب بيانات الحجز
      const bookingRes = await transaction.request()
        .input('id', sql.Int, id)
        .query('SELECT * FROM dbo.bookings WHERE id = @id');
      
      if (!bookingRes.recordset || bookingRes.recordset.length === 0) {
        await transaction.rollback();
        return res.status(404).json({ message: 'الحجز غير موجود' });
      }
      
      const booking = bookingRes.recordset[0];


      // تحديث حالة الحجز
      const result = await transaction.request()
        .input('id', sql.Int, id)
        .input('status', sql.NVarChar, status)
        .input('cancellation_reason', sql.NVarChar, cancellation_reason)
        .input('cancellation_date', sql.DateTime, new Date())
        .query(`
          UPDATE dbo.bookings 
          SET status = @status,
              cancellation_reason = @cancellation_reason,
              cancellation_date = @cancellation_date
          WHERE id = @id
        `);

      if (result.rowsAffected[0] === 0) {
        await transaction.rollback();
        return res.status(404).json({ message: 'الحجز غير موجود' });
      }

      await transaction.commit();
      return res.json({ message: 'تم إلغاء الحجز بنجاح' });
      
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) {
    console.error('Error cancelling booking:', err.message);
    return res.status(500).json({ message: 'حدث خطأ أثناء إلغاء الحجز' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

async function ensureOffersTableExists() {
  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);

    await pool.request().query(`
      IF NOT EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_NAME = 'offers' AND TABLE_SCHEMA = 'dbo'
      )
      BEGIN
        CREATE TABLE dbo.offers (
          id INT IDENTITY(1,1) PRIMARY KEY,
          name NVARCHAR(200) NOT NULL,
          type NVARCHAR(20) NOT NULL,
          services NVARCHAR(MAX) NOT NULL,
          sessions_count INT NULL,
          offer_price DECIMAL(10,2) NOT NULL,
          original_price DECIMAL(10,2) NULL,
          start_date DATE NOT NULL,
          end_date DATE NOT NULL,
          status NVARCHAR(20) NOT NULL DEFAULT 'active',
          description NVARCHAR(500),
          created_by NVARCHAR(100) NOT NULL,
          created_at DATETIME DEFAULT (GETUTCDATE() AT TIME ZONE 'UTC' AT TIME ZONE 'Egypt Standard Time')
        );
      END
    `);

  } catch (err) {
    console.error('Error ensuring offers table:', err.message);
    throw err;
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
}
// === APIs العروض المشتراة ===

// جلب عروض العميل المشتراة مع جلسات الخدمات - معدل
app.get('/api/clients/:id/purchased-offers', async (req, res) => {
  const { id } = req.params;
  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    const result = await pool.request()
      .input('client_id', sql.Int, id)
      .query(`
        SELECT 
          po.*, 
          o.end_date as offer_end_date,
          o.services as offer_services
        FROM dbo.client_purchased_offers po
        LEFT JOIN dbo.offers o ON po.offer_id = o.id
        WHERE po.client_id = @client_id AND po.status = 'active'
        ORDER BY po.purchase_date DESC
      `);
    
    // جلب جلسات الخدمات لكل عرض
    for (let offer of result.recordset) {
      const sessionsRes = await pool.request()
        .input('purchased_offer_id', sql.Int, offer.id)
        .query(`
          SELECT * FROM dbo.offer_service_sessions 
          WHERE purchased_offer_id = @purchased_offer_id
          ORDER BY service_index
        `);
      
      offer.service_sessions = sessionsRes.recordset || [];
      
      // معالجة الخدمات
      let services = [];
      try {
        const servicesData = offer.offer_services || offer.services;
        if (servicesData) {
          services = JSON.parse(servicesData);
        }
      } catch(e) {
        console.error('Error parsing services for offer', offer.id, e);
        services = [];
      }
      
      offer.services = services;
    }
    
    return res.json(result.recordset);
  } catch (err) {
    console.error('Error fetching purchased offers:', err.message);
    return res.status(500).json({ message: 'حدث خطأ أثناء جلب العروض' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});
// شراء عرض (بدون جلسات إجمالية)
app.post('/api/clients/:id/purchase-offer', async (req, res) => {
  const { id } = req.params;
  const { offer_id, payment_method, created_by } = req.body;
  
  if (!offer_id || !payment_method || !created_by) {
    return res.status(400).json({ message: 'جميع الحقول مطلوبة' });
  }

  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      console.log('🔍 جلب بيانات العرض...');
      // جلب بيانات العرض
      const offerRes = await transaction.request()
        .input('offer_id', sql.Int, offer_id)
        .query('SELECT * FROM dbo.offers WHERE id = @offer_id');
      
      if (!offerRes.recordset || offerRes.recordset.length === 0) {
        await transaction.rollback();
        return res.status(404).json({ message: 'العرض غير موجود' });
      }
      
      const offer = offerRes.recordset[0];
      const offerPrice = parseFloat(offer.offer_price);

      console.log('💰 التحقق من رصيد العميل...');
      // جلب بيانات العميل والتحقق من الرصيد
      const clientRes = await transaction.request()
        .input('client_id', sql.Int, id)
        .query('SELECT balance_offers, name, phone FROM dbo.clients WHERE id = @client_id');
      
      if (!clientRes.recordset || clientRes.recordset.length === 0) {
        await transaction.rollback();
        return res.status(404).json({ message: 'العميل غير موجود' });
      }
      
      const client = clientRes.recordset[0];
      const currentBalance = parseFloat(client.balance_offers || 0);
      
      if (currentBalance < offerPrice) {
        await transaction.rollback();
        return res.status(400).json({ 
          message: `رصيد العروض غير كافي. الرصيد الحالي: ${currentBalance.toFixed(2)} ج` 
        });
      }

      console.log('🔄 معالجة الخدمات...');
      // معالجة الخدمات
      let services = [];
      try {
        services = JSON.parse(offer.services);
        console.log('✅ الخدمات المحللة:', services);
      } catch(e) {
        console.error('❌ خطأ في تحليل الخدمات:', e);
        await transaction.rollback();
        return res.status(400).json({ message: 'خطأ في بيانات الخدمات' });
      }

      const sessionsCount = offer.sessions_count || 1;
      console.log(`🎯 عدد الجلسات لكل خدمة: ${sessionsCount}`);

      // التحقق من وجود نفس العرض مشترى مسبقاً
      const existingOfferRes = await transaction.request()
        .input('client_id', sql.Int, id)
        .input('offer_id', sql.Int, offer_id)
        .query(`
          SELECT * FROM dbo.client_purchased_offers 
          WHERE client_id = @client_id AND offer_id = @offer_id AND status = 'active'
        `);
      
      let purchasedOfferId;
      
      if (existingOfferRes.recordset && existingOfferRes.recordset.length > 0) {
        console.log('🔄 العرض موجود مسبقاً - تجديد الجلسات');
        // العرض موجود مسبقاً - نضيف جلسات جديدة للخدمات
        const existingOffer = existingOfferRes.recordset[0];
        purchasedOfferId = existingOffer.id;

        // إضافة جلسات جديدة لكل خدمة
        for (let index = 0; index < services.length; index++) {
          const service = services[index];
          const serviceIndex = index;
          const serviceName = service.name || service.service_name || 'خدمة غير معروفة';
          
          console.log(`➕ إضافة جلسات للخدمة: ${serviceName} (Index: ${serviceIndex})`);
          
          // التحقق من وجود جلسات لهذه الخدمة
          const existingSessionsRes = await transaction.request()
            .input('purchased_offer_id', sql.Int, purchasedOfferId)
            .input('service_index', sql.Int, serviceIndex)
            .query(`
              SELECT * FROM dbo.offer_service_sessions 
              WHERE purchased_offer_id = @purchased_offer_id AND service_index = @service_index
            `);
          
          if (existingSessionsRes.recordset && existingSessionsRes.recordset.length > 0) {
            // تحديث الجلسات الموجودة
            const existingSession = existingSessionsRes.recordset[0];
            await transaction.request()
              .input('id', sql.Int, existingSession.id)
              .input('additional_sessions', sql.Int, sessionsCount)
              .query(`
                UPDATE dbo.offer_service_sessions 
                SET total_sessions = total_sessions + @additional_sessions,
                    remaining_sessions = remaining_sessions + @additional_sessions
                WHERE id = @id
              `);
          } else {
            // إنشاء جلسات جديدة
            await transaction.request()
              .input('purchased_offer_id', sql.Int, purchasedOfferId)
              .input('service_index', sql.Int, serviceIndex)
              .input('service_name', sql.NVarChar, serviceName)
              .input('total_sessions', sql.Int, sessionsCount)
              .input('remaining_sessions', sql.Int, sessionsCount)
              .query(`
                INSERT INTO dbo.offer_service_sessions 
                (purchased_offer_id, service_index, service_name, total_sessions, remaining_sessions)
                VALUES 
                (@purchased_offer_id, @service_index, @service_name, @total_sessions, @remaining_sessions);
              `);
          }
        }
      } else {
        console.log('🆕 عرض جديد - إنشاء عرض وجلسات');
        // عرض جديد - نضيفه مع جلسات الخدمات
        const offerResult = await transaction.request()
          .input('client_id', sql.Int, id)
          .input('offer_id', sql.Int, offer_id)
          .input('offer_name', sql.NVarChar, offer.name)
          .input('offer_type', sql.NVarChar, offer.type)
          .input('services', sql.NVarChar, offer.services)
          .input('purchase_price', sql.Decimal(10,2), offerPrice)
          .input('payment_method', sql.NVarChar, payment_method)
          .input('created_by', sql.NVarChar, created_by)
          .query(`
            INSERT INTO dbo.client_purchased_offers 
            (client_id, offer_id, offer_name, offer_type, services, purchase_price, payment_method, created_by)
            VALUES 
            (@client_id, @offer_id, @offer_name, @offer_type, @services, @purchase_price, @payment_method, @created_by);
            SELECT SCOPE_IDENTITY() AS id;
          `);
        
        purchasedOfferId = offerResult.recordset[0].id;
        console.log(`✅ تم إنشاء العرض الجديد بالـ ID: ${purchasedOfferId}`);

        // إنشاء جلسات لكل خدمة
        for (let index = 0; index < services.length; index++) {
          const service = services[index];
          const serviceIndex = index;
          const serviceName = service.name || service.service_name || 'خدمة غير معروفة';
          
          console.log(`🎯 إنشاء جلسات للخدمة: ${serviceName} (Index: ${serviceIndex})`);
          
          await transaction.request()
            .input('purchased_offer_id', sql.Int, purchasedOfferId)
            .input('service_index', sql.Int, serviceIndex)
            .input('service_name', sql.NVarChar, serviceName)
            .input('total_sessions', sql.Int, sessionsCount)
            .input('remaining_sessions', sql.Int, sessionsCount)
            .query(`
              INSERT INTO dbo.offer_service_sessions 
              (purchased_offer_id, service_index, service_name, total_sessions, remaining_sessions)
              VALUES 
              (@purchased_offer_id, @service_index, @service_name, @total_sessions, @remaining_sessions);
            `);
        }
      }

      console.log('💳 خصم المبلغ من رصيد العميل...');
      // باقي الكود (الخصم من الرصيد وتسجيل المعاملة)
      const newBalance = currentBalance - offerPrice;
      await transaction.request()
        .input('client_id', sql.Int, id)
        .input('new_balance', sql.Decimal(10,2), newBalance)
        .query('UPDATE dbo.clients SET balance_offers = @new_balance WHERE id = @client_id');
      
      await transaction.request()
        .input('client_id', sql.Int, id)
        .input('amount', sql.Decimal(10,2), -offerPrice)
        .input('created_by', sql.NVarChar, created_by)
        .input('offer_name', sql.NVarChar, offer.name)
        .query(`
          INSERT INTO dbo.transactions 
          (client_id, transaction_type, amount, balance_type, created_by, notes)
          VALUES 
          (@client_id, 'شراء عرض', @amount, 'رصيد عروض', @created_by, 
           'شراء عرض: ' + @offer_name);
        `);

      await transaction.commit();
      console.log('✅ تم شراء العرض بنجاح!');
      return res.json({ message: 'تم شراء العرض بنجاح ✨' });
      
    } catch (err) {
      await transaction.rollback();
      console.error('❌ خطأ في Transaction:', err);
      throw err;
    }
  } catch (err) {
    console.error('❌ Error purchasing offer:', err.message);
    return res.status(500).json({ 
      message: 'حدث خطأ أثناء شراء العرض',
      error: err.message 
    });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});
// إصلاح الجداول المفقودة
app.post('/api/debug/fix-tables', async (req, res) => {
  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);

    // إضافة service_id إذا كان مفقوداً من جدول offers
    await pool.request().query(`
      IF NOT EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'offers' AND COLUMN_NAME = 'services'
      )
      BEGIN
        ALTER TABLE dbo.offers ADD services NVARCHAR(MAX) NULL;
      END
    `);

    // إضافة service_id إذا كان مفقوداً من جدول client_purchased_offers
    await pool.request().query(`
      IF NOT EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'client_purchased_offers' AND COLUMN_NAME = 'services'
      )
      BEGIN
        ALTER TABLE dbo.client_purchased_offers ADD services NVARCHAR(MAX) NULL;
      END
    `);

    return res.json({ message: 'تم إصلاح الجداول بنجاح' });
  } catch (err) {
    console.error('Error fixing tables:', err.message);
    return res.status(500).json({ message: 'خطأ في إصلاح الجداول', error: err.message });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});
// إصلاح جدول offer_service_sessions
app.post('/api/debug/fix-service-sessions-table', async (req, res) => {
  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);

    // إضافة service_id إذا كان مفقوداً
    await pool.request().query(`
      IF NOT EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'offer_service_sessions' AND COLUMN_NAME = 'service_id'
      )
      BEGIN
        ALTER TABLE dbo.offer_service_sessions ADD service_id INT NULL;
      END
    `);

    return res.json({ message: 'تم إصلاح جدول جلسات الخدمات بنجاح' });
  } catch (err) {
    console.error('Error fixing service sessions table:', err.message);
    return res.status(500).json({ message: 'خطأ في إصلاح الجدول', error: err.message });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});
// استخدام العرض كله (يخصم من كل الخدمات)
app.post('/api/purchased-offers/:id/use-session', async (req, res) => {
  const { id } = req.params;
  const { used_by } = req.body;
  
  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // جلب بيانات الجلسات الخاصة بالخدمات
      const sessionsRes = await transaction.request()
        .input('purchased_offer_id', sql.Int, id)
        .query(`
          SELECT * FROM dbo.offer_service_sessions 
          WHERE purchased_offer_id = @purchased_offer_id AND remaining_sessions > 0
        `);
      
      if (!sessionsRes.recordset || sessionsRes.recordset.length === 0) {
        await transaction.rollback();
        return res.status(400).json({ message: 'لا توجد جلسات متبقية في هذا العرض' });
      }

      let usedCount = 0;
      let servicesUsed = [];

      // خصم جلسة واحدة من كل خدمة
      for (const session of sessionsRes.recordset) {
        if (session.remaining_sessions > 0) {
          await transaction.request()
            .input('id', sql.Int, session.id)
            .query(`
              UPDATE dbo.offer_service_sessions 
              SET remaining_sessions = remaining_sessions - 1
              WHERE id = @id AND remaining_sessions > 0
            `);
          
          usedCount++;
          servicesUsed.push(session.service_name);
        }
      }

      await transaction.commit();
      
      return res.json({ 
        message: `تم استخدام العرض كله بنجاح - تم خصم جلسة من ${usedCount} خدمة`,
        services_used: servicesUsed
      });
      
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) {
    console.error('Error using session:', err.message);
    return res.status(500).json({ message: 'حدث خطأ' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});
// إزالة الحقول غير الضرورية من الجداول
app.post('/api/debug/remove-session-fields', async (req, res) => {
  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);

    // إزالة الحقول من client_purchased_offers إذا كانت موجودة
    await pool.request().query(`
      IF EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'client_purchased_offers' AND COLUMN_NAME = 'total_sessions'
      )
      BEGIN
        ALTER TABLE dbo.client_purchased_offers DROP COLUMN total_sessions;
      END
    `);

    await pool.request().query(`
      IF EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'client_purchased_offers' AND COLUMN_NAME = 'remaining_sessions'
      )
      BEGIN
        ALTER TABLE dbo.client_purchased_offers DROP COLUMN remaining_sessions;
      END
    `);

    return res.json({ message: 'تم إزالة الحقول غير الضرورية بنجاح' });
  } catch (err) {
    console.error('Error removing session fields:', err.message);
    return res.status(500).json({ message: 'خطأ في إزالة الحقول', error: err.message });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});
// === API لتعديل ID العميل - الحل النهائي ===
app.put('/api/clients/:oldId/change-id', async (req, res) => {
  const { oldId } = req.params;
  const { newId } = req.body;
  
  if (!newId) {
    return res.status(400).json({ message: 'ID الجديد مطلوب' });
  }

  if (parseInt(oldId) === parseInt(newId)) {
    return res.status(400).json({ message: 'ID الجديد يجب أن يكون مختلفاً عن القديم' });
  }

  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      console.log(`🔄 محاولة تغيير ID العميل من ${oldId} إلى ${newId}`);

      // 1. التحقق من أن ID الجديد غير مستخدم
      const checkNewIdRes = await transaction.request()
        .input('newId', sql.Int, newId)
        .query('SELECT id, name, phone FROM dbo.clients WHERE id = @newId');
      
      if (checkNewIdRes.recordset && checkNewIdRes.recordset.length > 0) {
        await transaction.rollback();
        const existingClient = checkNewIdRes.recordset[0];
        return res.status(400).json({ 
          message: `ID ${newId} مستخدم بالفعل من قبل العميل: ${existingClient.name} (${existingClient.phone})` 
        });
      }

      // 2. التحقق من وجود العميل القديم
      const oldClientRes = await transaction.request()
        .input('oldId', sql.Int, oldId)
        .query('SELECT * FROM dbo.clients WHERE id = @oldId');
      
      if (!oldClientRes.recordset || oldClientRes.recordset.length === 0) {
        await transaction.rollback();
        return res.status(404).json({ message: 'العميل غير موجود' });
      }

      const oldClient = oldClientRes.recordset[0];
      console.log(`👤 العميل الموجود: ${oldClient.name} - ${oldClient.phone}`);

      // 3. التحقق من عدم وجود تعارض في رقم الهاتف
      const checkPhoneRes = await transaction.request()
        .input('phone', sql.NVarChar, oldClient.phone)
        .input('oldId', sql.Int, oldId)
        .query('SELECT id, name FROM dbo.clients WHERE phone = @phone AND id != @oldId');
      
      if (checkPhoneRes.recordset && checkPhoneRes.recordset.length > 0) {
        await transaction.rollback();
        const duplicateClient = checkPhoneRes.recordset[0];
        return res.status(400).json({ 
          message: `رقم الهاتف ${oldClient.phone} مسجل بالفعل للعميل: ${duplicateClient.name} (ID: ${duplicateClient.id})` 
        });
      }

      // 4. تفعيل IDENTITY_INSERT لإدراج ID مخصص
      console.log('🔧 تفعيل IDENTITY_INSERT...');
      await transaction.request().query('SET IDENTITY_INSERT dbo.clients ON');

      // 5. إنشاء عميل جديد بالـ ID الجديد
      console.log('📝 إنشاء العميل الجديد...');
      const newClientResult = await transaction.request()
        .input('newId', sql.Int, newId)
        .input('name', sql.NVarChar, oldClient.name)
        .input('phone', sql.NVarChar, oldClient.phone)
        .input('balance_basic', sql.Decimal(10,2), oldClient.balance_basic || 0)
        .input('balance_offers', sql.Decimal(10,2), oldClient.balance_offers || 0)
        .input('balance_laser', sql.Decimal(10,2), oldClient.balance_laser || 0)
        .input('balance_skin', sql.Decimal(10,2), oldClient.balance_skin || 0)
        .input('balance_old', sql.Decimal(10,2), oldClient.balance_old || 0)
        .query(`
          INSERT INTO dbo.clients (id, name, phone, balance_basic, balance_offers, balance_laser, balance_skin, balance_old, created_at)
          VALUES (@newId, @name, @phone, @balance_basic, @balance_offers, @balance_laser, @balance_skin, @balance_old, GETDATE());
        `);

      // 6. إلغاء تفعيل IDENTITY_INSERT
      await transaction.request().query('SET IDENTITY_INSERT dbo.clients OFF');
      console.log(`✅ تم إنشاء العميل الجديد بالـ ID: ${newId}`);

      // 7. تحديث الـ transactions بالـ ID الجديد
      console.log('🔄 تحديث المعاملات...');
      const updateTransactions = await transaction.request()
        .input('oldId', sql.Int, oldId)
        .input('newId', sql.Int, newId)
        .query('UPDATE dbo.transactions SET client_id = @newId WHERE client_id = @oldId');

      console.log(`✅ تم تحديث ${updateTransactions.rowsAffected[0]} معاملة`);

      // 8. تحديث الـ bookings بالـ ID الجديد
      console.log('🔄 تحديث الحجوزات...');
      const updateBookings = await transaction.request()
        .input('oldId', sql.Int, oldId)
        .input('newId', sql.Int, newId)
        .query('UPDATE dbo.bookings SET client_id = @newId WHERE client_id = @oldId');

      console.log(`✅ تم تحديث ${updateBookings.rowsAffected[0]} حجز`);

      // 9. حذف السجل القديم
      console.log('🗑️ حذف العميل القديم...');
      await transaction.request()
        .input('oldId', sql.Int, oldId)
        .query('DELETE FROM dbo.clients WHERE id = @oldId');

      console.log(`✅ تم حذف العميل القديم بالـ ID: ${oldId}`);

      await transaction.commit();
      console.log('✅ تم تأكيد العملية بنجاح!');
      
      return res.json({ 
        message: `تم تغيير ID العميل من ${oldId} إلى ${newId} بنجاح`,
        oldId: oldId,
        newId: newId,
        clientName: oldClient.name
      });
      
    } catch (err) {
      await transaction.rollback();
      console.error('❌ خطأ في Transaction:', err);
      
      if (err.message.includes('UNIQUE KEY constraint')) {
        return res.status(400).json({ 
          message: 'لا يمكن تغيير الـ ID بسبب وجود تعارض في البيانات. قد يكون رقم الهاتف مكرراً.' 
        });
      }
      
      throw err;
    }
  } catch (err) {
    console.error('❌ Error changing client ID:', err.message);
    
    if (err.message.includes('Violation of UNIQUE KEY constraint')) {
      return res.status(400).json({ 
        message: 'لا يمكن تغيير الـ ID بسبب وجود تعارض في البيانات. قد يكون رقم الهاتف مكرراً.' 
      });
    }
    
    return res.status(500).json({ 
      message: 'حدث خطأ أثناء تغيير ID العميل',
      error: err.message 
    });
  } finally {
    try { 
      if (pool) await pool.close(); 
    } catch(e){ 
      console.error('Error closing pool:', e);
    }
  }
});
// API للتحقق من إمكانية تغيير ID
app.get('/api/clients/:oldId/can-change-id/:newId', async (req, res) => {
  const { oldId, newId } = req.params;
  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  
  try {
    pool = await sql.connect(cfg);
    
    // التحقق من ID الجديد
    const checkNewId = await pool.request()
      .input('newId', sql.Int, newId)
      .query('SELECT id, name FROM dbo.clients WHERE id = @newId');
    
    // التحقق من العميل القديم
    const oldClient = await pool.request()
      .input('oldId', sql.Int, oldId)
      .query('SELECT * FROM dbo.clients WHERE id = @oldId');
    
    if (!oldClient.recordset || oldClient.recordset.length === 0) {
      return res.json({ canChange: false, message: 'العميل غير موجود' });
    }
    
    const client = oldClient.recordset[0];
    
    // التحقق من رقم الهاتف المكرر
    const checkPhone = await pool.request()
      .input('phone', sql.NVarChar, client.phone)
      .input('oldId', sql.Int, oldId)
      .query('SELECT id, name FROM dbo.clients WHERE phone = @phone AND id != @oldId');
    
    return res.json({
      canChange: true,
      checks: {
        newIdAvailable: checkNewId.recordset.length === 0,
        phoneUnique: checkPhone.recordset.length === 0,
        clientExists: true
      },
      clientInfo: {
        name: client.name,
        phone: client.phone,
        currentId: oldId
      }
    });
    
  } catch (err) {
    console.error('Error checking ID change:', err.message);
    return res.status(500).json({ message: 'خطأ في التحقق' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

app.post('/login', async (req, res) => {
  const { phone, password } = req.body;
  if (!phone || !password) {
    return res.status(400).json({ success: false, message: 'الرجاء إرسال الرقم وكلمة المرور.' });
  }

  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    const result = await pool.request()
      .input('phone', sql.NVarChar, phone)
      .input('password', sql.NVarChar, password)
      .query('SELECT id, name, phone, role FROM dbo.accounts WHERE phone = @phone AND password = @password');

    if (result.recordset && result.recordset.length > 0) {
      const user = result.recordset[0];
      return res.json({ success: true, user });
    } else {
      return res.json({ success: false, message: 'رقم الهاتف أو كلمة المرور غير صحيحة' });
    }
  } catch (err) {
    console.error('Login error:', err.message);
    return res.status(500).json({ success: false, message: 'حدث خطأ أثناء تسجيل الدخول' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

app.get('/api/accounts', async (req, res) => {
  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    const result = await pool.request()
      .query('SELECT id, name, phone, role FROM dbo.accounts ORDER BY id DESC');
    return res.json(result.recordset || []);
  } catch (err) {
    console.error('Error fetching accounts:', err.message);
    return res.status(500).json({ message: 'حدث خطأ أثناء جلب الحسابات' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

app.post('/api/accounts', async (req, res) => {
  const { name, phone, password, role } = req.body;
  if (!name || !phone || !password || !role) {
    return res.status(400).json({ message: 'جميع الحقول مطلوبة' });
  }

  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    
    const checkRes = await pool.request()
      .input('phone', sql.NVarChar, phone)
      .query('SELECT id FROM dbo.accounts WHERE phone = @phone');
    
    if (checkRes.recordset && checkRes.recordset.length > 0) {
      return res.status(400).json({ message: 'رقم الهاتف موجود مسبقاً' });
    }

    const result = await pool.request()
      .input('name', sql.NVarChar, name)
      .input('phone', sql.NVarChar, phone)
      .input('password', sql.NVarChar, password)
      .input('role', sql.NVarChar, role)
      .query(`
        INSERT INTO dbo.accounts (name, phone, password, role)
        VALUES (@name, @phone, @password, @role);
        SELECT SCOPE_IDENTITY() AS id;
      `);
    
    const newId = result.recordset[0].id;
    return res.status(201).json({ message: 'تم إنشاء الحساب بنجاح', id: newId });
  } catch (err) {
    console.error('Error creating account:', err.message);
    return res.status(500).json({ message: 'حدث خطأ أثناء إنشاء الحساب' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

app.put('/api/accounts/:id', async (req, res) => {
  const { id } = req.params;
  const { name, password } = req.body;

  if (!name) {
    return res.status(400).json({ message: 'الاسم مطلوب' });
  }

  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    let query = 'UPDATE dbo.accounts SET name = @name';
    const request = pool.request()
      .input('id', sql.Int, id)
      .input('name', sql.NVarChar, name);

    if (password && password.length >= 4) {
      query += ', password = @password';
      request.input('password', sql.NVarChar, password);
    }
    query += ' WHERE id = @id';
    
    const result = await request.query(query);
    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: 'الحساب غير موجود' });
    }
    return res.json({ message: 'تم تحديث الحساب بنجاح' });
  } catch (err) {
    console.error('Error updating account:', err.message);
    return res.status(500).json({ message: 'حدث خطأ أثناء تحديث الحساب' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

app.delete('/api/accounts/:id', async (req, res) => {
  const { id } = req.params;
  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM dbo.accounts WHERE id = @id');

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: 'الحساب غير موجود' });
    }
    return res.json({ message: 'تم حذف الحساب بنجاح' });
  } catch (err) {
    console.error('Error deleting account:', err.message);
    return res.status(500).json({ message: 'حدث خطأ أثناء حذف الحساب' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

app.get('/api/categories', async (req, res) => {
  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    const result = await pool.request()
      .query('SELECT id, name, created_at FROM dbo.service_categories ORDER BY id DESC');
    return res.json(result.recordset || []);
  } catch (err) {
    console.error('Error fetching categories:', err.message);
    return res.status(500).json({ message: 'حدث خطأ أثناء جلب الأقسام' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

app.post('/api/categories', async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ message: 'اسم القسم مطلوب' });
  }

  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    
    const checkRes = await pool.request()
      .input('name', sql.NVarChar, name.trim())
      .query('SELECT id FROM dbo.service_categories WHERE name = @name');
    
    if (checkRes.recordset && checkRes.recordset.length > 0) {
      return res.status(400).json({ message: 'هذا القسم موجود مسبقاً' });
    }

    const result = await pool.request()
      .input('name', sql.NVarChar, name.trim())
      .query(`
        INSERT INTO dbo.service_categories (name)
        VALUES (@name);
        SELECT SCOPE_IDENTITY() AS id;
      `);
    
    const newId = result.recordset[0].id;
    return res.status(201).json({ message: 'تم إنشاء القسم بنجاح', id: newId });
  } catch (err) {
    console.error('Error creating category:', err.message);
    return res.status(500).json({ message: 'حدث خطأ أثناء إنشاء القسم' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

app.delete('/api/categories/:id', async (req, res) => {
  const { id } = req.params;
  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM dbo.service_categories WHERE id = @id');

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: 'القسم غير موجود' });
    }
    return res.json({ message: 'تم حذف القسم وجميع الخدمات التابعة له بنجاح' });
  } catch (err) {
    console.error('Error deleting category:', err.message);
    return res.status(500).json({ message: 'حدث خطأ أثناء حذف القسم' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

app.get('/api/services', async (req, res) => {
  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    const result = await pool.request().query(`
      SELECT 
        s.id, s.name, s.duration, s.price, s.category_id, s.created_at,
        c.name AS category_name
      FROM dbo.services s
      INNER JOIN dbo.service_categories c ON s.category_id = c.id
      ORDER BY c.name, s.name
    `);
    return res.json(result.recordset || []);
  } catch (err) {
    console.error('Error fetching services:', err.message);
    return res.status(500).json({ message: 'حدث خطأ أثناء جلب الخدمات' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

app.post('/api/services', async (req, res) => {
  const { category_id, name, duration, price } = req.body;
  
  if (!category_id || !name || !duration || !price) {
    return res.status(400).json({ message: 'جميع الحقول مطلوبة' });
  }

  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    
    const result = await pool.request()
      .input('category_id', sql.Int, category_id)
      .input('name', sql.NVarChar, name.trim())
      .input('duration', sql.Int, parseInt(duration))
      .input('price', sql.Decimal(10,2), parseFloat(price))
      .query(`
        INSERT INTO dbo.services (category_id, name, duration, price)
        VALUES (@category_id, @name, @duration, @price);
        SELECT SCOPE_IDENTITY() AS id;
      `);
    
    const newId = result.recordset[0].id;
    return res.status(201).json({ message: 'تم إضافة الخدمة بنجاح', id: newId });
  } catch (err) {
    console.error('Error creating service:', err.message);
    return res.status(500).json({ message: 'حدث خطأ أثناء إضافة الخدمة' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

app.put('/api/services/:id', async (req, res) => {
  const { id } = req.params;
  const { name, duration, price } = req.body;

  if (!name || !duration || !price) {
    return res.status(400).json({ message: 'جميع الحقول مطلوبة' });
  }

  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    
    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('name', sql.NVarChar, name.trim())
      .input('duration', sql.Int, parseInt(duration))
      .input('price', sql.Decimal(10,2), parseFloat(price))
      .query(`
        UPDATE dbo.services 
        SET name = @name, duration = @duration, price = @price
        WHERE id = @id
      `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: 'الخدمة غير موجودة' });
    }
    
    return res.json({ message: 'تم تحديث الخدمة بنجاح' });
  } catch (err) {
    console.error('Error updating service:', err.message);
    return res.status(500).json({ message: 'حدث خطأ أثناء تحديث الخدمة' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

app.delete('/api/services/:id', async (req, res) => {
  const { id } = req.params;
  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM dbo.services WHERE id = @id');

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: 'الخدمة غير موجودة' });
    }
    return res.json({ message: 'تم حذف الخدمة بنجاح' });
  } catch (err) {
    console.error('Error deleting service:', err.message);
    return res.status(500).json({ message: 'حدث خطأ أثناء حذف الخدمة' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

app.get('/api/clients', async (req, res) => {
  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    const result = await pool.request()
      .query('SELECT * FROM dbo.clients ORDER BY id DESC');
    return res.json(result.recordset || []);
  } catch (err) {
    console.error('Error fetching clients:', err.message);
    return res.status(500).json({ message: 'حدث خطأ أثناء جلب العملاء' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

app.get('/api/clients/:id', async (req, res) => {
  const { id } = req.params;
  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM dbo.clients WHERE id = @id');
    
    if (result.recordset && result.recordset.length > 0) {
      return res.json(result.recordset[0]);
    } else {
      return res.status(404).json({ message: 'العميل غير موجود' });
    }
  } catch (err) {
    console.error('Error fetching client:', err.message);
    return res.status(500).json({ message: 'حدث خطأ أثناء جلب بيانات العميل' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

app.get('/api/clients/:id/transactions', async (req, res) => {
  const { id } = req.params;
  const { include_historical } = req.query;
  
  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  
  try {
    pool = await sql.connect(cfg);
    
    // استعلام واحد فقط - لا نتحقق من وجود العمود هنا
    let query = 'SELECT * FROM dbo.transactions WHERE client_id = @client_id';
    
    // تصفية العمليات التاريخية باستخدام الملاحظات (حل مؤقت)
    if (include_historical !== 'true') {
      query += ` AND (notes NOT LIKE '%[تاريخي]%' OR notes IS NULL)`;
    }
    
    query += ' ORDER BY created_at DESC';

    const result = await pool.request()
      .input('client_id', sql.Int, id)
      .query(query);
    
    const transactions = result.recordset || [];
    
    const processedTransactions = transactions.map(transaction => {
      // تحديد إذا كانت العملية تاريخية بناءً على الملاحظات
      transaction.is_historical = transaction.notes && transaction.notes.includes('[تاريخي]');
      
      if (transaction.amount) {
        transaction.amount = parseFloat(transaction.amount);
      }
      
      return transaction;
    });

    const jsonString = JSON.stringify(processedTransactions, null, 2);
    
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.send(jsonString);
    
  } catch (err) {
    console.error('Error fetching transactions:', err.message);
    return res.status(500).json({ 
      message: 'حدث خطأ أثناء جلب المعاملات',
      error: err.message 
    });
  } finally {
    // إغلاق الاتصال بشكل آمن
    try { 
      if (pool && pool.close) {
        await pool.close();
      }
    } catch(e) { 
      console.error('Error closing pool:', e);
    }
  }
});
app.post('/api/clients', async (req, res) => {
  const { name, phone, balance_basic, balance_offers, balance_laser, balance_skin, balance_old, payment_method, created_by } = req.body;
  
  if (!name || !phone) {
    return res.status(400).json({ message: 'الاسم ورقم الهاتف مطلوبان' });
  }

  if (!/^01[0-9]{9}$/.test(phone)) {
    return res.status(400).json({ message: 'رقم الهاتف يجب أن يكون 11 رقم ويبدأ بـ 01' });
  }

  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    
    const checkRes = await pool.request()
      .input('phone', sql.NVarChar, phone)
      .query('SELECT id FROM dbo.clients WHERE phone = @phone');
    
    if (checkRes.recordset && checkRes.recordset.length > 0) {
      return res.status(400).json({ message: 'رقم الهاتف مسجل مسبقاً' });
    }

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const result = await transaction.request()
        .input('name', sql.NVarChar, name.trim())
        .input('phone', sql.NVarChar, phone)
        .input('balance_basic', sql.Decimal(10,2), parseFloat(balance_basic) || 0)
        .input('balance_offers', sql.Decimal(10,2), parseFloat(balance_offers) || 0)
        .input('balance_laser', sql.Decimal(10,2), parseFloat(balance_laser) || 0)
        .input('balance_skin', sql.Decimal(10,2), parseFloat(balance_skin) || 0)
        .input('balance_old', sql.Decimal(10,2), parseFloat(balance_old) || 0)
        .query(`
          INSERT INTO dbo.clients (name, phone, balance_basic, balance_offers, balance_laser, balance_skin, balance_old)
          VALUES (@name, @phone, @balance_basic, @balance_offers, @balance_laser, @balance_skin, @balance_old);
          SELECT SCOPE_IDENTITY() AS id;
        `);
      
      const newId = result.recordset[0].id;

      const balances = [
        { type: 'رصيد أساسي', amount: parseFloat(balance_basic) || 0 },
        { type: 'رصيد عروض', amount: parseFloat(balance_offers) || 0 },
        { type: 'رصيد ليزر', amount: parseFloat(balance_laser) || 0 },
        { type: 'رصيد بشرة', amount: parseFloat(balance_skin) || 0 },
        { type: 'رصيد قديم', amount: parseFloat(balance_old) || 0 }
      ];

      for (const balance of balances) {
        if (balance.amount > 0) {
          await transaction.request()
            .input('client_id', sql.Int, newId)
            .input('transaction_type', sql.NVarChar, 'شحن رصيد')
            .input('amount', sql.Decimal(10,2), balance.amount)
            .input('balance_type', sql.NVarChar, balance.type)
            .input('payment_method', sql.NVarChar, payment_method || 'نقدي')
            .input('created_by', sql.NVarChar, created_by || 'النظام')
            .input('notes', sql.NVarChar, 'تسجيل عميل جديد')
            .query(`
              INSERT INTO dbo.transactions (client_id, transaction_type, amount, balance_type, payment_method, created_by, notes)
              VALUES (@client_id, @transaction_type, @amount, @balance_type, @payment_method, @created_by, @notes);
            `);
        }
      }

      await transaction.commit();
      return res.status(201).json({ message: 'تم إضافة العميل بنجاح', id: newId });
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) {
    console.error('Error creating client:', err.message);
    return res.status(500).json({ message: 'حدث خطأ أثناء إضافة العميل' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

app.put('/api/clients/:id', async (req, res) => {
  const { id } = req.params;
  const { name, balance_basic, balance_offers, balance_laser, balance_skin, balance_old } = req.body;

  if (!name) {
    return res.status(400).json({ message: 'الاسم مطلوب' });
  }

  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    
    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('name', sql.NVarChar, name.trim())
      .input('balance_basic', sql.Decimal(10,2), parseFloat(balance_basic) || 0)
      .input('balance_offers', sql.Decimal(10,2), parseFloat(balance_offers) || 0)
      .input('balance_laser', sql.Decimal(10,2), parseFloat(balance_laser) || 0)
      .input('balance_skin', sql.Decimal(10,2), parseFloat(balance_skin) || 0)
      .input('balance_old', sql.Decimal(10,2), parseFloat(balance_old) || 0)
      .query(`
        UPDATE dbo.clients 
        SET name = @name, 
            balance_basic = @balance_basic,
            balance_offers = @balance_offers,
            balance_laser = @balance_laser,
            balance_skin = @balance_skin,
            balance_old = @balance_old
        WHERE id = @id
      `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: 'العميل غير موجود' });
    }
    
    return res.json({ message: 'تم تحديث بيانات العميل بنجاح' });
  } catch (err) {
    console.error('Error updating client:', err.message);
    return res.status(500).json({ message: 'حدث خطأ أثناء تحديث العميل' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

app.delete('/api/clients/:id', async (req, res) => {
  const { id } = req.params;
  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM dbo.clients WHERE id = @id');

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: 'العميل غير موجود' });
    }
    return res.json({ message: 'تم حذف العميل بنجاح' });
  } catch (err) {
    console.error('Error deleting client:', err.message);
    return res.status(500).json({ message: 'حدث خطأ أثناء حذف العميل' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

app.post('/api/clients/:id/charge-balance', async (req, res) => {
  const { id } = req.params;
  const { balance_type, amount, payment_method, created_by } = req.body;
  
  if (!balance_type || !amount || !created_by) {
    return res.status(400).json({ message: 'جميع الحقول مطلوبة' });
  }
  
  const parsedAmount = parseFloat(amount);
  if (parsedAmount <= 0) {
    return res.status(400).json({ message: 'المبلغ يجب أن يكون أكبر من صفر' });
  }

  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    
    const clientRes = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM dbo.clients WHERE id = @id');
    
    if (!clientRes.recordset || clientRes.recordset.length === 0) {
      return res.status(404).json({ message: 'العميل غير موجود' });
    }
    
    const client = clientRes.recordset[0];
    
    const balanceFieldMap = {
      'رصيد أساسي': 'balance_basic',
      'رصيد عروض': 'balance_offers',
      'رصيد ليزر': 'balance_laser',
      'رصيد بشرة': 'balance_skin',
      'رصيد قديم': 'balance_old'
    };
    
    const field = balanceFieldMap[balance_type];
    if (!field) {
      return res.status(400).json({ message: 'نوع رصيد غير صحيح' });
    }
    
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    
    try {
      const currentBalance = parseFloat(client[field] || 0);
      const newBalance = currentBalance + parsedAmount;
      
      await transaction.request()
        .input('id', sql.Int, id)
        .input('newBalance', sql.Decimal(10,2), newBalance)
        .query(`UPDATE dbo.clients SET ${field} = @newBalance WHERE id = @id`);
      
      await transaction.request()
        .input('client_id', sql.Int, id)
        .input('transaction_type', sql.NVarChar, 'شحن رصيد')
        .input('amount', sql.Decimal(10,2), parsedAmount)
        .input('balance_type', sql.NVarChar, balance_type)
        .input('payment_method', sql.NVarChar, payment_method || 'نقدي')
        .input('created_by', sql.NVarChar, created_by)
        .input('notes', sql.NVarChar, `تم شحن ${parsedAmount.toFixed(2)} ج`)
        .query(`
          INSERT INTO dbo.transactions (client_id, transaction_type, amount, balance_type, payment_method, created_by, notes)
          VALUES (@client_id, @transaction_type, @amount, @balance_type, @payment_method, @created_by, @notes);
        `);
      
      // ✅ إضافة عملية الشحن للشيفت النشط
      const userRes = await transaction.request()
        .input('created_by', sql.NVarChar, created_by)
        .query('SELECT id FROM dbo.accounts WHERE name = @created_by');
      
      if (userRes.recordset && userRes.recordset.length > 0) {
        const userId = userRes.recordset[0].id;
        
        // البحث عن شيفت مفتوح للموظف
        const shiftRes = await transaction.request()
          .input('user_id', sql.Int, userId)
          .query(`
            SELECT TOP 1 id FROM dbo.shifts 
            WHERE user_id = @user_id AND status = 'open'
            ORDER BY start_time DESC
          `);
        
        if (shiftRes.recordset && shiftRes.recordset.length > 0) {
          const shiftId = shiftRes.recordset[0].id;
          
          // إضافة عملية للشيفت
          await transaction.request()
            .input('shift_id', sql.Int, shiftId)
            .input('operation_type', sql.NVarChar, 'شحن رصيد')
            .input('client_name', sql.NVarChar, client.name)
            .input('client_phone', sql.NVarChar, client.phone)
            .input('amount', sql.Decimal(10,2), parsedAmount)
            .input('payment_method', sql.NVarChar, payment_method || 'نقدي')
            .input('balance_type', sql.NVarChar, balance_type)
            .input('description', sql.NVarChar, `شحن ${balance_type}`)
            .query(`
              INSERT INTO dbo.shift_operations 
              (shift_id, operation_type, client_name, client_phone, amount, payment_method, balance_type, description)
              VALUES 
              (@shift_id, @operation_type, @client_name, @client_phone, @amount, @payment_method, @balance_type, @description);
            `);
          
          // تحديث إجماليات الشيفت حسب طريقة الدفع
          let updateField = '';
          if (payment_method === 'نقدي') updateField = 'total_cash';
          else if (payment_method === 'محفظة') updateField = 'total_wallet';
          else if (payment_method === 'فيزا') updateField = 'total_visa';
          
          if (updateField) {
            await transaction.request()
              .input('shift_id', sql.Int, shiftId)
              .input('amount', sql.Decimal(10,2), parsedAmount)
              .query(`
                UPDATE dbo.shifts 
                SET ${updateField} = ${updateField} + @amount
                WHERE id = @shift_id
              `);
          }
          
          console.log('✅ تم إضافة عملية الشحن للشيفت النشط');
        }
      }
      
      await transaction.commit();
      
      return res.json({ 
        message: `تم شحن ${parsedAmount.toFixed(2)} ج في ${balance_type} بنجاح` 
      });
      
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) {
    console.error('Error charging balance:', err.message);
    return res.status(500).json({ message: 'حدث خطأ أثناء شحن الرصيد' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});
// جلب جميع حجوزات عميل
app.get('/api/clients/:clientId/bookings', async (req, res) => {
  const { clientId } = req.params;
  
  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    
    const result = await pool.request()
      .input('client_id', sql.Int, clientId)
      .query(`
        SELECT 
          b.id as booking_id,
          b.booking_date,
          b.start_time,
          b.end_time,
          b.total_price,
          b.status,
          b.notes,
          b.doctor_id,
          b.created_by,
          b.duration as total_duration,
          a.name as doctor_name,
          c.name as client_name
        FROM dbo.bookings b
        LEFT JOIN dbo.accounts a ON b.doctor_id = a.id
        LEFT JOIN dbo.clients c ON b.client_id = c.id
        WHERE b.client_id = @client_id
        ORDER BY b.booking_date DESC, b.start_time DESC
      `);
    
    const bookings = result.recordset || [];
    
    // جلب الخدمات لكل حجز
    for (let booking of bookings) {
      const servicesRes = await pool.request()
        .input('booking_id', sql.Int, booking.booking_id)
        .query('SELECT * FROM dbo.booking_services WHERE booking_id = @booking_id ORDER BY id');
      
      booking.services = JSON.stringify(servicesRes.recordset || []);
    }
    
    return res.json(bookings);
    
  } catch (error) {
    console.error('❌ Error fetching client bookings:', error);
    return res.status(500).json({ 
      message: 'حدث خطأ أثناء جلب الحجوزات',
      error: error.message 
    });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});
// ============================================
// 📋 جلب زيارات عميل (الجلسات المنتهية)
// ============================================
app.get('/api/clients/:clientId/visits', async (req, res) => {
  const { clientId } = req.params;
  
  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    
    const result = await pool.request()
      .input('client_id', sql.Int, clientId)
      .query(`
        SELECT 
          b.id as booking_id,
          b.booking_date,
          b.start_time,
          b.end_time,
          b.total_price,
          b.status,
          b.doctor_id,
          b.created_by,
          b.duration as total_duration,
          a.name as doctor_name
        FROM dbo.bookings b
        LEFT JOIN dbo.accounts a ON b.doctor_id = a.id
        WHERE b.client_id = @client_id 
          AND b.status = N'انتهت'
        ORDER BY b.booking_date DESC, b.start_time DESC
      `);
    
    const visits = result.recordset || [];
    
    // جلب الخدمات لكل زيارة
    for (let visit of visits) {
      const servicesRes = await pool.request()
        .input('booking_id', sql.Int, visit.booking_id)
        .query('SELECT * FROM dbo.booking_services WHERE booking_id = @booking_id ORDER BY id');
      
      // تحويل الخدمات لـ JSON string
      visit.services = JSON.stringify(servicesRes.recordset || []);
    }
    
    return res.json(visits);
    
  } catch (error) {
    console.error('❌ Error fetching client visits:', error);
    return res.status(500).json({ 
      message: 'حدث خطأ أثناء جلب الزيارات',
      error: error.message 
    });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});
app.post('/api/clients/:id/transfer-balance', async (req, res) => {
  const { id } = req.params;
  const { from_balance, to_balance, amount, created_by } = req.body;
  
  if (!from_balance || !to_balance || !amount || !created_by) {
    return res.status(400).json({ message: 'جميع الحقول مطلوبة' });
  }
  
  if (from_balance === to_balance) {
    return res.status(400).json({ message: 'لا يمكن التحويل لنفس نوع الرصيد' });
  }
  
  const parsedAmount = parseFloat(amount);
  if (parsedAmount <= 0) {
    return res.status(400).json({ message: 'المبلغ يجب أن يكون أكبر من صفر' });
  }

  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    
    const clientRes = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM dbo.clients WHERE id = @id');
    
    if (!clientRes.recordset || clientRes.recordset.length === 0) {
      return res.status(404).json({ message: 'العميل غير موجود' });
    }
    
    const client = clientRes.recordset[0];
    
    const balanceFieldMap = {
      'رصيد أساسي': 'balance_basic',
      'رصيد عروض': 'balance_offers',
      'رصيد ليزر': 'balance_laser',
      'رصيد بشرة': 'balance_skin',
      'رصيد قديم': 'balance_old'
    };
    
    const fromField = balanceFieldMap[from_balance];
    const toField = balanceFieldMap[to_balance];
    
    if (!fromField || !toField) {
      return res.status(400).json({ message: 'نوع رصيد غير صحيح' });
    }
    
    const currentFromBalance = parseFloat(client[fromField] || 0);
    if (currentFromBalance < parsedAmount) {
      return res.status(400).json({ 
        message: `الرصيد غير كافي. الرصيد الحالي: ${currentFromBalance.toFixed(2)} ج` 
      });
    }
    
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    
    try {
      const newFromBalance = currentFromBalance - parsedAmount;
      const newToBalance = parseFloat(client[toField] || 0) + parsedAmount;
      
      await transaction.request()
        .input('id', sql.Int, id)
        .input('newFromBalance', sql.Decimal(10,2), newFromBalance)
        .input('newToBalance', sql.Decimal(10,2), newToBalance)
        .query(`
          UPDATE dbo.clients 
          SET ${fromField} = @newFromBalance,
              ${toField} = @newToBalance
          WHERE id = @id
        `);
      
      await transaction.request()
        .input('client_id', sql.Int, id)
        .input('transaction_type', sql.NVarChar, 'تحويل رصيد')
        .input('amount', sql.Decimal(10,2), -parsedAmount)
        .input('balance_type', sql.NVarChar, from_balance)
        .input('created_by', sql.NVarChar, created_by)
        .input('notes', sql.NVarChar, `تم تحويل ${parsedAmount.toFixed(2)} ج من ${from_balance} إلى ${to_balance}`)
        .query(`
          INSERT INTO dbo.transactions (client_id, transaction_type, amount, balance_type, created_by, notes)
          VALUES (@client_id, @transaction_type, @amount, @balance_type, @created_by, @notes);
        `);
      
      await transaction.request()
        .input('client_id', sql.Int, id)
        .input('transaction_type', sql.NVarChar, 'تحويل رصيد')
        .input('amount', sql.Decimal(10,2), parsedAmount)
        .input('balance_type', sql.NVarChar, to_balance)
        .input('created_by', sql.NVarChar, created_by)
        .input('notes', sql.NVarChar, `تم استقبال ${parsedAmount.toFixed(2)} ج من ${from_balance}`)
        .query(`
          INSERT INTO dbo.transactions (client_id, transaction_type, amount, balance_type, created_by, notes)
          VALUES (@client_id, @transaction_type, @amount, @balance_type, @created_by, @notes);
        `);
      
      await transaction.commit();
      
      return res.json({ 
        message: `تم تحويل ${parsedAmount.toFixed(2)} ج من ${from_balance} إلى ${to_balance} بنجاح` 
      });
      
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) {
    console.error('Error transferring balance:', err.message);
    return res.status(500).json({ message: 'حدث خطأ أثناء تحويل الرصيد' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

app.post('/api/clients/:id/transfer-to-client', async (req, res) => {
  const { id } = req.params;
  const { target_phone, amount, created_by } = req.body;
  
  if (!target_phone || !amount || !created_by) {
    return res.status(400).json({ message: 'جميع الحقول مطلوبة' });
  }
  
  if (!/^01[0-9]{9}$/.test(target_phone)) {
    return res.status(400).json({ message: 'رقم الهاتف يجب أن يكون 11 رقم ويبدأ بـ 01' });
  }
  
  const parsedAmount = parseFloat(amount);
  if (parsedAmount <= 0) {
    return res.status(400).json({ message: 'المبلغ يجب أن يكون أكبر من صفر' });
  }

  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    
    const senderRes = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM dbo.clients WHERE id = @id');
    
    if (!senderRes.recordset || senderRes.recordset.length === 0) {
      return res.status(404).json({ message: 'العميل المُرسل غير موجود' });
    }
    
    const sender = senderRes.recordset[0];
    
    const senderBalance = parseFloat(sender.balance_basic || 0);
    if (senderBalance < parsedAmount) {
      return res.status(400).json({ 
        message: `الرصيد الأساسي غير كافي. الرصيد الحالي: ${senderBalance.toFixed(2)} ج` 
      });
    }
    
    const receiverRes = await pool.request()
      .input('phone', sql.NVarChar, target_phone)
      .query('SELECT * FROM dbo.clients WHERE phone = @phone');
    
    if (!receiverRes.recordset || receiverRes.recordset.length === 0) {
      return res.status(404).json({ message: 'العميل المستهدف غير موجود' });
    }
    
    const receiver = receiverRes.recordset[0];
    
    if (sender.id === receiver.id) {
      return res.status(400).json({ message: 'لا يمكن التحويل لنفس العميل' });
    }
    
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    
    try {
      const newSenderBalance = senderBalance - parsedAmount;
      await transaction.request()
        .input('id', sql.Int, sender.id)
        .input('newBalance', sql.Decimal(10,2), newSenderBalance)
        .query('UPDATE dbo.clients SET balance_basic = @newBalance WHERE id = @id');
      
      const receiverBalance = parseFloat(receiver.balance_basic || 0);
      const newReceiverBalance = receiverBalance + parsedAmount;
      await transaction.request()
        .input('id', sql.Int, receiver.id)
        .input('newBalance', sql.Decimal(10,2), newReceiverBalance)
        .query('UPDATE dbo.clients SET balance_basic = @newBalance WHERE id = @id');
      
      await transaction.request()
        .input('client_id', sql.Int, sender.id)
        .input('transaction_type', sql.NVarChar, 'تحويل لعميل')
        .input('amount', sql.Decimal(10,2), -parsedAmount)
        .input('balance_type', sql.NVarChar, 'رصيد أساسي')
        .input('created_by', sql.NVarChar, created_by)
        .input('notes', sql.NVarChar, `تم تحويل ${parsedAmount.toFixed(2)} ج للعميل ${receiver.name} (${receiver.phone})`)
        .query(`
          INSERT INTO dbo.transactions (client_id, transaction_type, amount, balance_type, created_by, notes)
          VALUES (@client_id, @transaction_type, @amount, @balance_type, @created_by, @notes);
        `);
      
      await transaction.request()
        .input('client_id', sql.Int, receiver.id)
        .input('transaction_type', sql.NVarChar, 'استقبال تحويل')
        .input('amount', sql.Decimal(10,2), parsedAmount)
        .input('balance_type', sql.NVarChar, 'رصيد أساسي')
        .input('created_by', sql.NVarChar, created_by)
        .input('notes', sql.NVarChar, `تم استقبال ${parsedAmount.toFixed(2)} ج من العميل ${sender.name} (${sender.phone})`)
        .query(`
          INSERT INTO dbo.transactions (client_id, transaction_type, amount, balance_type, created_by, notes)
          VALUES (@client_id, @transaction_type, @amount, @balance_type, @created_by, @notes);
        `);
      
      await transaction.commit();
      
      return res.json({ 
        message: `تم تحويل ${parsedAmount.toFixed(2)} ج من ${sender.name} إلى ${receiver.name} بنجاح` 
      });
      
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) {
    console.error('Error transferring to client:', err.message);
    return res.status(500).json({ message: 'حدث خطأ أثناء التحويل' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

app.get('/api/offers', async (req, res) => {
  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    const result = await pool.request()
      .query('SELECT * FROM dbo.offers ORDER BY created_at DESC');
    return res.json(result.recordset || []);
  } catch (err) {
    console.error('Error fetching offers:', err.message);
    return res.status(500).json({ message: 'حدث خطأ أثناء جلب العروض' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

app.post('/api/offers', async (req, res) => {
  const { type, name, services, sessions_count, offer_price, original_price, start_date, end_date, status, description, created_by } = req.body;
  
  if (!type || !name || !services || !offer_price || !start_date || !end_date || !created_by) {
    return res.status(400).json({ message: 'جميع الحقول المطلوبة يجب ملؤها' });
  }

  if (!Array.isArray(services) || services.length === 0) {
    return res.status(400).json({ message: 'يجب تحديد خدمة واحدة على الأقل' });
  }

  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    
    const result = await pool.request()
      .input('name', sql.NVarChar, name.trim())
      .input('type', sql.NVarChar, type)
      .input('services', sql.NVarChar, JSON.stringify(services))
      .input('sessions_count', sql.Int, type === 'sessions' ? parseInt(sessions_count) : null)
      .input('offer_price', sql.Decimal(10,2), parseFloat(offer_price))
      .input('original_price', sql.Decimal(10,2), type === 'sessions' ? parseFloat(original_price || 0) : null)
      .input('start_date', sql.Date, start_date)
      .input('end_date', sql.Date, end_date)
      .input('status', sql.NVarChar, status || 'active')
      .input('description', sql.NVarChar, description || null)
      .input('created_by', sql.NVarChar, created_by)
      .query(`
        INSERT INTO dbo.offers (name, type, services, sessions_count, offer_price, original_price, start_date, end_date, status, description, created_by)
        VALUES (@name, @type, @services, @sessions_count, @offer_price, @original_price, @start_date, @end_date, @status, @description, @created_by);
        SELECT SCOPE_IDENTITY() AS id;
      `);
    
    const newId = result.recordset[0].id;
    return res.status(201).json({ message: 'تم إضافة العرض بنجاح', id: newId });
  } catch (err) {
    console.error('Error creating offer:', err.message);
    return res.status(500).json({ message: 'حدث خطأ أثناء إضافة العرض' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

app.put('/api/offers/:id', async (req, res) => {
  const { id } = req.params;
  const { name, offer_price, start_date, end_date, status, description } = req.body;

  if (!name || !offer_price || !start_date || !end_date || !status) {
    return res.status(400).json({ message: 'جميع الحقول المطلوبة يجب ملؤها' });
  }

  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    
    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('name', sql.NVarChar, name.trim())
      .input('offer_price', sql.Decimal(10,2), parseFloat(offer_price))
      .input('start_date', sql.Date, start_date)
      .input('end_date', sql.Date, end_date)
      .input('status', sql.NVarChar, status)
      .input('description', sql.NVarChar, description || null)
      .query(`
        UPDATE dbo.offers 
        SET name = @name, 
            offer_price = @offer_price,
            start_date = @start_date,
            end_date = @end_date,
            status = @status,
            description = @description
        WHERE id = @id
      `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: 'العرض غير موجود' });
    }
    
    return res.json({ message: 'تم تحديث العرض بنجاح' });
  } catch (err) {
    console.error('Error updating offer:', err.message);
    return res.status(500).json({ message: 'حدث خطأ أثناء تحديث العرض' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

app.delete('/api/offers/:id', async (req, res) => {
  const { id } = req.params;
  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM dbo.offers WHERE id = @id');

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: 'العرض غير موجود' });
    }
    return res.json({ message: 'تم حذف العرض بنجاح' });
  } catch (err) {
    console.error('Error deleting offer:', err.message);
    return res.status(500).json({ message: 'حدث خطأ أثناء حذف العرض' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

// === APIs الحجوزات - نسخة محسّنة ===

// 1. جلب حجوزات دكتور في يوم معين
app.get('/api/bookings/:doctorId/:date', async (req, res) => {
  const { doctorId, date } = req.params;
  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    
    const result = await pool.request()
      .input('doctor_id', sql.Int, doctorId)
      .input('booking_date', sql.Date, date)
      .query(`
        SELECT 
          b.*,
          c.name AS client_name,
          c.phone AS client_phone,
          a.name AS doctor_name,
          FORMAT(CAST(b.start_time AS DATETIME), 'HH:mm') AS start_time_formatted,
          FORMAT(CAST(b.end_time AS DATETIME), 'HH:mm') AS end_time_formatted
        FROM dbo.bookings b
        INNER JOIN dbo.clients c ON b.client_id = c.id
        INNER JOIN dbo.accounts a ON b.doctor_id = a.id
        WHERE b.doctor_id = @doctor_id AND b.booking_date = @booking_date
        ORDER BY b.start_time
      `);
    
    const bookings = result.recordset || [];
    
    // تعديل صيغة الوقت لكل حجز
    bookings.forEach(booking => {
      booking.start_time = booking.start_time_formatted;
      booking.end_time = booking.end_time_formatted;
      delete booking.start_time_formatted;
      delete booking.end_time_formatted;
    });
    
    // جلب الخدمات لكل حجز
    for (let booking of bookings) {
      const servicesRes = await pool.request()
        .input('booking_id', sql.Int, booking.id)
        .query(`
          SELECT * FROM dbo.booking_services
          WHERE booking_id = @booking_id
          ORDER BY id
        `);
      booking.services = servicesRes.recordset || [];
    }
    
    return res.json(bookings);
  } catch (err) {
    console.error('Error fetching bookings:', err.message);
    console.error('Full error:', err);
    return res.status(500).json({ 
      message: 'حدث خطأ أثناء جلب الحجوزات',
      error: err.message 
    });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

app.post('/api/bookings', async (req, res) => {
  const { client_id, client_name, client_phone, is_new_client, doctor_id, booking_date, start_time, end_time, balance_type, services, notes, created_by, offer_data } = req.body;
  let status = req.body.status || 'جاري';

  console.log('📥 البيانات المستلمة:', {
    client_id,
    client_name,
    client_phone,
    is_new_client,
    balance_type,
    services_count: services?.length,
    status
  });
  
  // ⭐⭐ التعديل: السماح بـ balance_type = null للعميل الحالي في حالة الحجز المؤجل
  const isDelayedPayment = notes && notes.includes('[حجز مؤجل الدفع]');
  
  // التحقق من البيانات المطلوبة
  if (!client_name || !client_phone || !doctor_id || !booking_date || !start_time || !end_time || !services || !created_by) {
    console.error('❌ بيانات ناقصة');
    return res.status(400).json({ message: 'جميع الحقول المطلوبة يجب ملؤها' });
  }

  // ⭐⭐ التعديل: السماح بـ balance_type = null إذا كان حجز مؤجل الدفع
  if (!is_new_client && !balance_type && !isDelayedPayment) {
    return res.status(400).json({ message: 'نوع الرصيد مطلوب للعميل الحالي' });
  }


  if (!Array.isArray(services) || services.length === 0) {
    return res.status(400).json({ message: 'يجب إضافة خدمة واحدة على الأقل' });
  }

  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  let transaction;
  let transactionBegun = false;

  try {
    pool = await sql.connect(cfg);
    transaction = new sql.Transaction(pool);
    
    console.log('🔄 بدء Transaction...');
    await transaction.begin();
    transactionBegun = true;
    console.log('✅ Transaction بدأ بنجاح');

    // حساب السعر الإجمالي
    let totalPrice = 0;
    let servicesDuration = 0;
    services.forEach(s => {
      totalPrice += parseFloat(s.price || 0);
      servicesDuration += parseInt(s.duration || 0);
    });

    console.log('💰 السعر الإجمالي:', totalPrice);
    console.log('⏱️ مدة الخدمات:', servicesDuration);

    // حساب المدة من الوقت المحدد
    const timeBasedDuration = calculateDurationFromTime(start_time, end_time);
    console.log('⏱️ المدة من الأوقات:', timeBasedDuration);

    const totalDuration = timeBasedDuration > 0 ? timeBasedDuration : servicesDuration;
    console.log('⏱️ المدة الإجمالية المستخدمة:', totalDuration);

    const formatTime = (timeStr) => {
      if (!timeStr) return null;
      if (timeStr.length === 5) return `${timeStr}:00`;
      return timeStr;
    };
    
    const formattedStartTime = formatTime(start_time);
    const formattedEndTime = formatTime(end_time);
    
    console.log('✅ Formatted Start:', formattedStartTime);
    console.log('✅ Formatted End:', formattedEndTime);

// التحقق من عدم وجود تعارض في الحجوزات
console.log('🔍 التحقق من التعارض في الحجوزات...');
const conflictCheck = await transaction.request()
  .input('doctor_id', sql.Int, doctor_id)
  .input('booking_date', sql.Date, booking_date)
  .input('start_time', sql.VarChar, formattedStartTime)
  .input('end_time', sql.VarChar, formattedEndTime)
  .query(`
    SELECT id, client_name, start_time, end_time, status 
    FROM dbo.bookings 
    WHERE doctor_id = @doctor_id 
      AND booking_date = @booking_date 
      AND status NOT IN ('ملغي', 'انتهت')
      AND (@start_time < end_time AND @end_time > start_time)
  `);

if (conflictCheck.recordset && conflictCheck.recordset.length > 0) {
  const conflictingBooking = conflictCheck.recordset[0];
  await transaction.rollback();
  return res.status(400).json({ 
    message: `⚠️ يوجد تعارض في المواعيد!\n\nموعد موجود: ${formatTimeForConflict(conflictingBooking.start_time)} - ${formatTimeForConflict(conflictingBooking.end_time)}\nالعميل: ${conflictingBooking.client_name}\nالحالة: ${conflictingBooking.status}` 
  });
}

    console.log('✅ لا يوجد تعارض في المواعيد');

    // ⭐ التحقق: إذا كان عميل جديد (is_new_client = true)، نحفظ بحالة "جاري" بدون خصم رصيد
    let shouldDeductBalance = true;

    if (is_new_client) {
      console.log('🆕 عميل جديد - سيتم حفظ الحجز بحالة "جاري" بدون خصم');
      shouldDeductBalance = false;
      // تعيين الحالة لـ "جاري" تلقائياً
      status = 'جاري';
    }

    console.log('💡 هل سيتم خصم الرصيد الآن؟', shouldDeductBalance);
    console.log('📊 حالة الحجز النهائية:', status);

    // ⭐ التحقق من الرصيد فقط للعميل الحالي أو عند التأكيد
    if (!is_new_client && balance_type && shouldDeductBalance) {
      const clientRes = await transaction.request()
        .input('client_id', sql.Int, client_id)
        .query('SELECT * FROM dbo.clients WHERE id = @client_id');
      
      if (!clientRes.recordset || clientRes.recordset.length === 0) {
        throw new Error('العميل غير موجود');
      }
      
      const client = clientRes.recordset[0];
      
      const balanceFieldMap = {
        'رصيد أساسي': 'balance_basic',
        'رصيد عروض': 'balance_offers',
        'رصيد ليزر': 'balance_laser',
        'رصيد بشرة': 'balance_skin'
      };
      
      const field = balanceFieldMap[balance_type];
      if (!field) {
        throw new Error('نوع رصيد غير صحيح');
      }
      
      const clientBalance = parseFloat(client[field] || 0);
      console.log(`💳 رصيد العميل (${balance_type}): ${clientBalance.toFixed(2)} ج`);
      console.log(`💰 المبلغ المطلوب: ${totalPrice.toFixed(2)} ج`);
      
      if (clientBalance < totalPrice) {
        throw new Error(`الرصيد غير كافي. الرصيد الحالي: ${clientBalance.toFixed(2)} ج | المطلوب: ${totalPrice.toFixed(2)} ج`);
      }
      
      console.log('✅ الرصيد كافي - سيتم الخصم عند بدء الجلسة');
    }

    // إعداد الـ notes
    let finalNotes = notes || '';
    if (!is_new_client && balance_type === 'رصيد عروض' && offer_data) {
      const notesObj = {
        originalNotes: notes || '',
        offerData: offer_data
      };
      finalNotes = JSON.stringify(notesObj);
      console.log('🎯 تم إضافة بيانات العرض إلى الـ notes');
    }

    // إضافة الحجز
    console.log('📝 إضافة الحجز للقاعدة...');
    
    // إضافة الحجز مع client_name و duration
    const bookingResult = await transaction.request()
      .input('client_id', sql.Int, client_id)
      .input('client_name', sql.NVarChar, client_name)
      .input('doctor_id', sql.Int, doctor_id)
      .input('booking_date', sql.Date, booking_date)
      .input('start_time', sql.VarChar, formattedStartTime)
      .input('end_time', sql.VarChar, formattedEndTime)
      .input('total_price', sql.Decimal(10,2), totalPrice)
      .input('duration', sql.Int, totalDuration)
      .input('balance_type', sql.NVarChar, balance_type || null)
      .input('status', sql.NVarChar, status)
      .input('notes', sql.NVarChar, finalNotes)
      .input('created_by', sql.NVarChar, created_by)
      .query(`
        INSERT INTO dbo.bookings 
        (client_id, client_name, doctor_id, booking_date, start_time, end_time, total_price, duration, balance_type, status, notes, created_by)
        VALUES 
        (@client_id, @client_name, @doctor_id, @booking_date, @start_time, @end_time, @total_price, @duration, @balance_type, @status, @notes, @created_by);
        SELECT SCOPE_IDENTITY() AS id;
      `);
    
    const bookingId = bookingResult.recordset[0].id;
    console.log('✅ تم إضافة الحجز - ID:', bookingId);

    // ⭐ لا نخصم الرصيد ولا نضيف للشيفت إذا كان عميل جديد
    if (shouldDeductBalance) {
      console.log('ℹ️ سيتم الخصم وإضافة التحويل الداخلي عند بدء الجلسة (تغيير الحالة)');
    } else {
      console.log('ℹ️ عميل جديد - لن يتم الخصم الآن، سيتم عند تأكيد الحجز');
    }

    // إضافة الخدمات
    console.log('📋 إضافة الخدمات...');
    
    for (const service of services) {
      await transaction.request()
        .input('booking_id', sql.Int, bookingId)
        .input('service_id', sql.Int, service.service_id)
        .input('service_name', sql.NVarChar, service.service_name)
        .input('category_name', sql.NVarChar, service.category_name)
        .input('duration', sql.Int, service.duration)
        .input('price', sql.Decimal(10,2), service.price)
        .query(`
          INSERT INTO dbo.booking_services 
          (booking_id, service_id, service_name, category_name, duration, price)
          VALUES 
          (@booking_id, @service_id, @service_name, @category_name, @duration, @price);
        `);
    }
    
    console.log(`✅ تم إضافة ${services.length} خدمة`);

    // ⭐ ملاحظة: تم إزالة خصم جلسات العرض من هنا 
    // وسيتم الخصم عند بدء الجلسة في endpoint تحديث الحالة
    if (balance_type === 'رصيد عروض' && offer_data) {
      console.log('🎯 سيتم خصم جلسات العرض عند بدء الجلسة (عند تغيير الحالة إلى "بدأت")');
    }

    console.log('✅ تأكيد Transaction...');
    await transaction.commit();
    console.log('✅ تم تأكيد العملية بنجاح!');

    let successMessage = 'تم إضافة الحجز بنجاح ✨';

    if (is_new_client) {
      successMessage = 'تم إضافة الحجز بحالة "جاري" ✨\n\n💡 يرجى:\n1️⃣ شحن رصيد العميل\n2️⃣ تأكيد الحجز لخصم القيمة';
    } else {
      successMessage += '\n💡 سيتم الخصم وتسجيل التحويل الداخلي عند بدء الجلسة';
    }

    return res.status(201).json({ 
      message: successMessage, 
      id: bookingId,
      total_price: totalPrice,
      duration: totalDuration,
      is_new_client: is_new_client || false
    });
    
  } catch (err) {
    console.error('❌ خطأ في عملية الحجز:', err.message);
    console.error('Full error:', err);
    
    // Rollback فقط إذا بدأنا Transaction
    if (transactionBegun && transaction) {
      try {
        console.log('🔄 محاولة Rollback...');
        await transaction.rollback();
        console.log('✅ تم Rollback بنجاح');
      } catch (rollbackErr) {
        console.error('❌ خطأ في Rollback:', rollbackErr.message);
      }
    }
    
    return res.status(500).json({ 
      message: err.message || 'حدث خطأ أثناء إضافة الحجز',
      error: err.message 
    });
  } finally {
    try { 
      if (pool) await pool.close(); 
    } catch(e) { 
      console.error('Error closing pool:', e);
    }
  }
});
app.put('/api/bookings/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!status) {
    return res.status(400).json({ message: 'الحالة الجديدة مطلوبة' });
  }

  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  let transaction;
  let transactionBegun = false;

  try {
    pool = await sql.connect(cfg);
    transaction = new sql.Transaction(pool);
    
    console.log('🔄 بدء Transaction لتحديث الحالة...');
    await transaction.begin();
    transactionBegun = true;

    // جلب بيانات الحجز
    const bookingRes = await transaction.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM dbo.bookings WHERE id = @id');
    
    if (!bookingRes.recordset || bookingRes.recordset.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ message: 'الحجز غير موجود' });
    }
    
    const booking = bookingRes.recordset[0];
    const previousStatus = booking.status || 'جاري';

    console.log(`🔄 تحديث الحالة من "${previousStatus}" إلى "${status}"`);

    // ⭐⭐ التعديل: تحديد إذا كان حجز غير مدفوع (بدون balance_type)
    const isUnpaidBooking = !booking.balance_type;

    // ⭐ حالة خاصة: التأكيد من "جاري" → "مؤكد" (فقط تغيير الحالة بدون خصم)
    if (previousStatus === 'جاري' && status === 'مؤكد') {
      console.log('✅ تأكيد الحجز - تغيير الحالة فقط (الخصم سيكون عند بدء الجلسة)');
      
      // ⭐⭐ التعديل: التحقق من الرصيد للحجوزات غير المدفوعة أيضًا
      if (isUnpaidBooking || (booking.balance_type && booking.balance_type !== 'رصيد عروض')) {
        const clientRes = await transaction.request()
          .input('client_id', sql.Int, booking.client_id)
          .query('SELECT * FROM dbo.clients WHERE id = @client_id');
        
        const client = clientRes.recordset[0];
        
        // ⭐⭐ للحجز غير المدفوع، نستخدم الرصيد الأساسي افتراضيًا
        const balanceTypeToCheck = isUnpaidBooking ? 'رصيد أساسي' : booking.balance_type;
        
        const balanceFieldMap = {
          'رصيد أساسي': 'balance_basic',
          'رصيد عروض': 'balance_offers',
          'رصيد ليزر': 'balance_laser',
          'رصيد بشرة': 'balance_skin'
        };
        
        const field = balanceFieldMap[balanceTypeToCheck];
        const clientBalance = parseFloat(client[field] || 0);
        const totalPrice = parseFloat(booking.total_price);
        
        if (clientBalance < totalPrice) {
          await transaction.rollback();
          return res.status(400).json({ 
            message: `⚠️ الرصيد غير كافي لتأكيد الحجز!\n\nالرصيد الحالي: ${clientBalance.toFixed(2)} ج\nالمطلوب: ${totalPrice.toFixed(2)} ج\n\n💡 يرجى شحن رصيد العميل أولاً` 
          });
        }
        
        console.log('✅ الرصيد كافي - سيتم الخصم عند بدء الجلسة');
      }
    }

    // ⭐ إذا كانت الحالة الجديدة "بدأت" والحالة السابقة ليست "بدأت" أو "انتهت"
    // ⭐⭐ التعديل: إزالة استثناء الحجوزات غير المدفوعة
    if (status === 'بدأت' && previousStatus !== 'بدأت' && previousStatus !== 'انتهت') {
      console.log('💰 بدء معالجة الدفع والخصم...');
      
      // ⭐⭐ التعديل: معالجة الحجوزات غير المدفوعة أيضًا
      if (isUnpaidBooking || (booking.balance_type && booking.balance_type !== 'رصيد عروض')) {
        // معالجة الدفع للرصيد العادي
        console.log('💳 معالجة الدفع للرصيد العادي');
        
        // جلب بيانات العميل
        const clientRes = await transaction.request()
          .input('client_id', sql.Int, booking.client_id)
          .query('SELECT * FROM dbo.clients WHERE id = @client_id');
        
        const client = clientRes.recordset[0];
        
        // ⭐⭐ للحجز غير المدفوع، نستخدم الرصيد الأساسي افتراضيًا
        const balanceTypeToUse = isUnpaidBooking ? 'رصيد أساسي' : booking.balance_type;
        
        const balanceFieldMap = {
          'رصيد أساسي': 'balance_basic',
          'رصيد عروض': 'balance_offers',
          'رصيد ليزر': 'balance_laser',
          'رصيد بشرة': 'balance_skin'
        };
        
        const field = balanceFieldMap[balanceTypeToUse];
        if (!field) {
          await transaction.rollback();
          return res.status(400).json({ message: 'نوع رصيد غير صحيح' });
        }
        
        const clientBalance = parseFloat(client[field] || 0);
        const totalPrice = parseFloat(booking.total_price);
        
        console.log(`💳 رصيد العميل الحالي (${balanceTypeToUse}): ${clientBalance.toFixed(2)} ج`);
        console.log(`💰 المبلغ المطلوب: ${totalPrice.toFixed(2)} ج`);
        
        // التحقق من الرصيد
        if (clientBalance < totalPrice) {
          await transaction.rollback();
          return res.status(400).json({ 
            message: `⚠️ الرصيد غير كافي لبدء الجلسة!\n\nالرصيد الحالي: ${clientBalance.toFixed(2)} ج\nالمطلوب: ${totalPrice.toFixed(2)} ج\nالنقص: ${(totalPrice - clientBalance).toFixed(2)} ج` 
          });
        }
        
        // خصم الرصيد
        const newBalance = clientBalance - totalPrice;
        console.log('✅ الرصيد الجديد:', newBalance.toFixed(2));
        
        await transaction.request()
          .input('client_id', sql.Int, booking.client_id)
          .input('newBalance', sql.Decimal(10,2), newBalance)
          .query(`UPDATE dbo.clients SET ${field} = @newBalance WHERE id = @client_id`);
        
        // ⭐⭐ التعديل: تحديث نوع الرصيد في الحجز غير المدفوع
        if (isUnpaidBooking) {
          await transaction.request()
            .input('id', sql.Int, id)
            .input('balance_type', sql.NVarChar, balanceTypeToUse)
            .query(`UPDATE dbo.bookings SET balance_type = @balance_type WHERE id = @id`);
          
          console.log('✅ تم تحديث نوع الرصيد للحجز غير المدفوع إلى:', balanceTypeToUse);
        }
        
        // تحويل التاريخ والوقت
        let bookingDateStr = '';
        let bookingTimeStr = '';
        
        try {
          const dateObj = new Date(booking.booking_date);
          bookingDateStr = dateObj.toISOString().split('T')[0];
          
          if (booking.start_time) {
            if (typeof booking.start_time === 'string') {
              bookingTimeStr = booking.start_time.substring(0, 5);
            } else {
              const timeDate = new Date(booking.start_time);
              bookingTimeStr = timeDate.toTimeString().substring(0, 5);
            }
          }
        } catch (e) {
          console.error('خطأ في معالجة التاريخ/الوقت:', e);
          bookingDateStr = 'غير محدد';
          bookingTimeStr = 'غير محدد';
        }
        
        // تسجيل المعاملة
        await transaction.request()
          .input('client_id', sql.Int, booking.client_id)
          .input('transaction_type', sql.NVarChar, 'حجز موعد')
          .input('amount', sql.Decimal(10,2), -totalPrice)
          .input('balance_type', sql.NVarChar, balanceTypeToUse)
          .input('created_by', sql.NVarChar, booking.created_by)
          .input('notes', sql.NVarChar, `حجز موعد بتاريخ ${bookingDateStr} - الوقت: ${bookingTimeStr}`)
          .query(`
            INSERT INTO dbo.transactions (client_id, transaction_type, amount, balance_type, created_by, notes)
            VALUES (@client_id, @transaction_type, @amount, @balance_type, @created_by, @notes);
          `);
        
        console.log('✅ تم خصم الرصيد وتسجيل المعاملة');

        // ⭐⭐ إضافة العملية للشيفت النشط الخاص بالمستخدم الحالي
        // استخدام المستخدم الحالي (اللي بيبدأ الجلسة) مش اللي عمل الحجز
        const currentUserName = req.body.updated_by || booking.created_by || 'غير محدد';
        
        console.log(`👤 المستخدم الحالي (اللي بيبدأ الجلسة): ${currentUserName}`);
        console.log(`👤 اللي عمل الحجز: ${booking.created_by}`);

        const shiftRes = await transaction.request()
          .input('user_name', sql.NVarChar, currentUserName)
          .query(`
            SELECT TOP 1 id, user_name FROM dbo.shifts 
            WHERE status = 'open' 
            AND user_name = @user_name
            ORDER BY start_time DESC
          `);
        
        if (shiftRes.recordset && shiftRes.recordset.length > 0) {
          const shiftId = shiftRes.recordset[0].id;
          
          console.log(`✅ تم العثور على شيفت مفتوح للمستخدم "${currentUserName}" - رقم الشيفت: ${shiftId}`);
          
          await transaction.request()
            .input('shift_id', sql.Int, shiftId)
            .input('operation_type', sql.NVarChar, 'خصم من رصيد (حجز)')
            .input('client_name', sql.NVarChar, booking.client_name)
            .input('client_phone', sql.NVarChar, client.phone)
            .input('amount', sql.Decimal(10,2), totalPrice)
            .input('payment_method', sql.NVarChar, 'تحويل داخلي')
            .input('balance_type', sql.NVarChar, balanceTypeToUse)
            .input('description', sql.NVarChar, `خصم ${totalPrice.toFixed(2)} ج من ${balanceTypeToUse} للحجز #${booking.id}`)
            .input('booking_id', sql.Int, booking.id)
            .query(`
              INSERT INTO dbo.shift_operations 
              (shift_id, operation_type, client_name, client_phone, amount, payment_method, balance_type, description, booking_id)
              VALUES 
              (@shift_id, @operation_type, @client_name, @client_phone, @amount, @payment_method, @balance_type, @description, @booking_id);
            `);
          
          await transaction.request()
            .input('shift_id', sql.Int, shiftId)
            .input('amount', sql.Decimal(10,2), totalPrice)
            .query(`
              UPDATE dbo.shifts 
              SET total_internal = total_internal + @amount
              WHERE id = @shift_id
            `);
          
          console.log('✅ تم تسجيل العملية في شيفت المستخدم الحالي');
        } else {
          console.log(`⚠️ المستخدم "${currentUserName}" لم يفتح شيفت - لن يتم تسجيل العملية في الشيفت`);
          
          // ⚠️ اختياري: منع بدء الجلسة بدون شيفت مفتوح
          await transaction.rollback();
          return res.status(400).json({ 
            message: `⚠️ يجب فتح شيفت أولاً قبل بدء الجلسة!\n\n` +
                     `المستخدم: ${currentUserName}\n\n` +
                     `الرجاء الذهاب لصفحة الشيفتات وفتح شيفت جديد.`
          });
        }
      }

      // ⭐ معالجة خصم العروض عند بدء الجلسة
      if (booking.balance_type === 'رصيد عروض') {
        console.log('🎯 معالجة خصم جلسات العرض...');
        
        try {
          // محاولة تحليل بيانات العرض من الـ notes
          let offerData = null;
          if (booking.notes) {
            try {
              const notesObj = JSON.parse(booking.notes);
              offerData = notesObj.offerData;
              console.log('📦 بيانات العرض:', offerData);
            } catch (e) {
              console.log('⚠️ لا توجد بيانات عرض في الـ notes');
            }
          }
          
          if (offerData) {
            if (offerData.isFullOffer) {
              // خصم جلسة من كل خدمة في العرض
              const sessionsRes = await transaction.request()
                .input('purchased_offer_id', sql.Int, offerData.offerId)
                .query('SELECT * FROM dbo.offer_service_sessions WHERE purchased_offer_id = @purchased_offer_id');
              
              let deductedCount = 0;
              for (const session of sessionsRes.recordset) {
                if (session.remaining_sessions > 0) {
                  await transaction.request()
                    .input('id', sql.Int, session.id)
                    .query('UPDATE dbo.offer_service_sessions SET remaining_sessions = remaining_sessions - 1 WHERE id = @id');
                  deductedCount++;
                }
              }
              
              console.log(`✅ تم خصم جلسة من ${deductedCount} خدمة في العرض`);
            } else {
              // خصم جلسة من خدمة واحدة فقط
              const result = await transaction.request()
                .input('purchased_offer_id', sql.Int, offerData.offerId)
                .input('service_index', sql.Int, offerData.serviceIndex)
                .query(`
                  UPDATE dbo.offer_service_sessions 
                  SET remaining_sessions = remaining_sessions - 1 
                  WHERE purchased_offer_id = @purchased_offer_id AND service_index = @service_index AND remaining_sessions > 0
                `);
              
              if (result.rowsAffected[0] > 0) {
                console.log('✅ تم خصم جلسة من الخدمة المحددة');
              } else {
                console.log('⚠️ لم يتم خصم جلسة - قد تكون الجلسات نفذت');
              }
            }
          }
        } catch (offerErr) {
          console.error('❌ خطأ في خصم جلسات العرض:', offerErr.message);
          // لا نوقف العملية إذا فشل خصم العرض، نكمل تحديث الحالة
        }
      }
    }


    // تحديث حالة الحجز
    const result = await transaction.request()
      .input('id', sql.Int, id)
      .input('status', sql.NVarChar, status)
      .query(`
        UPDATE dbo.bookings 
        SET status = @status
        WHERE id = @id
      `);

    if (result.rowsAffected[0] === 0) {
      await transaction.rollback();
      return res.status(404).json({ message: 'الحجز غير موجود' });
    }

    await transaction.commit();
    
    // ⭐⭐ التعديل: تحديث رسالة النجاح للحجوزات غير المدفوعة
    let message = '';
    if (status === 'بدأت') {
      if (isUnpaidBooking) {
        message = `تم بدء الجلسة وخصم ${parseFloat(booking.total_price).toFixed(2)} ج من الرصيد الأساسي (حجز غير مدفوع)`;  
      } else if (booking.balance_type === 'رصيد عروض') {
        message = 'تم بدء الجلسة وخصم جلسة من العرض';
      } else if (booking.balance_type) {
        message = `تم بدء الجلسة وخصم ${parseFloat(booking.total_price).toFixed(2)} ج من ${booking.balance_type}`;
      }
    } else {
      message = `تم تحديث حالة الحجز إلى: ${status}`;
    }
    
    return res.json({ message: message });
    
  } catch (err) {
    console.error('❌ Error updating booking status:', err.message);
    console.error('Full error:', err);
    
    // Rollback فقط إذا بدأنا Transaction
    if (transactionBegun && transaction) {
      try {
        console.log('🔄 محاولة Rollback...');
        await transaction.rollback();
        console.log('✅ تم Rollback بنجاح');
      } catch (rollbackErr) {
        console.error('❌ خطأ في Rollback:', rollbackErr.message);
      }
    }
    
    return res.status(500).json({ 
      message: 'حدث خطأ أثناء تحديث الحجز',
      error: err.message 
    });
  } finally {
    try { 
      if (pool) await pool.close(); 
    } catch(e) { 
      console.error('Error closing pool:', e);
    }
  }
});

// 4. حذف حجز (وإرجاع الرصيد)
app.delete('/api/bookings/:id', async (req, res) => {
  const { id } = req.params;
  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // جلب بيانات الحجز
      const bookingRes = await transaction.request()
        .input('id', sql.Int, id)
        .query('SELECT * FROM dbo.bookings WHERE id = @id');
      
      if (!bookingRes.recordset || bookingRes.recordset.length === 0) {
        await transaction.rollback();
        return res.status(404).json({ message: 'الحجز غير موجود' });
      }
      
      const booking = bookingRes.recordset[0];

      // حذف الحجز (سيتم حذف الخدمات تلقائياً بسبب CASCADE)
      await transaction.request()
        .input('id', sql.Int, id)
        .query('DELETE FROM dbo.bookings WHERE id = @id');

      await transaction.commit();
      return res.json({ message: 'تم حذف الحجز وإرجاع الرصيد بنجاح 🗑️' });
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) {
    console.error('Error deleting booking:', err.message);
    return res.status(500).json({ message: 'حدث خطأ أثناء حذف الحجز' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

app.get('/api/bookings/doctor/:doctorId', async (req, res) => {
  const { doctorId } = req.params;
  const { startDate, endDate } = req.query;
  
  console.log('🚀 طلب جلب حجوزات الدكتور (الحل الجذري):', { 
    doctorId, 
    type: typeof doctorId,
    startDate, 
    endDate 
  });

  // ✅ تحويل بسيط مع التعامل مع القيم الفارغة
  let doctorIdNumber;
  try {
    doctorIdNumber = parseInt(doctorId);
    if (isNaN(doctorIdNumber) || doctorIdNumber <= 0) {
      throw new Error('رقم غير صحيح');
    }
  } catch (error) {
    console.error('❌ خطأ في تحويل رقم الدكتور:', error.message);
    return res.status(400).json({ 
      message: 'رقم الدكتور غير صحيح: ' + doctorId,
      received: doctorId
    });
  }

  const cfg = { 
    ...dbConfig, 
    database: 'beyou',
    options: {
      ...dbConfig.options,
      // ✅ إعدادات خاصة لمنع مشاكل المعاملات
      enableArithAbort: true,
      trustServerCertificate: true,
      useUTC: false
    }
  };

  let pool;
  try {
    console.log('🔗 محاولة الاتصال بقاعدة البيانات...');
    pool = await sql.connect(cfg);
    console.log('✅ تم الاتصال بنجاح');

    // ✅ استخدام استعلام مباشر بدون معلمات (حل مؤقت)
    let query = `
      SELECT 
        b.*,
        c.name AS client_name,
        c.phone AS client_phone,
        a.name AS doctor_name
      FROM dbo.bookings b
      INNER JOIN dbo.clients c ON b.client_id = c.id
      INNER JOIN dbo.accounts a ON b.doctor_id = a.id
      WHERE b.doctor_id = ${doctorIdNumber}
    `;
    
    if (startDate) {
      query += ` AND b.booking_date >= '${startDate}'`;
    }
    
    if (endDate) {
      query += ` AND b.booking_date <= '${endDate}'`;
    }
    
    query += ' ORDER BY b.booking_date DESC';

    console.log('📊 تنفيذ الاستعلام:', query.substring(0, 150) + '...');

    const result = await pool.request().query(query);
    
    console.log(`✅ نجح! تم العثور على ${result.recordset.length} حجز`);

    return res.json(result.recordset || []);

  } catch (err) {
    console.error('💥 خطأ فادح:', err.message);
    console.error('تفاصيل الخطأ:', err);
    
    // ✅ محاولة بديلة مع استعلام أبسط
    try {
      console.log('🔄 محاولة بديلة باستعلام أبسط...');
      const simpleQuery = `SELECT * FROM dbo.bookings WHERE doctor_id = ${doctorIdNumber} AND status = 'انتهت'`;
      const simpleResult = await pool.request().query(simpleQuery);
      console.log(`✅ البديلة نجحت! ${simpleResult.recordset.length} حجز`);
      return res.json(simpleResult.recordset || []);
    } catch (simpleError) {
      console.error('❌ فشلت المحاولة البديلة:', simpleError.message);
      return res.status(500).json({ 
        message: 'فشل كامل في جلب البيانات',
        error: err.message,
        alternativeError: simpleError.message
      });
    }
  } finally {
    try { 
      if (pool) {
        await pool.close();
        console.log('🔒 تم إغلاق الاتصال');
      }
    } catch(e) { 
      console.error('خطأ في الإغلاق:', e);
    }
  }
});
// 🔄 endpoint بديل بدون مشاكل المعاملات
app.get('/api/v2/bookings/doctor/:doctorId', async (req, res) => {
  const { doctorId } = req.params;
  const { startDate, endDate } = req.query;
  
  console.log('🆕 استخدام الـ endpoint البديل:', { doctorId, startDate, endDate });

  const doctorIdNum = parseInt(doctorId);
  if (isNaN(doctorIdNum)) {
    return res.json([]); // إرجاع قائمة فارغة بدلاً من خطأ
  }

  const cfg = { ...dbConfig, database: 'beyou' };
  
  try {
    const pool = await sql.connect(cfg);
    
    // استعلام آمن تماماً
    const whereConditions = [`b.doctor_id = ${doctorIdNum}`];
    
    if (startDate) whereConditions.push(`b.booking_date >= '${startDate}'`);
    if (endDate) whereConditions.push(`b.booking_date <= '${endDate}'`);
    whereConditions.push(`b.status = 'انتهت'`);
    
    const whereClause = whereConditions.join(' AND ');
    
    const query = `
      SELECT b.*, c.name as client_name, c.phone as client_phone
      FROM dbo.bookings b
      LEFT JOIN dbo.clients c ON b.client_id = c.id
      WHERE ${whereClause}
      ORDER BY b.booking_date DESC
    `;

    console.log('🔄 الاستعلام البديل:', query);
    
    const result = await pool.request().query(query);
    await pool.close();
    
    return res.json(result.recordset || []);
    
  } catch (error) {
    console.error('❌ خطأ في الـ endpoint البديل:', error.message);
    return res.json([]); // دائماً إرجاع قائمة (حتى لو فارغة)
  }
});
// === API جلب حجوزات حسب من أنشأها (للتقارير الشهرية للأدمن) ===
app.get('/api/bookings/by-creator', async (req, res) => {
  const { startDate, endDate, created_by } = req.query;
  
  if (!created_by) {
    return res.status(400).json({ message: 'اسم الموظف مطلوب' });
  }

  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    
    let query = `
      SELECT 
        b.*,
        c.name AS client_name,
        c.phone AS client_phone,
        a.name AS doctor_name
      FROM dbo.bookings b
      INNER JOIN dbo.clients c ON b.client_id = c.id
      INNER JOIN dbo.accounts a ON b.doctor_id = a.id
      WHERE b.created_by = @created_by AND b.status != N'ملغي'
    `;
    
    const request = pool.request()
      .input('created_by', sql.NVarChar, created_by);
    
    if (startDate) {
      query += ' AND b.booking_date >= @start_date';
      request.input('start_date', sql.Date, startDate);
    }
    
    if (endDate) {
      query += ' AND b.booking_date <= @end_date';
      request.input('end_date', sql.Date, endDate);
    }
    
    query += ' ORDER BY b.booking_date DESC, b.start_time DESC';
    
    console.log('📊 جلب حجوزات الموظف:', created_by, 'من', startDate, 'إلى', endDate);
    
    const result = await request.query(query);
    
    console.log(`✅ تم العثور على ${result.recordset.length} حجز`);
    
    return res.json(result.recordset || []);
    
  } catch (err) {
    console.error('❌ Error fetching bookings by creator:', err.message);
    return res.status(500).json({ message: 'حدث خطأ أثناء جلب الحجوزات' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

// === APIs الأرقام الإضافية ===

// جلب أرقام عميل
app.get('/api/clients/:id/phones', async (req, res) => {
  const { id } = req.params;
  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    
    // التحقق من وجود جدول client_phones
    const tableCheck = await pool.request().query(`
      IF EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_NAME = 'client_phones' AND TABLE_SCHEMA = 'dbo'
      )
      SELECT 1 AS table_exists
      ELSE
      SELECT 0 AS table_exists
    `);
    
    if (!tableCheck.recordset[0]?.table_exists) {
      // الجدول غير موجود، نرجع array فاضي
      return res.json([]);
    }
    
    const result = await pool.request()
      .input('client_id', sql.Int, id)
      .query('SELECT * FROM dbo.client_phones WHERE client_id = @client_id ORDER BY created_at DESC');
    return res.json(result.recordset || []);
  } catch (err) {
    console.error('Error fetching client phones:', err.message);
    // بدل ما نرجع error، نرجع array فاضي
    return res.json([]);
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

// إضافة رقم جديد
app.post('/api/clients/:id/phones', async (req, res) => {
  const { id } = req.params;
  const { phone, phone_type, notes } = req.body;
  
  if (!phone) {
    return res.status(400).json({ message: 'رقم الهاتف مطلوب' });
  }

  if (!/^01[0-9]{9}$/.test(phone)) {
    return res.status(400).json({ message: 'رقم الهاتف يجب أن يكون 11 رقم ويبدأ بـ 01' });
  }

  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    
    // التحقق من عدم تكرار الرقم للعميل نفسه
    const checkRes = await pool.request()
      .input('client_id', sql.Int, id)
      .input('phone', sql.NVarChar, phone)
      .query('SELECT id FROM dbo.client_phones WHERE client_id = @client_id AND phone = @phone');
    
    if (checkRes.recordset && checkRes.recordset.length > 0) {
      return res.status(400).json({ message: 'هذا الرقم مضاف بالفعل لهذا العميل' });
    }

    // التحقق من الرقم الأساسي
    const mainPhoneRes = await pool.request()
      .input('client_id', sql.Int, id)
      .query('SELECT phone FROM dbo.clients WHERE id = @client_id');
    
    if (mainPhoneRes.recordset && mainPhoneRes.recordset[0].phone === phone) {
      return res.status(400).json({ message: 'هذا هو الرقم الأساسي للعميل' });
    }

    const result = await pool.request()
      .input('client_id', sql.Int, id)
      .input('phone', sql.NVarChar, phone)
      .input('phone_type', sql.NVarChar, phone_type || 'إضافي')
      .input('notes', sql.NVarChar, notes || null)
      .query(`
        INSERT INTO dbo.client_phones (client_id, phone, phone_type, notes)
        VALUES (@client_id, @phone, @phone_type, @notes);
        SELECT SCOPE_IDENTITY() AS id;
      `);
    
    const newId = result.recordset[0].id;
    return res.status(201).json({ message: 'تم إضافة الرقم بنجاح', id: newId });
  } catch (err) {
    console.error('Error adding phone:', err.message);
    return res.status(500).json({ message: 'حدث خطأ أثناء إضافة الرقم' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

// حذف رقم إضافي
app.delete('/api/clients/:clientId/phones/:phoneId', async (req, res) => {
  const { clientId, phoneId } = req.params;
  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    const result = await pool.request()
      .input('id', sql.Int, phoneId)
      .input('client_id', sql.Int, clientId)
      .query('DELETE FROM dbo.client_phones WHERE id = @id AND client_id = @client_id');

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: 'الرقم غير موجود' });
    }
    return res.json({ message: 'تم حذف الرقم بنجاح' });
  } catch (err) {
    console.error('Error deleting phone:', err.message);
    return res.status(500).json({ message: 'حدث خطأ أثناء حذف الرقم' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});
// API لإضافة حقل service_index للجدول الموجود
app.post('/api/database/add-service-index', async (req, res) => {
  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    
    // التحقق من وجود الحقل
    const checkColumn = await pool.request().query(`
      SELECT * FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'session_details' AND COLUMN_NAME = 'service_index'
    `);
    
    if (checkColumn.recordset && checkColumn.recordset.length > 0) {
      return res.json({ message: 'الحقل موجود بالفعل' });
    }
    
    // إضافة الحقل
    await pool.request().query(`
      ALTER TABLE dbo.session_details 
      ADD service_index INT NOT NULL DEFAULT 0;
    `);
    
    console.log('✅ تم إضافة حقل service_index');
    return res.json({ message: 'تم إضافة الحقل بنجاح' });
    
  } catch (err) {
    console.error('Error adding service_index:', err.message);
    return res.status(500).json({ message: 'خطأ في إضافة الحقل', error: err.message });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});
// API لتعديل السعر الإجمالي للحجز
app.put('/api/bookings/:id/price', async (req, res) => {
  const { id } = req.params;
  const { new_price } = req.body;

  if (!new_price) {
    return res.status(400).json({ message: 'السعر الجديد مطلوب' });
  }

  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // جلب بيانات الحجز الحالية
      const bookingRes = await transaction.request()
        .input('id', sql.Int, id)
        .query('SELECT total_price FROM dbo.bookings WHERE id = @id');
      
      if (!bookingRes.recordset || bookingRes.recordset.length === 0) {
        await transaction.rollback();
        return res.status(404).json({ message: 'الحجز غير موجود' });
      }

      const currentPrice = parseFloat(bookingRes.recordset[0].total_price);
      const finalPrice = parseFloat(new_price);

      // التحقق من أن التعديل ضمن النطاق المسموح (50%)
      const maxAllowed = currentPrice * 1.5; // +50%
      const minAllowed = currentPrice * 0.5; // -50%

      if (finalPrice > maxAllowed) {
        await transaction.rollback();
        return res.status(400).json({ 
          message: `لا يمكن زيادة السعر أكثر من 50% (الحد الأقصى: ${maxAllowed.toFixed(2)} ج)` 
        });
      }

      if (finalPrice < minAllowed) {
        await transaction.rollback();
        return res.status(400).json({ 
          message: `لا يمكن تخفيض السعر أكثر من 50% (الحد الأدنى: ${minAllowed.toFixed(2)} ج)` 
        });
      }

      // تحديث السعر في قاعدة البيانات
      const result = await transaction.request()
        .input('id', sql.Int, id)
        .input('new_price', sql.Decimal(10,2), finalPrice)
        .query(`
          UPDATE dbo.bookings 
          SET total_price = @new_price
          WHERE id = @id
        `);

      if (result.rowsAffected[0] === 0) {
        await transaction.rollback();
        return res.status(404).json({ message: 'الحجز غير موجود' });
      }

      await transaction.commit();
      
      return res.json({ 
        message: 'تم تعديل السعر بنجاح ✨',
        old_price: currentPrice,
        new_price: finalPrice,
        difference: (finalPrice - currentPrice).toFixed(2)
      });
      
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) {
    console.error('Error updating booking price:', err.message);
    return res.status(500).json({ message: 'حدث خطأ أثناء تعديل السعر' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

// API لتعديل ميعاد الحجز
app.put('/api/bookings/:id/update-time', async (req, res) => {
  const { id } = req.params;
  const { start_time, end_time } = req.body;

  if (!start_time || !end_time) {
    return res.status(400).json({ message: 'وقت البداية والنهاية مطلوبان' });
  }

  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // جلب بيانات الحجز
      const bookingRes = await transaction.request()
        .input('id', sql.Int, id)
        .query('SELECT * FROM dbo.bookings WHERE id = @id');
      
      if (!bookingRes.recordset || bookingRes.recordset.length === 0) {
        await transaction.rollback();
        return res.status(404).json({ message: 'الحجز غير موجود' });
      }

      const booking = bookingRes.recordset[0];

      // تحويل الوقت للصيغة الصحيحة
      const formatTime = (timeStr) => {
        if (!timeStr) return null;
        if (timeStr.length === 5) return `${timeStr}:00`;
        return timeStr;
      };
      
      const formattedStartTime = formatTime(start_time);
      const formattedEndTime = formatTime(end_time);

      // التحقق من التعارض مع حجوزات أخرى
      const conflictCheck = await transaction.request()
        .input('doctor_id', sql.Int, booking.doctor_id)
        .input('booking_date', sql.Date, booking.booking_date)
        .input('start_time', sql.VarChar, formattedStartTime)
        .input('end_time', sql.VarChar, formattedEndTime)
        .input('current_booking_id', sql.Int, id)
        .query(`
          SELECT id, client_name, start_time, end_time, status 
          FROM dbo.bookings 
          WHERE doctor_id = @doctor_id 
            AND booking_date = @booking_date 
            AND id != @current_booking_id
            AND status NOT IN ('ملغي', 'انتهت')
            AND (@start_time < end_time AND @end_time > start_time)
        `);

      if (conflictCheck.recordset && conflictCheck.recordset.length > 0) {
        const conflictingBooking = conflictCheck.recordset[0];
        await transaction.rollback();
        return res.status(400).json({ 
          message: `⚠️ يوجد تعارض في المواعيد!\n\nموعد موجود: ${formatTimeForConflict(conflictingBooking.start_time)} - ${formatTimeForConflict(conflictingBooking.end_time)}\nالعميل: ${conflictingBooking.client_name}\nالحالة: ${conflictingBooking.status}` 
        });
      }

      // حساب المدة الجديدة
      const calculateDuration = (start, end) => {
        const startParts = start.split(':');
        const endParts = end.split(':');
        const startMinutes = parseInt(startParts[0]) * 60 + parseInt(startParts[1]);
        const endMinutes = parseInt(endParts[0]) * 60 + parseInt(endParts[1]);
        return endMinutes - startMinutes;
      };

      const newDuration = calculateDuration(start_time, end_time);

      // تحديث الميعاد
      const result = await transaction.request()
        .input('id', sql.Int, id)
        .input('start_time', sql.VarChar, formattedStartTime)
        .input('end_time', sql.VarChar, formattedEndTime)
        .input('duration', sql.Int, newDuration)
        .query(`
          UPDATE dbo.bookings 
          SET start_time = @start_time,
              end_time = @end_time,
              duration = @duration
          WHERE id = @id
        `);

      if (result.rowsAffected[0] === 0) {
        await transaction.rollback();
        return res.status(404).json({ message: 'الحجز غير موجود' });
      }

      await transaction.commit();
      return res.json({ 
        message: 'تم تعديل الميعاد بنجاح ✨',
        new_time: `${formatTimeForConflict(formattedStartTime)} - ${formatTimeForConflict(formattedEndTime)}`
      });
      
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) {
    console.error('Error updating booking time:', err.message);
    return res.status(500).json({ message: 'حدث خطأ أثناء تعديل الميعاد' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

// حفظ المرتب الثابت لموظف
app.post('/api/accounts/:id/salary', async (req, res) => {
  const { id } = req.params;
  const { fixed_salary } = req.body;
  
  if (fixed_salary === undefined || fixed_salary < 0) {
    return res.status(400).json({ message: 'المرتب غير صحيح' });
  }

  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    
    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('fixed_salary', sql.Decimal(10,2), parseFloat(fixed_salary))
      .query('UPDATE dbo.accounts SET fixed_salary = @fixed_salary WHERE id = @id');

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: 'الموظف غير موجود' });
    }
    
    return res.json({ message: 'تم حفظ المرتب بنجاح', fixed_salary: parseFloat(fixed_salary) });
  } catch (err) {
    console.error('Error saving salary:', err.message);
    return res.status(500).json({ message: 'خطأ في حفظ المرتب' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

// جلب المرتب الثابت لموظف
app.get('/api/accounts/:id/salary', async (req, res) => {
  const { id } = req.params;
  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT fixed_salary FROM dbo.accounts WHERE id = @id');

    if (!result.recordset || result.recordset.length === 0) {
      return res.status(404).json({ message: 'الموظف غير موجود' });
    }
    
    return res.json({ fixed_salary: parseFloat(result.recordset[0].fixed_salary || 0) });
  } catch (err) {
    console.error('Error fetching salary:', err.message);
    return res.status(500).json({ message: 'خطأ في جلب المرتب' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

app.listen(PORT, '0.0.0.0', async () => {
  console.log('Server running on http://localhost:' + PORT);
  
  try {
    await ensureDatabaseExists();
    await ensureAccountsTableExists();
    await ensureServicesTablesExist();
    await ensureSuppliersTablesExist();
    await ensureStockTablesExist();
    await ensureOffersTableExists();        // 👈 العروض قبل العملاء!
    await ensureClientsTableExists();       // 👈 العملاء بعد العروض
    await ensureBookingsTablesExist();
    await fixBookingsTable();
    await ensureShiftsTablesExist();
    await ensureTreasuryTablesExist();
    console.log('✅ Initialization completed successfully!');
    console.log('Available routes:');
    console.log('- http://localhost:3000/login/login.html');
    console.log('- http://localhost:3000/Main/main.html');
    console.log('- http://localhost:3000/accounts/accounts.html');
    console.log('- http://localhost:3000/services/services.html');
    console.log('- http://localhost:3000/offers/offers.html');
    console.log('- http://localhost:3000/bookings/clients.html');
    console.log('- http://localhost:3000/bookings/addnewclient.html');
    console.log('- http://localhost:3000/bookings/manageclients.html');
    console.log('- http://localhost:3000/bookings/clientdetails.html');
    console.log('- http://localhost:3000/shifts/shifts.html');
    console.log('- http://localhost:3000/accountant/accountant.html');
    console.log('- http://localhost:3000/inventory/inventory.html');
    console.log('- http://localhost:3000/inventory/suppliers.html');
    console.log('- http://localhost:3000/inventory/stock.html');

  } catch (initErr) {
    console.error('Initialization failed:', initErr.message);
    console.error('Please check SQL Server is running and accepting connections');
  }
});

// ============================================
// 🆕 API إضافة خدمة إضافية لحجز
// ============================================
app.post('/api/bookings/:id/add-service', async (req, res) => {
  const { id } = req.params;
  const { service_id, service_name, duration, price, balance_type, client_id } = req.body;
  
  if (!service_id || !service_name || !price || !balance_type || !client_id) {
    return res.status(400).json({ message: 'جميع الحقول مطلوبة' });
  }

  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // جلب بيانات العميل للتحقق فقط
      const clientRes = await transaction.request()
        .input('client_id', sql.Int, client_id)
        .query('SELECT * FROM dbo.clients WHERE id = @client_id');
      
      if (!clientRes.recordset || clientRes.recordset.length === 0) {
        await transaction.rollback();
        return res.status(404).json({ message: 'العميل غير موجود' });
      }
      
      const servicePrice = parseFloat(price);
      
      // ⭐ لا تخصم الرصيد الآن - سيتم الخصم عند بدء الحجز
      // نضع علامة "غير مدفوعة" على جميع الخدمات الإضافية
      
      // ⭐ إضافة الخدمة مع علامة "غير مدفوعة"
      await transaction.request()
        .input('booking_id', sql.Int, id)
        .input('service_id', sql.Int, service_id)
        .input('service_name', sql.NVarChar, `${service_name} [غير مدفوعة]`)
        .input('category_name', sql.NVarChar, 'خدمات إضافية')
        .input('duration', sql.Int, duration)
        .input('price', sql.Decimal(10,2), servicePrice)
        .query(`
          INSERT INTO dbo.booking_services (booking_id, service_id, service_name, category_name, duration, price)
          VALUES (@booking_id, @service_id, @service_name, @category_name, @duration, @price);
        `);
      
      // ⭐ تحديث السعر الإجمالي
      await transaction.request()
        .input('booking_id', sql.Int, id)
        .input('price', sql.Decimal(10,2), servicePrice)
        .query('UPDATE dbo.bookings SET total_price = total_price + @price WHERE id = @booking_id');
      
      // ⭐ نضع علامة على الحجز بوجود خدمات غير مدفوعة
      await transaction.request()
        .input('booking_id', sql.Int, id)
        .input('unpaid_amount', sql.Decimal(10,2), servicePrice)
        .query(`
          UPDATE dbo.bookings 
          SET notes = CASE 
            WHEN notes LIKE '%[خدمات غير مدفوعة: %'
            THEN REPLACE(notes, 
              SUBSTRING(notes, CHARINDEX('[خدمات غير مدفوعة: ', notes), CHARINDEX(' ج]', notes) - CHARINDEX('[خدمات غير مدفوعة: ', notes) + 3),
              '[خدمات غير مدفوعة: ' + CAST(
                CAST(SUBSTRING(notes, CHARINDEX('[خدمات غير مدفوعة: ', notes) + 23, CHARINDEX(' ج]', notes) - CHARINDEX('[خدمات غير مدفوعة: ', notes) - 23) AS DECIMAL(10,2)) + @unpaid_amount 
              AS NVARCHAR) + ' ج]'
            )
            ELSE CONCAT(ISNULL(notes, ''), ' [خدمات غير مدفوعة: ' + CAST(@unpaid_amount AS NVARCHAR) + ' ج]')
          END
          WHERE id = @booking_id
        `);
      
      await transaction.commit();
      
      return res.json({ 
        message: `✅ تم إضافة الخدمة بنجاح\n⚠️ سيتم الخصم عند بدء الجلسة\nالمبلغ: ${servicePrice.toFixed(2)} ج`,
        needsPayment: true,
        unpaidAmount: servicePrice
      });
      
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) {
    console.error('Error adding service:', err.message);
    return res.status(500).json({ message: 'حدث خطأ' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

// ============================================
// ⚡ إضافة خدمة مع خصم فوري (للحالات "بدأت" و "انتهت")
// ============================================
// ============================================
// ⚡ API إضافة خدمة مع خصم فوري
// ============================================
app.post('/api/bookings/:id/add-service-instant', async (req, res) => {
  const bookingId = req.params.id;
  const { 
    service_id, 
    service_name, 
    duration, 
    price, 
    balance_type, 
    client_id,
    skip_shift_action 
  } = req.body;

  console.log('⚡ طلب إضافة خدمة فورية:', {
    bookingId,
    service_name,
    price,
    balance_type,
    client_id,
    body: req.body
  });

  // ✅ التحقق من البيانات المطلوبة
  if (!service_id || !service_name || !duration || !price || !balance_type || !client_id) {
    console.error('❌ بيانات ناقصة:', { service_id, service_name, duration, price, balance_type, client_id });
    return res.status(400).json({ 
      message: 'بيانات ناقصة - يجب إرسال جميع الحقول المطلوبة',
      missing: {
        service_id: !service_id,
        service_name: !service_name,
        duration: !duration,
        price: !price,
        balance_type: !balance_type,
        client_id: !client_id
      }
    });
  }

  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  
  try {
    pool = await sql.connect(cfg);
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // 1️⃣ جلب بيانات الحجز
      const bookingRes = await transaction.request()
        .input('booking_id', sql.Int, bookingId)
        .query('SELECT * FROM dbo.bookings WHERE id = @booking_id');

      if (!bookingRes.recordset || bookingRes.recordset.length === 0) {
        await transaction.rollback();
        console.error('❌ الحجز غير موجود:', bookingId);
        return res.status(404).json({ message: 'الحجز غير موجود' });
      }

      const booking = bookingRes.recordset[0];
      console.log('✅ بيانات الحجز:', { id: booking.id, status: booking.status });

      // 2️⃣ التحقق من أن الحالة "بدأت" أو "انتهت"
      if (booking.status !== 'بدأت' && booking.status !== 'انتهت') {
        await transaction.rollback();
        console.error('❌ حالة غير صحيحة:', booking.status);
        return res.status(400).json({ 
          message: 'يمكن إضافة خدمة فورية فقط للحجوزات التي بدأت أو انتهت',
          current_status: booking.status
        });
      }

      // 3️⃣ جلب رصيد العميل
      const clientRes = await transaction.request()
        .input('client_id', sql.Int, client_id)
        .query('SELECT * FROM dbo.clients WHERE id = @client_id');

      if (!clientRes.recordset || clientRes.recordset.length === 0) {
        await transaction.rollback();
        console.error('❌ العميل غير موجود:', client_id);
        return res.status(404).json({ message: 'العميل غير موجود' });
      }

      const client = clientRes.recordset[0];
      console.log('✅ بيانات العميل:', { 
        id: client.id, 
        name: client.name,
        balance_basic: client.balance_basic,
        balance_laser: client.balance_laser,
        balance_skin: client.balance_skin
      });

      // 4️⃣ تحديد نوع الرصيد
      const balanceMap = {
        'رصيد أساسي': 'balance_basic',
        'رصيد ليزر': 'balance_laser',
        'رصيد بشرة': 'balance_skin'
      };

      const balanceField = balanceMap[balance_type];
      if (!balanceField) {
        await transaction.rollback();
        console.error('❌ نوع رصيد غير صحيح:', balance_type);
        return res.status(400).json({ 
          message: 'نوع رصيد غير صحيح',
          received: balance_type,
          valid_types: Object.keys(balanceMap)
        });
      }

      const currentBalance = parseFloat(client[balanceField] || 0);
      const priceAmount = parseFloat(price);

      console.log('💰 فحص الرصيد:', {
        balance_type,
        balance_field: balanceField,
        current_balance: currentBalance,
        required_amount: priceAmount,
        sufficient: currentBalance >= priceAmount
      });

      // 5️⃣ التحقق من كفاية الرصيد
      if (currentBalance < priceAmount) {
        await transaction.rollback();
        console.error('❌ رصيد غير كافي');
        return res.status(400).json({ 
          message: `الرصيد غير كافي!\n\nالرصيد الحالي: ${currentBalance.toFixed(2)} ج\nالمطلوب: ${priceAmount.toFixed(2)} ج`,
          current_balance: currentBalance,
          required_amount: priceAmount,
          shortage: priceAmount - currentBalance
        });
      }

      // 6️⃣ خصم المبلغ من رصيد العميل
      const newBalance = currentBalance - priceAmount;
      console.log('📉 خصم الرصيد:', { old: currentBalance, new: newBalance, deducted: priceAmount });

      await transaction.request()
        .input('client_id', sql.Int, client_id)
        .input('new_balance', sql.Decimal(10,2), newBalance)
        .query(`UPDATE dbo.clients SET ${balanceField} = @new_balance WHERE id = @client_id`);

      // 7️⃣ التحقق من هيكل قاعدة البيانات وإضافة الخدمة
      let servicesUpdated = false;
      let newTotalPrice = parseFloat(booking.total_price || 0) + priceAmount;

      // المحاولة الأولى: إذا كان هناك جدول booking_services
      try {
        console.log('🔄 محاولة إضافة خدمة في جدول booking_services...');
        
        await transaction.request()
          .input('booking_id', sql.Int, bookingId)
          .input('service_id', sql.Int, service_id)
          .input('service_name', sql.NVarChar, service_name)
          .input('duration', sql.Int, duration)
          .input('price', sql.Decimal(10,2), priceAmount)
          .query(`
            INSERT INTO dbo.booking_services (booking_id, service_id, service_name, duration, price)
            VALUES (@booking_id, @service_id, @service_name, @duration, @price)
          `);
        
        servicesUpdated = true;
        console.log('✅ تم إضافة الخدمة في جدول booking_services');
        
      } catch (servicesError) {
        console.log('❌ جدول booking_services غير موجود:', servicesError.message);
        
        // المحاولة الثانية: إذا كان هناك عمود services في جدول bookings
        try {
          console.log('🔄 محاولة تحديث عمود services في جدول bookings...');
          
          // جلب الخدمات الحالية
          const currentServices = booking.services ? JSON.parse(booking.services) : [];
          
          // إضافة الخدمة الجديدة
          const newService = {
            service_id: parseInt(service_id),
            service_name: String(service_name),
            duration: parseInt(duration),
            price: priceAmount
          };
          
          currentServices.push(newService);
          
          await transaction.request()
            .input('booking_id', sql.Int, bookingId)
            .input('services', sql.NVarChar, JSON.stringify(currentServices))
            .query('UPDATE dbo.bookings SET services = @services WHERE id = @booking_id');
          
          servicesUpdated = true;
          console.log('✅ تم تحديث عمود services في جدول bookings');
          
        } catch (jsonError) {
          console.log('❌ عمود services غير موجود:', jsonError.message);
          
          // المحاولة الثالثة: تحديث السعر الإجمالي فقط
          console.log('🔄 محاولة تحديث السعر الإجمالي فقط...');
          await transaction.request()
            .input('booking_id', sql.Int, bookingId)
            .input('total_price', sql.Decimal(10,2), newTotalPrice)
            .query('UPDATE dbo.bookings SET total_price = @total_price WHERE id = @booking_id');
          
          servicesUpdated = true;
          console.log('✅ تم تحديث السعر الإجمالي فقط');
        }
      }

      if (!servicesUpdated) {
        await transaction.rollback();
        return res.status(500).json({ 
          message: 'لا يمكن تحديث الخدمات - هيكل قاعدة البيانات غير معروف'
        });
      }

      console.log('💵 السعر الإجمالي المحدث:', newTotalPrice);

      // 8️⃣ تسجيل في سجل الرصيد
      await transaction.request()
        .input('client_id', sql.Int, client_id)
        .input('amount', sql.Decimal(10,2), -priceAmount)
        .input('balance_type', sql.NVarChar, balance_type)
        .input('created_by', sql.NVarChar, req.body.created_by || 'النظام')
        .input('notes', sql.NVarChar, `خصم فوري - خدمة إضافية: ${service_name} (حجز #${bookingId})`)
        .query(`
          INSERT INTO dbo.transactions (client_id, transaction_type, amount, balance_type, created_by, notes)
          VALUES (@client_id, 'خصم', @amount, @balance_type, @created_by, @notes)
        `);

      // 9️⃣ تسجيل في إجراءات الشيفت (إذا لم يتم تجاهله)
      if (!skip_shift_action) {
        // البحث عن الشيفت النشط
        const shiftRes = await transaction.request()
          .query('SELECT TOP 1 id FROM dbo.shifts WHERE status = \'open\' ORDER BY start_time DESC');

        if (shiftRes.recordset && shiftRes.recordset.length > 0) {
          const shiftId = shiftRes.recordset[0].id;
          
          await transaction.request()
            .input('shift_id', sql.Int, shiftId)
            .input('operation_type', sql.NVarChar, 'خصم فوري')
            .input('client_name', sql.NVarChar, client.name)
            .input('amount', sql.Decimal(10,2), priceAmount)
            .input('payment_method', sql.NVarChar, 'تحويل داخلي')
            .input('balance_type', sql.NVarChar, balance_type)
            .input('description', sql.NVarChar, `خصم فوري - ${service_name} (حجز #${bookingId})`)
            .input('booking_id', sql.Int, bookingId)
            .query(`
              INSERT INTO dbo.shift_operations 
              (shift_id, operation_type, client_name, amount, payment_method, balance_type, description, booking_id)
              VALUES 
              (@shift_id, @operation_type, @client_name, @amount, @payment_method, @balance_type, @description, @booking_id)
            `);

          // تحديث إجمالي التحويلات الداخلية في الشيفت
          await transaction.request()
            .input('shift_id', sql.Int, shiftId)
            .input('amount', sql.Decimal(10,2), priceAmount)
            .query(`
              UPDATE dbo.shifts 
              SET total_internal = total_internal + @amount
              WHERE id = @shift_id
            `);

          console.log('✅ تم تسجيل العملية في الشيفت النشط');
        }
      }

      await transaction.commit();

      console.log('✅ تم إضافة الخدمة وخصم المبلغ بنجاح');

      // 🔄 جلب بيانات الخدمات المحدثة لإرجاعها في الرد
      let updatedServices = [];
      try {
        // محاولة جلب الخدمات من جدول booking_services
        const servicesRes = await pool.request()
          .input('booking_id', sql.Int, bookingId)
          .query('SELECT * FROM dbo.booking_services WHERE booking_id = @booking_id ORDER BY id');
        
        updatedServices = servicesRes.recordset;
        console.log('✅ تم جلب الخدمات المحدثة من booking_services:', updatedServices.length);
      } catch (fetchError) {
        console.log('❌ لا يمكن جلب الخدمات من booking_services:', fetchError.message);
        
        // محاولة جلب الخدمات من عمود services في bookings
        try {
          const bookingRes = await pool.request()
            .input('booking_id', sql.Int, bookingId)
            .query('SELECT services FROM dbo.bookings WHERE id = @booking_id');
          
          if (bookingRes.recordset[0] && bookingRes.recordset[0].services) {
            updatedServices = JSON.parse(bookingRes.recordset[0].services);
            console.log('✅ تم جلب الخدمات من عمود services:', updatedServices.length);
          }
        } catch (jsonError) {
          console.log('❌ لا يمكن جلب الخدمات من عمود services:', jsonError.message);
        }
      }

      // إنشاء كائن الخدمة المضافَة
      const addedService = {
        service_id: parseInt(service_id),
        service_name: String(service_name),
        duration: parseInt(duration),
        price: priceAmount
      };

      res.json({
        success: true,
        message: `تم إضافة الخدمة وخصم ${priceAmount.toFixed(2)} ج من ${balance_type}`,
        new_balance: newBalance.toFixed(2),
        new_total_price: newTotalPrice.toFixed(2),
        service_added: addedService,
        updated_services: updatedServices, // ⭐ إرجاع جميع الخدمات المحدثة
        services_count: updatedServices.length // ⭐ عدد الخدمات الجديد
      });

    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('❌ خطأ في إضافة خدمة فورية:', {
      error_message: error.message,
      error_stack: error.stack,
      booking_id: bookingId,
      request_body: req.body
    });
    
    res.status(500).json({ 
      message: 'حدث خطأ في إضافة الخدمة',
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  } finally {
    try { 
      if (pool) await pool.close(); 
    } catch(e) { 
      console.error('خطأ في إغلاق الاتصال:', e);
    }
  }
});
// API لجلب خدمات حجز معين
app.get('/api/bookings/:id/services', async (req, res) => {
  const { id } = req.params;
  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  
  try {
    pool = await sql.connect(cfg);
    
    const result = await pool.request()
      .input('booking_id', sql.Int, id)
      .query(`
        SELECT * FROM dbo.booking_services 
        WHERE booking_id = @booking_id
        ORDER BY id
      `);
    
    res.json({
      success: true,
      services: result.recordset || []
    });
    
  } catch (error) {
    console.error('❌ خطأ في جلب خدمات الحجز:', error);
    res.status(500).json({ 
      success: false,
      message: 'حدث خطأ في جلب خدمات الحجز',
      services: []
    });
  } finally {
    try { if (pool) await pool.close(); } catch(e) { }
  }
});
// ============================================
// 💳 API دفع الخدمات الغير مدفوعة
// ============================================
app.post('/api/bookings/:id/pay-unpaid-services', async (req, res) => {
  const { id } = req.params;
  const { balance_type, amount, client_id, paid_by } = req.body;
  
  if (!balance_type || !amount || !client_id || !paid_by) {
    return res.status(400).json({ message: 'جميع الحقول مطلوبة' });
  }

  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // جلب بيانات العميل
      const clientRes = await transaction.request()
        .input('client_id', sql.Int, client_id)
        .query('SELECT * FROM dbo.clients WHERE id = @client_id');
      
      if (!clientRes.recordset || clientRes.recordset.length === 0) {
        await transaction.rollback();
        return res.status(404).json({ message: 'العميل غير موجود' });
      }
      
      const client = clientRes.recordset[0];
      
      const balanceFieldMap = {
        'رصيد أساسي': 'balance_basic',
        'رصيد ليزر': 'balance_laser',
        'رصيد بشرة': 'balance_skin'
      };
      
      const field = balanceFieldMap[balance_type];
      const clientBalance = parseFloat(client[field] || 0);
      const paymentAmount = parseFloat(amount);
      
      if (clientBalance < paymentAmount) {
        await transaction.rollback();
        return res.status(400).json({ 
          message: `الرصيد غير كافي. الرصيد الحالي: ${clientBalance.toFixed(2)} ج | المطلوب: ${paymentAmount.toFixed(2)} ج` 
        });
      }
      
      // خصم المبلغ
      const newBalance = clientBalance - paymentAmount;
      await transaction.request()
        .input('client_id', sql.Int, client_id)
        .input('new_balance', sql.Decimal(10,2), newBalance)
        .query(`UPDATE dbo.clients SET ${field} = @new_balance WHERE id = @client_id`);
      
      // تسجيل المعاملة
      await transaction.request()
        .input('client_id', sql.Int, client_id)
        .input('amount', sql.Decimal(10,2), -paymentAmount)
        .input('balance_type', sql.NVarChar, balance_type)
        .input('created_by', sql.NVarChar, paid_by)
        .input('notes', sql.NVarChar, `دفع خدمات إضافية - الحجز رقم ${id}`)
        .query(`
          INSERT INTO dbo.transactions (client_id, transaction_type, amount, balance_type, created_by, notes)
          VALUES (@client_id, 'دفع خدمات', @amount, @balance_type, @created_by, @notes);
        `);
        // ⭐ تسجيل العملية في الشيفت
const shiftRes = await transaction.request()
  .query(`
    SELECT TOP 1 id FROM dbo.shifts 
    WHERE status = 'open'
    ORDER BY start_time DESC
  `);

if (shiftRes.recordset && shiftRes.recordset.length > 0) {
  const shiftId = shiftRes.recordset[0].id;
  
  // جلب بيانات الحجز لمعرفة اسم العميل
  const bookingRes = await transaction.request()
    .input('booking_id', sql.Int, id)
    .query('SELECT client_name FROM dbo.bookings WHERE id = @booking_id');
  
  const clientName = bookingRes.recordset[0]?.client_name || 'عميل';
  
  // إضافة عملية للشيفت
  await transaction.request()
    .input('shift_id', sql.Int, shiftId)
    .input('operation_type', sql.NVarChar, 'دفع خدمات إضافية')
    .input('client_name', sql.NVarChar, clientName)
    .input('amount', sql.Decimal(10,2), paymentAmount)
    .input('payment_method', sql.NVarChar, 'تحويل داخلي')
    .input('balance_type', sql.NVarChar, balance_type)
    .input('description', sql.NVarChar, `دفع خدمات إضافية - الحجز #${id}`)
    .input('booking_id', sql.Int, id)
    .query(`
      INSERT INTO dbo.shift_operations 
      (shift_id, operation_type, client_name, amount, payment_method, balance_type, description, booking_id)
      VALUES 
      (@shift_id, @operation_type, @client_name, @amount, @payment_method, @balance_type, @description, @booking_id);
    `);
  
  // تحديث إجمالي التحويلات الداخلية
  await transaction.request()
    .input('shift_id', sql.Int, shiftId)
    .input('amount', sql.Decimal(10,2), paymentAmount)
    .query(`
      UPDATE dbo.shifts 
      SET total_internal = total_internal + @amount
      WHERE id = @shift_id
    `);
  
  console.log('✅ تم تسجيل دفع الخدمات في الشيفت النشط');
}
      
// ⭐ إزالة علامة الخدمات الغير مدفوعة وتحديث أسماء الخدمات
await transaction.request()
  .input('booking_id', sql.Int, id)
  .query(`
    -- إزالة العلامة من notes
    UPDATE dbo.bookings 
    SET notes = REPLACE(
      REPLACE(notes, 
        SUBSTRING(notes, CHARINDEX('[خدمات غير مدفوعة:', notes), 
          CHARINDEX('ج]', notes, CHARINDEX('[خدمات غير مدفوعة:', notes)) - CHARINDEX('[خدمات غير مدفوعة:', notes) + 2
        ), 
        ''
      ),
      '  ', ' '
    )
    WHERE id = @booking_id;
    
    -- تحديث أسماء الخدمات (إزالة [غير مدفوعة] وتحويلها لـ [إضافية - مدفوعة])
    UPDATE dbo.booking_services
    SET service_name = REPLACE(service_name, '[غير مدفوعة]', '[إضافية - مدفوعة]')
    WHERE booking_id = @booking_id AND service_name LIKE '%[غير مدفوعة]%';
  `);   
      await transaction.commit();
      
      return res.json({ 
        message: '✅ تم دفع الخدمات بنجاح',
        new_balance: newBalance
      });
      
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) {
    console.error('Error paying unpaid services:', err.message);
    return res.status(500).json({ message: 'حدث خطأ' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});
// === APIs تفاصيل الجلسات ===
// === API جلب حجوزات حسب من أنشأها (للتقارير الشهرية) ===
app.get('/api/bookings/by-creator', async (req, res) => {
  const { startDate, endDate, created_by } = req.query;
  
  if (!created_by) {
    return res.status(400).json({ message: 'اسم الموظف مطلوب' });
  }

  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    
    let query = `
      SELECT 
        b.*,
        c.name AS client_name,
        c.phone AS client_phone,
        a.name AS doctor_name
      FROM dbo.bookings b
      INNER JOIN dbo.clients c ON b.client_id = c.id
      INNER JOIN dbo.accounts a ON b.doctor_id = a.id
      WHERE b.created_by = @created_by AND b.status != N'ملغي'
    `;
    
    const request = pool.request()
      .input('created_by', sql.NVarChar, created_by);
    
    if (startDate) {
      query += ' AND b.booking_date >= @start_date';
      request.input('start_date', sql.Date, startDate);
    }
    
    if (endDate) {
      query += ' AND b.booking_date <= @end_date';
      request.input('end_date', sql.Date, endDate);
    }
    
    query += ' ORDER BY b.booking_date DESC, b.start_time DESC';
    
    const result = await request.query(query);
    return res.json(result.recordset || []);
    
  } catch (err) {
    console.error('Error fetching bookings by creator:', err.message);
    return res.status(500).json({ message: 'حدث خطأ أثناء جلب الحجوزات' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});
// حفظ تفاصيل خدمة
app.post('/api/session-details', async (req, res) => {
  const { 
    booking_id, service_id, service_index, service_name, detail_type,
    session_number, session_type, pulses, power, puls_duration, 
    spot_size, skin_type, product_used, quantity, 
    notes, doctor_name, doctor_role 
  } = req.body;
  
  console.log('📥 استقبال بيانات:', { booking_id, service_id, service_index, detail_type });
  
  if (!booking_id || !service_id || service_index === undefined || !service_name || !detail_type || !doctor_name || !doctor_role) {
    return res.status(400).json({ message: 'البيانات الأساسية مطلوبة' });
  }

  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    
    // حذف التفاصيل القديمة لنفس الخدمة في نفس الحجز
    await pool.request()
      .input('booking_id', sql.Int, booking_id)
      .input('service_id', sql.Int, service_id)
      .input('service_index', sql.Int, service_index)
      .query('DELETE FROM dbo.session_details WHERE booking_id = @booking_id AND service_id = @service_id AND service_index = @service_index');
    
    console.log('🗑️ تم حذف التفاصيل القديمة إن وجدت');
    
    // إضافة التفاصيل الجديدة
    const result = await pool.request()
      .input('booking_id', sql.Int, booking_id)
      .input('service_id', sql.Int, service_id)
      .input('service_index', sql.Int, service_index)
      .input('service_name', sql.NVarChar, service_name)
      .input('detail_type', sql.NVarChar, detail_type)
      .input('session_number', sql.Int, session_number || null)
      .input('session_type', sql.NVarChar, session_type || null)
      .input('pulses', sql.Int, pulses || null)
      .input('power', sql.Decimal(10,2), power || null)
      .input('puls_duration', sql.Decimal(10,2), puls_duration || null)
      .input('spot_size', sql.Decimal(10,2), spot_size || null)
      .input('skin_type', sql.NVarChar, skin_type || null)
      .input('product_used', sql.NVarChar, product_used || null)
      .input('quantity', sql.Decimal(10,2), quantity || null)
      .input('notes', sql.NVarChar, notes || null)
      .input('doctor_name', sql.NVarChar, doctor_name)
      .input('doctor_role', sql.NVarChar, doctor_role)
      .query(`
        INSERT INTO dbo.session_details 
        (booking_id, service_id, service_index, service_name, detail_type, 
         session_number, session_type, pulses, power, puls_duration, spot_size, skin_type,
         product_used, quantity, notes, doctor_name, doctor_role)
        VALUES 
        (@booking_id, @service_id, @service_index, @service_name, @detail_type,
         @session_number, @session_type, @pulses, @power, @puls_duration, @spot_size, @skin_type,
         @product_used, @quantity, @notes, @doctor_name, @doctor_role);
        SELECT SCOPE_IDENTITY() AS id;
      `);
    
    const newId = result.recordset[0].id;
    console.log('✅ تم حفظ التفاصيل - ID:', newId);
    return res.status(201).json({ message: 'تم حفظ التفاصيل بنجاح', id: newId });
    
  } catch (err) {
    console.error('❌ Error saving session details:', err.message);
    console.error('Full error:', err);
    return res.status(500).json({ message: 'حدث خطأ أثناء حفظ التفاصيل', error: err.message });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

// جلب تفاصيل جلسة
app.get('/api/session-details/:bookingId', async (req, res) => {
  const { bookingId } = req.params;
  
  console.log('📤 طلب جلب تفاصيل الحجز:', bookingId);
  
  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    
    // التحقق من وجود الجدول
    const tableCheck = await pool.request().query(`
      SELECT * FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_NAME = 'session_details' AND TABLE_SCHEMA = 'dbo'
    `);
    
    if (!tableCheck.recordset || tableCheck.recordset.length === 0) {
      console.log('⚠️ جدول session_details غير موجود');
      return res.json([]);
    }
    
    const result = await pool.request()
      .input('booking_id', sql.Int, bookingId)
      .query('SELECT * FROM dbo.session_details WHERE booking_id = @booking_id ORDER BY service_index, created_at');
    
    console.log('✅ إرسال تفاصيل الحجز:', bookingId, '- عدد السجلات:', result.recordset?.length || 0);
    return res.json(result.recordset || []);
  } catch (err) {
    console.error('❌ Error fetching session details:', err.message);
    console.error('Full error:', err);
    return res.status(500).json({ message: 'حدث خطأ أثناء جلب التفاصيل', error: err.message });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});

// جلب تفاصيل خدمة معينة
app.get('/api/session-details/:bookingId/:serviceId/:serviceIndex', async (req, res) => {
  const { bookingId, serviceId, serviceIndex } = req.params;
  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  try {
    pool = await sql.connect(cfg);
    const result = await pool.request()
      .input('booking_id', sql.Int, bookingId)
      .input('service_id', sql.Int, serviceId)
      .input('service_index', sql.Int, serviceIndex)
      .query('SELECT * FROM dbo.session_details WHERE booking_id = @booking_id AND service_id = @service_id AND service_index = @service_index');
    
    if (result.recordset && result.recordset.length > 0) {
      return res.json(result.recordset[0]);
    } else {
      return res.json(null);
    }
  } catch (err) {
    console.error('Error fetching service details:', err.message);
    return res.status(500).json({ message: 'حدث خطأ' });
  } finally {
    try { if (pool) await pool.close(); } catch(e){ }
  }
});
// في server.js - استبدال دالة remove-service بالكامل
app.post('/api/bookings/:id/remove-service', async (req, res) => {
  const { id } = req.params;
  const { service_index, service_name, service_price, balance_type, client_id, removed_by } = req.body;
  
  console.log('📥 استلام طلب حذف خدمة:', {
    id, service_index, service_name, service_price, balance_type, client_id, removed_by
  });
  
  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  
  try {
    pool = await sql.connect(cfg);
    
    // 1️⃣ جلب خدمات الحجز من جدول booking_services
    const servicesResult = await pool.request()
      .input('booking_id', sql.Int, id)
      .query(`
        SELECT bs.*, s.name as service_name, s.price as service_price, c.name as category_name
        FROM booking_services bs
        LEFT JOIN services s ON bs.service_id = s.id
        LEFT JOIN service_categories c ON s.category_id = c.id
        WHERE bs.booking_id = @booking_id
        ORDER BY bs.id
      `);
    
    const services = servicesResult.recordset;
    console.log('🔍 الخدمات الموجودة في booking_services:', services);
    
    if (services.length === 0) {
      return res.status(400).json({ message: 'لا توجد خدمات مرتبطة بهذا الحجز' });
    }
    
    // 2️⃣ التحقق من service_index
    const serviceIndex = parseInt(service_index);
    if (isNaN(serviceIndex) || serviceIndex < 0 || serviceIndex >= services.length) {
      return res.status(400).json({ 
        message: `فهرس الخدمة غير صالح. النطاق المسموح: 0 إلى ${services.length - 1}` 
      });
    }
    
    // 3️⃣ التحقق من أن عدد الخدمات بعد الحذف لا يقل عن 1
    if (services.length <= 1) {
      return res.status(400).json({ message: 'لا يمكن حذف جميع الخدمات من الحجز' });
    }
    
    const serviceToDelete = services[serviceIndex];
    console.log('🗑️ الخدمة المراد حذفها:', serviceToDelete);
    
    // 4️⃣ حذف الخدمة من جدول booking_services
    await pool.request()
      .input('service_id', sql.Int, serviceToDelete.id)
      .query('DELETE FROM booking_services WHERE id = @service_id');
    
    console.log('✅ تم حذف الخدمة من booking_services');
    
    // 5️⃣ تحديث السعر الإجمالي في جدول الحجوزات
    const bookingResult = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT total_price FROM bookings WHERE id = @id');
    
    if (bookingResult.recordset.length === 0) {
      return res.status(404).json({ message: 'الحجز غير موجود' });
    }
    
    const currentTotal = parseFloat(bookingResult.recordset[0].total_price);
    const newTotalPrice = Math.max(0, currentTotal - parseFloat(service_price));
    
    await pool.request()
      .input('total_price', sql.Decimal(10, 2), newTotalPrice)
      .input('id', sql.Int, id)
      .query('UPDATE bookings SET total_price = @total_price WHERE id = @id');
    
    console.log('💰 تم تحديث السعر الإجمالي:', { currentTotal, newTotalPrice });
    
    // 6️⃣ إرجاع الفلوس للعميل
    if (balance_type && client_id) {
      const balanceField = balance_type === 'رصيد أساسي' ? 'balance_basic' :
                          balance_type === 'رصيد ليزر' ? 'balance_laser' :
                          balance_type === 'رصيد بشرة' ? 'balance_skin' : 'balance_basic';
      
      console.log('💳 إرجاع الرصيد:', { balanceField, service_price, client_id });
      
      await pool.request()
        .input('amount', sql.Decimal(10, 2), service_price)
        .input('client_id', sql.Int, client_id)
        .query(`UPDATE clients SET ${balanceField} = ${balanceField} + @amount WHERE id = @client_id`);
      
      console.log('✅ تم إرجاع المبلغ للعميل');
    }
    
    // 7️⃣ ✅ محاولة التسجيل في الشيفت مع معالجة الخطأ
    try {
      // التحقق أولاً إذا كان جدول shift_transactions موجود
      const tableCheck = await pool.request()
        .query(`SELECT COUNT(*) as table_exists FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'shift_transactions'`);
      
      if (tableCheck.recordset[0].table_exists > 0) {
        await pool.request()
          .input('type', sql.NVarChar(50), 'إرجاع رصيد')
          .input('amount', sql.Decimal(10, 2), service_price)
          .input('description', sql.NVarChar(sql.MAX), `إرجاع ${service_price} ج للعميل بعد حذف خدمة: ${service_name} من الحجز #${id}`)
          .input('created_by', sql.NVarChar(100), removed_by)
          .query('INSERT INTO shift_transactions (type, amount, description, created_by, created_at) VALUES (@type, @amount, @description, @created_by, GETDATE())');
        
        console.log('✅ تم تسجيل العملية في الشيفت');
      } else {
        console.log('⚠️ جدول shift_transactions غير موجود - تخطي التسجيل');
      }
    } catch (shiftError) {
      console.log('⚠️ لم يتم التسجيل في الشيفت:', shiftError.message);
      // نستمر لأن هذه ليست عملية حرجة
    }
    
    res.json({ 
      message: 'تم حذف الخدمة بنجاح وإرجاع المبلغ للعميل',
      new_total: newTotalPrice
    });
    
  } catch (error) {
    console.error('❌ خطأ في حذف الخدمة:', error);
    res.status(500).json({ message: 'خطأ في حذف الخدمة: ' + error.message });
  } finally {
    if (pool) {
      await pool.close();
    }
  }
});

// POST /api/clients/:id/historical-charge
app.post('/api/clients/:id/historical-charge', async (req, res) => {
  const { id } = req.params;
  const { balance_type, amount, charge_date, notes, created_by } = req.body;
  
  const cfg = { ...dbConfig, database: 'beyou' };
  let pool;
  
  try {
    // التحقق من البيانات المطلوبة
    if (!balance_type || !amount || !charge_date || !created_by) {
      return res.status(400).json({ message: 'جميع الحقول الإلزامية مطلوبة' });
    }

    if (amount <= 0) {
      return res.status(400).json({ message: 'المبلغ يجب أن يكون أكبر من صفر' });
    }

    pool = await sql.connect(cfg);

    // 1. التحقق من وجود العميل
    const clientResult = await pool.request()
      .input('client_id', sql.Int, id)
      .query('SELECT * FROM dbo.clients WHERE id = @client_id');

    if (clientResult.recordset.length === 0) {
      return res.status(404).json({ message: 'العميل غير موجود' });
    }

    const client = clientResult.recordset[0];

    // 2. تحديد حقل الرصيد المناسب
    const balanceFieldMap = {
      'رصيد أساسي': 'balance_basic',
      'رصيد عروض': 'balance_offers',
      'رصيد ليزر': 'balance_laser', 
      'رصيد جلدية': 'balance_skin',
      'رصيد قديم': 'balance_old'
    };

    const balanceField = balanceFieldMap[balance_type];
    if (!balanceField) {
      return res.status(400).json({ message: 'نوع الرصيد غير صحيح' });
    }

    // 3. حساب الرصيد الجديد
    const currentBalance = parseFloat(client[balanceField] || 0);
    const newBalance = currentBalance + parseFloat(amount);

    // 4. تحديث رصيد العميل
    await pool.request()
      .input('new_balance', sql.Decimal(10, 2), newBalance)
      .input('client_id', sql.Int, id)
      .query(`UPDATE dbo.clients SET ${balanceField} = @new_balance WHERE id = @client_id`);

    // 5. إضافة المعاملة كعملية تاريخية (نستخدم الملاحظات للتمييز)
    const transactionQuery = `
      INSERT INTO dbo.transactions 
      (client_id, balance_type, transaction_type, amount, payment_method, created_by, notes, created_at)
      VALUES (@client_id, @balance_type, @transaction_type, @amount, @payment_method, @created_by, @notes, @created_at)
    `;

    await pool.request()
      .input('client_id', sql.Int, id)
      .input('balance_type', sql.NVarChar, balance_type)
      .input('transaction_type', sql.NVarChar, 'شحن رصيد تاريخي')
      .input('amount', sql.Decimal(10, 2), amount)
      .input('payment_method', sql.NVarChar, 'تحويل داخلي')
      .input('created_by', sql.NVarChar, created_by)
      .input('notes', sql.NVarChar, notes ? `[تاريخي] ${notes}` : '[تاريخي] شحن رصيد بتاريخ قديم')
      .input('created_at', sql.DateTime, new Date(charge_date))
      .query(transactionQuery);

    res.json({ 
      message: '✅ تم شحن الرصيد التاريخي بنجاح',
      new_balance: newBalance,
      balance_type: balance_type
    });

  } catch (err) {
    console.error('Error in historical charge:', err.message);
    return res.status(500).json({ 
      message: 'حدث خطأ في الخادم أثناء شحن الرصيد',
      error: err.message 
    });
  } finally {
    // إغلاق الاتصال بشكل آمن
    try { 
      if (pool && pool.close) {
        await pool.close();
      }
    } catch(e) { 
      console.error('Error closing pool:', e);
    }
  }
});
// دالة مساعدة للحصول على اسم حقل الرصيد
function getBalanceField(balanceType) {
  const balanceMap = {
    'رصيد أساسي': 'balance_basic',
    'رصيد عروض': 'balance_offers', 
    'رصيد ليزر': 'balance_laser',
    'رصيد جلدية': 'balance_skin',
    'رصيد قديم': 'balance_old'
  };
  return balanceMap[balanceType] || 'balance_basic';
}