# Google Ads API Integration - Design Documentation

## Company: Thermopac Process Engineering LLP
## Tool Name: THERMOPAC Quality Management System (QMS)
## Date: March 2026

---

## 1. Overview

The THERMOPAC QMS is an internal enterprise management system used by Thermopac Process Engineering LLP. The Google Ads API integration module provides real-time campaign performance monitoring and reporting within our internal dashboard. This is an internal tool used exclusively by our company to manage and monitor our own Google Ads advertising campaigns.

## 2. Purpose

The tool connects to the Google Ads API to:
- Sync campaign, ad group, and keyword data from our Google Ads account
- Display performance metrics (impressions, clicks, spend, conversions) on an internal dashboard
- Generate reports for internal business decision-making
- Monitor keyword performance and search term reports
- Identify wasteful ad spend through search term analysis

## 3. Users

This tool is used **only by internal employees** of Thermopac Process Engineering LLP. There are no external users. Access is restricted to authorized staff through role-based authentication.

## 4. Architecture

### 4.1 Technology Stack
- **Backend**: Node.js with Express.js (TypeScript)
- **Frontend**: React with TypeScript
- **Database**: PostgreSQL
- **Authentication**: Session-based authentication with role-based access control

### 4.2 Google Ads API Usage
- **API Version**: v19
- **Authentication**: OAuth 2.0 with refresh tokens
- **Data Flow**: Read-only — the tool only reads data from Google Ads, it does not create or modify campaigns through the API
- **Endpoints Used**:
  - `customers/{customerId}/googleAds:search` — GAQL queries for campaign, ad group, keyword, and metrics data
  - `customers:listAccessibleCustomers` — Account discovery

### 4.3 Data Sync Process
1. User initiates sync from the dashboard (or scheduled automatic sync)
2. Backend authenticates using stored OAuth 2.0 tokens
3. GAQL queries fetch campaign structure and performance metrics
4. Data is stored in local PostgreSQL database for dashboard display
5. Frontend displays metrics in charts, tables, and KPI cards

## 5. Google Ads API Features Used

| Feature | Usage |
|---------|-------|
| Campaign data retrieval | Read campaign names, status, budgets |
| Ad group data retrieval | Read ad group structure and settings |
| Keyword data retrieval | Read keywords, match types, quality scores |
| Metrics reporting | Read impressions, clicks, cost, conversions |
| Search term reports | Read search terms triggering ads |
| Customer account info | Read account name and ID |

## 6. Campaign Types Supported

- Search campaigns
- Performance Max campaigns
- Display campaigns

## 7. API Interaction Model

- **Read-only access**: The tool does NOT create, modify, or delete any Google Ads entities
- **Sync frequency**: Structure data every 6 hours, metrics every 1 hour
- **Rate limiting**: Built-in retry logic with exponential backoff
- **Error handling**: Automatic token refresh on 401 errors, rate limit handling on 429 errors

## 8. Data Storage

All synced data is stored in our PostgreSQL database in the following tables:
- `gads_campaigns` — Campaign data
- `gads_ad_groups` — Ad group data
- `gads_keywords` — Keyword data
- `gads_daily_metrics` — Daily performance metrics
- `gads_search_terms` — Search term report data
- `gads_sync_jobs` — Sync job tracking
- `google_ads_tokens` — OAuth tokens (encrypted)

## 9. Security Measures

- OAuth 2.0 tokens stored securely in the database
- Session-based authentication required for all API endpoints
- Role-based access control limits who can view Google Ads data
- Developer token and credentials stored as environment secrets
- No Google Ads data is exposed to external parties

## 10. Compliance

- The tool complies with Google Ads API Terms of Service
- No customer data is shared with third parties
- Data is used solely for internal business analytics
- The tool does not use App Conversion Tracking or Remarketing API
