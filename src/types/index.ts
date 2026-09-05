// Abu Twins Enterprise ERP - TypeScript Type Definitions
// This file contains type definitions that complement the Prisma schema

// Local UserRole enum for development (will be replaced with Prisma enum)
export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  CEO = 'CEO',
  AUDITOR = 'AUDITOR',
  ACCOUNTANT = 'ACCOUNTANT',
  BRANCH_MANAGER = 'BRANCH_MANAGER',
  VAULT_MANAGER = 'VAULT_MANAGER',
  CASHIER = 'CASHIER',
  SALES_EXECUTIVE = 'SALES_EXECUTIVE',
  ENGINEER = 'ENGINEER',
}

// ============================================
// NEXTAUTH TYPES
// ============================================

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      email: string
      name?: string | null
      role: UserRole
      branchId: string | null
    }
  }

  interface User {
    id: string
    email: string
    name?: string | null
    role: UserRole
    branchId: string | null
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string
    role: UserRole
    branchId: string | null
  }
}

// ============================================
// ENUMS
// ============================================

export enum ProductCondition {
  BRAND_NEW = 'BRAND_NEW',
  OPEN_BOX = 'OPEN_BOX',
  UK_USED = 'UK_USED',
  REFURBISHED = 'REFURBISHED',
  SWAP_DEVICE = 'SWAP_DEVICE',
  FAULTY = 'FAULTY',
  REPAIR_DEVICE = 'REPAIR_DEVICE',
}

export enum IMEIStatus {
  IN_STOCK = 'IN_STOCK',
  TRANSFERRED = 'TRANSFERRED',
  SOLD = 'SOLD',
  RETURNED = 'RETURNED',
  REPAIRED = 'REPAIRED',
  SWAPPED = 'SWAPPED',
  DISPOSED = 'DISPOSED',
  FAULTY = 'FAULTY',
}

export enum PurchaseStatus {
  PENDING = 'PENDING',
  ORDERED = 'ORDERED',
  PARTIAL_RECEIVED = 'PARTIAL_RECEIVED',
  RECEIVED = 'RECEIVED',
  CANCELLED = 'CANCELLED',
}

export enum PaymentMethod {
  CASH = 'CASH',
  TRANSFER = 'TRANSFER',
  POS = 'POS',
  CREDIT = 'CREDIT',
  SPLIT_PAYMENT = 'SPLIT_PAYMENT',
}

export enum SaleStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
}

export enum ReturnReason {
  FAULTY = 'FAULTY',
  WARRANTY = 'WARRANTY',
  CUSTOMER_DISSATISFACTION = 'CUSTOMER_DISSATISFACTION',
  DAMAGED = 'DAMAGED',
  SUPPLIER_RETURN = 'SUPPLIER_RETURN',
  WRONG_PRODUCT = 'WRONG_PRODUCT',
}

export enum ReturnOutcome {
  REPLACEMENT = 'REPLACEMENT',
  REPAIR = 'REPAIR',
  REFUND = 'REFUND',
  CREDIT_NOTE = 'CREDIT_NOTE',
}

export enum ReturnStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  COMPLETED = 'COMPLETED',
}

export enum SwapStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum RepairStatus {
  PENDING = 'PENDING',
  DIAGNOSING = 'DIAGNOSING',
  REPAIRING = 'REPAIRING',
  WAITING_PARTS = 'WAITING_PARTS',
  COMPLETED = 'COMPLETED',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}

export enum TransferStatus {
  PENDING = 'PENDING',
  IN_TRANSIT = 'IN_TRANSIT',
  RECEIVED = 'RECEIVED',
  CANCELLED = 'CANCELLED',
}

export enum ExpenseCategory {
  TRANSPORT = 'TRANSPORT',
  FUEL = 'FUEL',
  RENT = 'RENT',
  UTILITIES = 'UTILITIES',
  REPAIRS = 'REPAIRS',
  SALARY = 'SALARY',
  MISCELLANEOUS = 'MISCELLANEOUS',
  MARKETING = 'MARKETING',
}

export enum ApprovalType {
  PRICE_DISCOUNT = 'PRICE_DISCOUNT',
  REFUND = 'REFUND',
  STOCK_ADJUSTMENT = 'STOCK_ADJUSTMENT',
  RECONCILIATION = 'RECONCILIATION',
  EXPENSE = 'EXPENSE',
  TRANSFER = 'TRANSFER',
  SWAP = 'SWAP',
  RETURN = 'RETURN',
}

export enum ApprovalStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export enum ReconciliationStatus {
  IN_PROGRESS = 'IN_PROGRESS',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
  EXPORT = 'EXPORT',
  IMPORT = 'IMPORT',
}

export enum NotificationType {
  LOW_STOCK = 'LOW_STOCK',
  PRICE_UPDATE = 'PRICE_UPDATE',
  APPROVAL_REQUEST = 'APPROVAL_REQUEST',
  DUE_PAYMENT = 'DUE_PAYMENT',
  TRANSFER = 'TRANSFER',
  RETURN = 'RETURN',
  SYSTEM = 'SYSTEM',
}

export enum NotificationStatus {
  UNREAD = 'UNREAD',
  READ = 'READ',
  ARCHIVED = 'ARCHIVED',
}

export enum LedgerEntryType {
  SALE = 'SALE',
  PAYMENT = 'PAYMENT',
  REFUND = 'REFUND',
  ADJUSTMENT = 'ADJUSTMENT',
  DISCOUNT = 'DISCOUNT',
}

// ============================================
// COMMON INTERFACES
// ============================================

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export interface DashboardStats {
  totalSales: number
  totalExpense: number
  paymentSent: number
  paymentReceived: number
  totalRevenue: number
  totalProfit: number
  totalReturns: number
  totalSwaps: number
  stockValue: number
  outstandingDebts: number
}

