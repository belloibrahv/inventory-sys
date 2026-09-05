What follows is the project brief I would give to an AI engineering team before writing a single line of code.

This is not an inventory app.

This is a **Multi-Branch Retail ERP for Phone and Gadget Businesses**, designed specifically around the operational realities of Abu Twins. The software must eliminate manual calculations, IMEI tracking problems, reporting inaccuracies, stock leakages, pricing inconsistencies, weak approvals, poor reconciliation, and audit gaps currently experienced by the business.

The architecture should be built around a single source of truth, strict inventory governance, complete auditability, multi-branch synchronization, serial/IMEI traceability, and finance-integrated operations. These are considered enterprise inventory best practices and ERP requirements. ([IF4IT][1])

# Product Vision

Product Name:

```text
Abu Twins Enterprise ERP
```

Mission:

```text
Provide complete visibility and control over
inventory,
IMEI lifecycle,
sales,
returns,
swaps,
repairs,
finance,
approvals,
audits,
and branch operations
from one unified platform.
```

Target Users:

* Abu Twins CEO
* Auditors
* Accountants
* Branch Managers
* Vault Managers
* Sales Staff
* Cashiers
* Engineers
* Procurement Staff
* Future Franchise Branches

---

# Recommended Technology Stack

## Frontend

```text
Next.js 15
TypeScript
Tailwind CSS
ShadCN/UI
TanStack Table
TanStack Query
Zustand
React Hook Form
Zod
Framer Motion
```

Reason:

* Enterprise-grade UI
* Fast development
* Massive ecosystem
* Excellent tables
* Excellent forms
* Modern UX

---

## Backend

```text
Next.js Fullstack

Server Actions
Route Handlers

Prisma ORM
PostgreSQL
Redis

BullMQ
```

Reason:

* One codebase
* Easy deployment
* Strong typing
* Scalable

---

## Database

```text
PostgreSQL
```

Reason:

* Financial integrity
* ACID compliance
* Reporting
* Audit support
* Multi-branch support

---

## Hosting

Preferred:

```text
Railway
```

Alternative:

```text
Hostinger VPS
```

Railway provides easier deployment, backups, PostgreSQL management, scaling, and background jobs.

---

# Architecture Principles

The system must follow:

```text
Domain Driven Design

Clean Architecture

CQRS where necessary

Event Driven Actions

Repository Pattern

Service Layer Pattern

Audit First Architecture

API First Architecture

Modular Monolith
```

NOT microservices initially.

---

# Core System Modules

```text
Authentication

Role Management

Permissions

Branch Management

Inventory

IMEI Tracking

Products

Categories

Suppliers

Purchases

Sales

Wholesale

Returns

Repairs

Swap Deals

Customers

Finance

Ledger

Expenses

Pricing Engine

Approvals

Notifications

Reports

Reconciliation

Audit Trail

Settings
```

---

# Branch Management

The business operates across multiple branches.

Admin must be able to:

```text
Create Branch

Update Branch

Deactivate Branch

Assign Managers

Transfer Stock

View Reports
```

Every branch maintains:

```text
Inventory

Sales

Expenses

Cash

Customers

Repairs

Transfers
```

independently.

No branch data should accidentally merge.

---

# User Roles

## Super Admin

TechVaults

Can:

```text
Manage System

Manage Branches

Manage Roles

Manage Settings

Access Everything
```

---

## CEO

Can:

```text
View All Branches

Approve Requests

Approve Discounts

Approve Reconciliation

View Reports
```

---

## Auditor

Can:

```text
View Everything

Run Audits

Stock Verification

Generate Reports

Approve Adjustments
```

---

## Accountant

Can:

```text
Manage Ledger

Expenses

Payments

Reports

Financial Reconciliation
```

---

## Branch Manager

Can:

```text
Manage Branch

Manage Staff

View Reports

Approve Branch Actions
```

---

## Vault Manager

Can:

```text
Receive Stock

Transfer Stock

Manage IMEI
```

---

## Cashier

Can:

```text
Sales

Returns

Payments
```

---

## Sales Executive

Can:

```text
Sales Only
```

---

## Engineer

Can:

```text
Repairs

Diagnostics

Warranty Processing
```

---

# Product Management

Every product must support:

```text
Brand

Model

Category

Condition

Color

Storage

RAM

Cost Price

Minimum Price

Selling Price

Market Price

Supplier
```

Conditions:

```text
Brand New

Open Box

UK Used

Refurbished

Swap Device

Faulty

Repair Device
```

---

# IMEI Intelligence Engine

This is the most important feature.

Every device should support:

```text
IMEI 1

IMEI 2

Serial Number
```

Every IMEI becomes a unique asset.

The system must know:

```text
Where it came from

Which supplier

Which branch

Who sold it

Which customer bought it

Whether returned

Whether repaired

Whether swapped

Current status
```

---

# IMEI Scanner

Support:

```text
Camera Scan

Barcode Scan

QR Scan

OCR Scan
```

Supported Devices:

```text
Android

iPhone

Tablet

Desktop Webcam
```

---

# Stock Intake

Support:

```text
Manual Entry

Excel Upload

CSV Upload

Bulk Paste

Supplier Import
```

Validation:

```text
Duplicate IMEI

Duplicate Products

Missing Cost Price

Invalid Data
```

---

# Bulk Product Upload

Users should upload:

```text
Excel

CSV

Google Sheet Export
```

System automatically:

```text
Creates Products

Creates Variants

Creates IMEI Records

Creates Stock
```

---

# Purchase Management

Workflow:

