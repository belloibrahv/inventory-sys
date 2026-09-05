# Abu Twins Enterprise ERP

A comprehensive multi-branch phone and gadget retail management system built with Next.js 15, TypeScript, and PostgreSQL.

## 🚀 Features

### Core Modules
- **Authentication & Authorization**: Role-based access control (RBAC) with 9 user roles
- **Branch Management**: Multi-branch operations with independent inventory and sales
- **Product Management**: Complete product catalog with variants, conditions, and pricing
- **IMEI Intelligence Engine**: Advanced IMEI tracking with lifecycle management
- **Inventory Management**: Real-time stock tracking with validation and alerts
- **Sales System**: Retail and wholesale sales with multiple payment methods
- **Customer Management**: Customer profiles with ledger system and debt tracking
- **Supplier Management**: Supplier relationships and purchase orders
- **Returns Management**: Comprehensive return processing with fault classification
- **Swap Management**: Device trade-in system with valuation workflow
- **Finance Module**: Complete financial tracking with ledger and expense management
- **Pricing Engine**: Dynamic pricing with bulk updates and scheduled changes
- **Reconciliation System**: Stock verification with approval workflow
- **Audit Trail**: Complete activity logging for compliance and security
- **Reporting Engine**: Comprehensive reports with PDF/Excel exports
- **Notification Center**: Real-time notifications for important events
- **Multi-Branch Support**: Unified platform with branch-level data isolation

## 🛠️ Tech Stack

### Frontend
- **Next.js 15**: React framework with App Router
- **TypeScript**: Type-safe development
- **Tailwind CSS**: Utility-first CSS framework
- **ShadCN/UI**: High-quality UI components
- **TanStack Query**: Data fetching and caching
- **TanStack Table**: Powerful data tables
- **React Hook Form**: Form management
- **Zod**: Schema validation
- **Zustand**: State management
- **Framer Motion**: Animations
- **Recharts**: Data visualization

### Backend
- **Next.js Server Actions**: Server-side logic
- **Route Handlers**: API endpoints
- **Prisma ORM**: Database ORM
- **PostgreSQL**: Primary database
- **Redis**: Caching and background jobs
- **BullMQ**: Background job processing

### Authentication
- **Better Auth**: Modern authentication solution
- **bcryptjs**: Password hashing

### Utilities
- **SheetJS (xlsx)**: Excel processing
- **jsPDF**: PDF generation
- **date-fns**: Date manipulation
- **Lucide React**: Icon library

## 📋 Prerequisites

- Node.js 18+ 
- PostgreSQL 14+
- Redis 6+ (optional, for caching)
- npm or yarn

## 🚀 Getting Started

### 1. Clone the repository
```bash
git clone https://github.com/belloibrahv/abutwins-invent.git
cd abutwins-invent
```

### 2. Install dependencies
```bash
npm install
```

### 3. Set up environment variables
```bash
cp .env.example .env
```

Edit `.env` with your database credentials and other settings.

### 4. Set up the database
```bash
# Generate Prisma client
npm run db:generate

# Push schema to database (for development)
npm run db:push

# Or run migrations (for production)
npm run db:migrate

# Seed the database with sample users
npm run db:seed
```

### 5. Run the development server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 🔐 Authentication

The system comes with pre-configured user accounts for testing:

### Default Users (Password shown in username)
- **Super Admin**: admin@abutwins.com / admin123
- **CEO**: ceo@abutwins.com / ceo123
- **Auditor**: auditor@abutwins.com / auditor123
- **Accountant**: accountant@abutwins.com / accountant123
- **Branch Manager**: manager@abutwins.com / manager123
- **Vault Manager**: vault@abutwins.com / vault123
- **Cashier**: cashier@abutwins.com / cashier123
- **Sales Executive**: sales@abutwins.com / sales123
- **Engineer**: engineer@abutwins.com / engineer123

**Important**: Change these passwords in production!

## 📁 Project Structure

```
abutwins-invent/
├── prisma/
│   └── schema.prisma          # Database schema
├── src/
│   ├── app/                   # Next.js App Router
│   │   ├── layout.tsx         # Root layout
│   │   ├── page.tsx           # Home page
│   │   └── globals.css        # Global styles
│   ├── components/            # React components
│   ├── lib/                   # Utility functions
│   │   └── utils.ts           # Common utilities
│   └── types/                 # TypeScript types
├── public/                    # Static assets
└── package.json               # Dependencies
```

## 👥 User Roles

1. **Super Admin**: Full system access
2. **CEO**: Branch oversight and approvals
3. **Auditor**: Audits and reconciliation
4. **Accountant**: Financial management
5. **Branch Manager**: Branch operations
6. **Vault Manager**: Stock and IMEI management
7. **Cashier**: Sales and payments
8. **Sales Executive**: Sales operations
9. **Engineer**: Repairs and diagnostics

## 🔒 Security Features

- Role-Based Access Control (RBAC)
- Multi-Factor Authentication (MFA)
- Session management
- IP and device logging
- Audit trail for all actions
- Rate limiting
- Data encryption
- Input validation

## 📊 Key Features by Module

### IMEI Intelligence
- Dual IMEI tracking (IMEI1, IMEI2)
- Serial number tracking
- Complete lifecycle tracking
- Search by IMEI, invoice, customer, phone number
- Real-time status updates

### Sales System
- Retail and wholesale sales
- Multiple payment methods (Cash, Transfer, POS, Credit, Split)
- Invoice generation
- Receipt printing
- Warranty slips
- Customer debt tracking

### Returns Management
- Multiple return reasons (Faulty, Warranty, Damaged, etc.)
- Return outcomes (Replacement, Repair, Refund, Credit Note)
- Fault classification (Good, Faulty, Repair, Scrap)
- Approval workflow

### Swap Management
- Device valuation
- Trade-in approval
- Difference calculation
- Profit tracking
- Complete audit trail

### Pricing Engine
- Single and bulk price updates
- Percentage-based updates
- Category-based updates
- Scheduled price changes
- Price history tracking
- Minimum price enforcement

### Reconciliation
- Stock count initiation
- Variance analysis
- Adjustment requests
- Approval workflow
- Complete audit trail

## 🧪 Testing

```bash
npm test
```

## 🏗️ Building for Production

```bash
npm run build
npm start
```

## 📝 License

This project is licensed under the ISC License.

## 🤝 Support

For support, email support@abutwins.com or open an issue in the repository.

## 📄 Documentation

For detailed documentation, see the [book.md](./book.md) and [book-2.md](./book-2.md) files for complete system specifications.