export interface ChartData {
  name: string
  value: number
  [key: string]: any
}

export interface SalesChartData {
  month: string
  sales: number
  purchases: number
}

// ============================================
// FORM INTERFACES
// ============================================

export interface LoginForm {
  email: string
  password: string
  rememberMe?: boolean
}

export interface UserForm {
  email: string
  name: string
  password?: string
  role: UserRole
  branchId?: string
}

export interface BranchForm {
  name: string
  code: string
  address: string
  phone?: string
  email?: string
}

export interface ProductForm {
  sku: string
  name: string
  description?: string
  brandId: string
  categoryId: string
  condition: ProductCondition
  color?: string
  storage?: string
  ram?: string
  costPrice: number
  minimumPrice: number
  sellingPrice: number
  marketPrice?: number
  branchId: string
}

export interface IMEIForm {
  imei1: string
  imei2?: string
  serialNumber?: string
  productId: string
  supplierId?: string
  branchId: string
  notes?: string
}

export interface CustomerForm {
  name: string
  phone: string
  email?: string
  address?: string
  branchId: string
  notes?: string
  creditLimit?: number
}

export interface SupplierForm {
  name: string
  contactPerson?: string
  email?: string
  phone: string
  address?: string
}

export interface SaleForm {
  customerId?: string
  saleType: 'RETAIL' | 'WHOLESALE'
  items: SaleItemForm[]
  paymentMethod: PaymentMethod
  discount?: number
  notes?: string
  branchId: string
}

export interface SaleItemForm {
  productId: string
  imeiId?: string
  quantity: number
  unitPrice: number
  discount?: number
}

export interface ReturnForm {
  customerId: string
  saleId?: string
  imeiId?: string
  reason: ReturnReason
  outcome: ReturnOutcome
  notes?: string
  branchId: string
}

export interface SwapForm {
  customerId: string
  oldDeviceImei: string
  oldDeviceCondition: ProductCondition
  tradeValue: number
  newProductId: string
  newProductPrice: number
  newDeviceImei?: string
  notes?: string
  branchId: string
}

export interface ExpenseForm {
  category: ExpenseCategory
  amount: number
  description: string
  date: Date
  receiptUrl?: string
  notes?: string
  branchId: string
}

export interface TransferForm {
  fromBranchId: string
  toBranchId: string
  items: TransferItemForm[]
  notes?: string
}

export interface TransferItemForm {
  productId: string
  quantity: number
}

// ============================================
// FILTER & SEARCH INTERFACES
// ============================================

export interface SearchFilters {
  query?: string
  branchId?: string
  category?: string
  status?: string
  dateFrom?: Date
  dateTo?: Date
  page?: number
  limit?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export interface ProductFilters extends SearchFilters {
  brandId?: string
  condition?: ProductCondition
  minPrice?: number
  maxPrice?: number
  inStock?: boolean
}

export interface SalesFilters extends SearchFilters {
  customerId?: string
  userId?: string
  saleType?: 'RETAIL' | 'WHOLESALE'
  paymentMethod?: PaymentMethod
  status?: SaleStatus
  minAmount?: number
  maxAmount?: number
}

export interface InventoryFilters extends SearchFilters {
  lowStock?: boolean
  outOfStock?: boolean
  category?: string
  brand?: string
}

// ============================================
// REPORTING INTERFACES
// ============================================

export interface ReportConfig {
  reportType: string
  dateRange: {
    startDate: Date
    endDate: Date
  }
  branchId?: string
  format: 'PDF' | 'EXCEL' | 'CSV'
  includeDetails?: boolean
}

export interface SalesReport {
  totalSales: number
  totalRevenue: number
  totalProfit: number
  averageOrderValue: number
  salesByPaymentMethod: Record<PaymentMethod, number>
  salesByCategory: Record<string, number>
  topSellingProducts: Array<{
    productId: string
    productName: string
    quantity: number
    revenue: number
  }>
}

export interface InventoryReport {
  totalProducts: number
  totalStockValue: number
  lowStockItems: number
  outOfStockItems: number
  stockByCategory: Record<string, number>
  stockByCondition: Record<ProductCondition, number>
  stockByBranch: Record<string, number>
}

export interface FinancialReport {
  totalRevenue: number
  totalExpenses: number
  netProfit: number
  profitMargin: number
  expensesByCategory: Record<ExpenseCategory, number>
  cashFlow: Array<{
    date: string
    inflow: number
    outflow: number
    balance: number
  }>
}

// ============================================
// APPROVAL INTERFACES
// ============================================

export interface ApprovalRequest {
  type: ApprovalType
  entityId: string
  entityType: string
  reason?: string
  notes?: string
}

export interface ApprovalResponse {
  approved: boolean
  reason?: string
  notes?: string
}

// ============================================
// NOTIFICATION INTERFACES
// ============================================

export interface NotificationPreferences {
  email: boolean
  inApp: boolean
  lowStock: boolean
  priceUpdates: boolean
  approvals: boolean
  duePayments: boolean
  transfers: boolean
  returns: boolean
}

// ============================================
// SETTINGS INTERFACES
// ============================================

export interface SystemSettings {
  companyName: string
  companyLogo?: string
  defaultCurrency: string
  taxRate: number
  lowStockThreshold: number
  enableEmailNotifications: boolean
  enableSmsNotifications: boolean
  businessHours: {
    start: string
    end: string
  }
  supportEmail: string
  supportPhone: string
}

// ============================================
// UTILITY TYPES
// ============================================

export type WithRequired<T, K extends keyof T> = T & { [P in K]-?: T[P] }
export type WithOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P]
}