```text
Expected Shipment

↓

Received Shipment

↓

Verification

↓

IMEI Capture

↓

Stock Entry

↓

Approval

↓

Inventory Available
```

Supports:

```text
Partial Delivery

Back Order

Supplier Credit
```

---

# Sales System

Supports:

```text
Cash

Transfer

POS

Split Payment

Credit
```

Generate:

```text
Invoice

Receipt

Warranty Slip
```

---

# Wholesale Sales

Special support for:

```text
Bulk Dealers

Frequent Returns

Credit Accounts

Account Limits
```

---

# Customer Management

Track:

```text
Customer Name

Phone

Address

Purchase History

Returns

Warranty

Outstanding Balance
```

---

# Customer Ledger

Replace backdating.

Every payment becomes:

```text
Ledger Entry
```

Never edit old transactions.

This directly solves one of Abu Twins' biggest problems.

---

# Return Management

Return Types:

```text
Faulty

Wrong Product

Customer Dissatisfaction

Warranty Claim

Supplier Return
```

Return Outcome:

```text
Replacement

Repair

Refund

Credit Note
```

---

# Fault Classification

Returned stock must be classified as:

```text
Good Stock

Faulty Stock

Repair Stock

Scrap Stock
```

Current system cannot do this.

New system must.

---

# Swap Management

This is unique to Abu Twins.

Workflow:

```text
Customer Device

↓

Valuation

↓

Approval

↓

New Device

↓

Difference Calculation

↓

Payment

↓

Invoice
```

Track:

```text
Old IMEI

New IMEI

Trade Value

Profit

Balance
```

---

# Pricing Engine

Supports:

```text
Single Price Update

Bulk Price Update

Percentage Update

Category Update

Brand Update

Scheduled Price Update
```

Example:

```text
Increase all Samsung phones by ₦10,000
```

Example:

```text
Decrease all UK Used iPhones by 5%
```

---

# Pricing Governance

Each product has:

```text
Cost Price

Minimum Price

Selling Price

Market Price
```

Rules:

```text
Cannot sell below minimum price

Requires approval
```

---

# Approval Engine

Supports:

```text
Price Discounts

Refunds

Stock Adjustments

Reconciliation

Expense Approval
```

---

# Finance Module

Track:

```text
Cash

Bank

Income

Expenses

Transfers
```

---

# Expense Management

Categories:

```text
Transport

Fuel

Rent

Utilities

Repairs

Salary

Miscellaneous
```

---

# Reconciliation Module

One of the most important modules.

Workflow:

```text
Start Stock Count

↓

Physical Count

↓

Difference Analysis

↓

Adjustment Request

↓

Approval

↓

Final Reconciliation
```

Supports:

```text
Monthly

Quarterly

Yearly
```

---

# Audit Trail

Every action must be logged.

Example:

```text
User:
John

Action:
Changed Price

Old:
₦450,000

New:
₦470,000

Date:
2026-09-01

Time:
10:45 AM
```

No deletion.

Ever.

---

# Reporting Engine

Exports:

```text
Excel

CSV

PDF
```

Reports:

```text
Sales

Inventory

Returns

Swaps

Repairs

Customers

Suppliers

Expenses

Profit

Branch Performance
```

---

# Auditor Reports

Must include:

```text
Company Logo

Company Header

Date Range

Prepared By

Approved By

Branch

Signatures
```

Printable.

---

# Dashboard

CEO Dashboard

```text
Revenue

Profit

Returns

Swaps

Outstanding Debts

Stock Value

Branch Ranking
```

Auditor Dashboard

```text
Variance

Returns

Pending Approvals

Exceptions
```

Accountant Dashboard

```text
Cash Flow

Expenses

Debtors

Creditors
```

---

# Notifications

```text
Low Stock

Price Changes

Approval Requests

Returns

Transfers

Due Payments
```

Delivery:

```text
In-App

Email

WhatsApp (Phase 2)
```

---

# Global Search

Search everything:

```text
IMEI

Customer

Invoice

Phone Number

Product

Supplier

Branch
```

---

# Offline Capability

PWA support.

When internet returns:

```text
Auto Sync
```

---

# Security Requirements

Mandatory:

```text
RBAC

MFA

Device Tracking

IP Logging

Session Monitoring

Encryption

Rate Limiting

Audit Logs
```

---

# Performance Requirements

```text
500,000+ IMEI Records

100,000+ Products

100+ Concurrent Users

Sub-2 Second Response Time
```

---

# UI/UX Standards

Inspiration:

* Linear
* Stripe Dashboard
* Odoo
* ERPNext
* Shopify Admin
* Square POS

Requirements:

```text
Dark Mode

Light Mode

Responsive Design

Keyboard Shortcuts

Command Palette

Advanced Filters

Saved Views

Column Management
```

---

# Future AI Features

Phase 2:

```text
Demand Forecasting

Restock Prediction

Price Recommendations

Fraud Detection

Sales Trend Analysis

Branch Performance Intelligence
```

This specification is comprehensive enough to serve as the master requirements document for an AI coding agent, solution architect, UI/UX designer, backend engineer, frontend engineer, QA engineer, and project manager. It directly addresses every operational problem identified during the Abu Twins discovery exercise while remaining scalable enough to become a commercial Retail ERP platform in the future. ([ERP Research][2])

[1]: https://if4it.org/best-practices/enterprise-inventory-management/?utm_source=chatgpt.com "Enterprise Inventory Management Best Practices | The International Foundation for Information Technology (IF4IT)"
[2]: https://www.erpresearch.com/en-us/erp-requirements?utm_source=chatgpt.com "ERP Requirements Checklist & Guide (2026) | ERP Research"
