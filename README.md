# Supply Chain Insight

SCIIP — Supply Chain & Inventory Intelligence Platform

Build a production-quality enterprise dashboard for SCIIP (Supply Chain & Inventory Intelligence Platform).

SCIIP is an enterprise knowledge and intelligence platform for semiconductor spare-parts operations. It sits on top of SAP and converts SAP Sales Register data into structured business knowledge, operational intelligence, and eventually explainable AI recommendations.

IMPORTANT

This is primarily a frontend/dashboard build at this stage.

Do NOT invent forecasting algorithms, AI logic, transaction reconstruction logic, or business rules.

The Python backend will be developed separately and integrated later using Codex.

The frontend must therefore be designed with clean backend/API integration points so Python modules can be plugged in without redesigning the UI.

1. PRODUCT VISION

SCIIP should eventually provide:

Customer Intelligence

Demand Intelligence

Forecast Intelligence

Inventory Intelligence

Sales Intelligence

Management Decision Support

AI Copilot

The system follows this architecture:

SAP Sales Register
↓
Data Foundation
↓
Transaction State Engine
↓
Knowledge Engine
↓
Intelligence Engine
↓
AI Copilot

SAP remains the source of truth.

SCIIP does NOT replace SAP.

SCIIP interprets SAP data and converts it into business knowledge.

All recommendations must eventually be explainable using underlying business data.

2. CURRENT BACKEND STATUS

A Python pipeline already exists and will be extended separately.

Current Python functionality includes:

SAP Sales Register ingestion

Data cleaning

Project filtering

Transaction reconstruction

Demand-line reconstruction

Delivery matching

Consignment handling

Demand pattern classification

Customer profiles

Part yearly trends

Customer yearly trends

SQLite storage

Excel report generation

Current Python concepts include:

Sales Order

Demand Line

Delivery Event

Invoice Event

Fulfillment State

Customer

Part

Project

The frontend must be ready to consume these entities from a future Python API.

3. TECHNOLOGY

Use a modern production-quality web stack appropriate for Lovable.

Prefer:

React

TypeScript

Tailwind CSS

shadcn/ui

Responsive layout

Reusable components

Proper routing

API/service abstraction

Do NOT put business logic directly inside UI components.

Create a clean service/API layer.

Example architecture:

src/
components/
pages/
layouts/
services/
api/
types/
hooks/
mock/
utils/

The Python backend should eventually be able to replace mock services without requiring major frontend changes.

4. BACKEND INTEGRATION CONTRACT

Create a dedicated API abstraction layer.

For example:

src/services/api/

customers.ts
parts.ts
demand.ts
orders.ts
deliveries.ts
inventory.ts
forecasts.ts
dashboard.ts
copilot.ts


Do not hardcode backend URLs throughout the application.

Use a single configurable API base URL.

Example concept:

VITE_API_BASE_URL

The application should be able to switch between:

Development mock data

and

Python/FastAPI backend

through configuration.

5. TYPES

Create TypeScript interfaces/types for the major SCIIP entities.

At minimum:

Customer

Part

Project

SalesOrder

DemandLine

DeliveryEvent

InvoiceEvent

FulfillmentState

DemandPattern

Forecast

InventoryPosition

DashboardMetric

AIInsight

Example conceptual type:

SalesOrder:

soNo

customer

customerPo

soDate

project

status

totalQuantity

totalValue

DemandLine:

lineId

soNo

customer

partCode

partDescription

project

originalQty

shippedQty

openQty

status

numShipments

firstShipDate

lastShipDate

committedDeliveryDate

customerRequestedDate

totalInvoicedQty

totalInvoicedAmount

needsReview

These are examples.

Keep the types easy to modify when the Python backend is finalized.

6. APPLICATION LAYOUT

Create a professional enterprise application.

Use a persistent left sidebar and a top header.

Sidebar:

SCIIP logo/name

Dashboard

Transactions

Demand

Customers

Parts

Inventory

Forecast

Sales Intelligence

Management

AI Copilot

Settings

At the bottom:

Data Last Updated

SAP Data Status

User/Profile

7. MAIN DASHBOARD

Create a high-quality executive dashboard.

Title:

SCIIP Command Center

Subtitle:

Supply Chain & Inventory Intelligence Platform

Top KPI cards:

Total Demand

Open Demand

Fulfillment Rate

Active Customers

Active Parts

Open Sales Orders

Inventory Risk

Forecast Accuracy

Do not invent real values.

Use clearly marked mock/demo data.

Include:

Demand Trend

Line chart showing demand over time.

Open Demand

Breakdown by project/customer/part.

Fulfillment Status

Donut/bar visualization:

Open

Partially Fulfilled

Fulfilled

Needs Review

Top Customers

Table:

Customer

Demand

Orders

Open Demand

Fulfillment %

Trend

Top Parts

Table:

Part

Demand

Customers

Open Qty

Trend

Risk

Attention Required

Cards for:

High open demand

Delayed fulfillment

Unusual demand

Potential inventory risk

Orders needing review

Every insight should have a "Why?" or "View Details" interaction.

8. TRANSACTIONS PAGE

Create a complete transaction explorer.

Tabs:

Sales Orders

Demand Lines

Deliveries

Invoices

Allow:

Search

Filtering

Sorting

Pagination

Project filter

Customer filter

Part filter

Status filter

Date range

Demand Lines table should contain:

Line ID

SO

Customer

Part

Project

Original Qty

Shipped Qty

Open Qty

Status

Shipments

First Ship Date

Last Ship Date

Review

Clicking a row should open a detailed side panel/page.

9. DEMAND LINE DETAIL

Create a detailed transaction view.

Header:

Demand Line ID

SO Number

Customer

Part

Project

Status

Show:

Original Demand

Shipped

Open

Invoiced

Fulfillment %

Timeline:

Sales Order
↓
Delivery 1
↓
Delivery 2
↓
Delivery 3
↓
Invoice

Display shipment events individually.

Show:

DO number

Date

Quantity

Invoice

Invoice quantity

Invoice amount

Also show:

Committed delivery date

Customer requested date

Actual first shipment

Actual completion

Lead time

Include an "Explain This State" section.

For now this can use placeholder/mock explanation text.

Later Python will provide the explanation.

10. CUSTOMERS PAGE

Create Customer 360.

Customer list with:

Customer

Projects

Orders

Demand

Open Demand

Last Order

Fulfillment

Trend

Click customer → Customer 360.

Customer 360 sections:

Overview

Demand Trend

Orders

Parts Purchased

Open Demand

Fulfillment

Projects

Buying Behaviour

Risk / Attention

Future Recommendations

Do not generate fake AI recommendations.

Use placeholder states where backend intelligence is not connected.

11. PARTS PAGE

Create Part 360.

Part table:

Part Number

Description

Project

Customers

Demand

Open Demand

Orders

Trend

Risk

Clicking a part opens Part 360.

Part 360:

Overview

Historical Demand

Customers

Orders

Demand Pattern

Open Demand

Delivery Performance

Forecast

Inventory

Risk

The Forecast and Inventory sections should clearly indicate:

"Backend intelligence not connected"

until the Python services are integrated.

12. DEMAND INTELLIGENCE

Create a Demand Intelligence page.

Sections:

Demand Overview

Demand Trend

Demand by Project

Demand by Customer

Demand by Part

Demand Patterns

Demand Anomalies

Open Demand

Historical Demand

Pattern classifications should support future values such as:

Increasing

Decreasing

Stable

Intermittent

Volatile

New

Dormant

Do not hardcode the classification logic in the frontend.

The Python backend will provide classifications.

13. FORECAST PAGE

Create the UI but do NOT implement forecasting logic.

Include:

Forecast Overview

Forecast by Part

Forecast by Customer

Forecast Horizon

Actual vs Forecast chart

Forecast Accuracy

Confidence

Forecast Explanation

Model Information

Provide empty/loading states such as:

"Forecast engine not connected."

The page should already have the API integration structure required for a future Python forecasting service.

14. INVENTORY PAGE

Create the Inventory Intelligence interface.

Include:

Inventory Overview

Current Stock

Available Stock

Reserved Stock

Open Demand

Coverage

Safety Stock

Lead Time

Potential Stockout

At Risk Parts

Suggested Actions

Again, do NOT calculate inventory recommendations in React.

All calculations will eventually come from Python.

15. SALES INTELLIGENCE

Create a Sales Intelligence page.

Include:

Customer Opportunities

Expected Reorders

Demand Growth

Dormant Customers

Growing Customers

Top Customers

Top Parts

Customer Buying Patterns

Potential Follow-ups

All recommendations should eventually come from backend services.

16. MANAGEMENT PAGE

Create an executive management view.

Include:

Business KPIs

Demand Growth

Revenue

Open Demand

Fulfillment

Inventory Exposure

Customer Growth

Part Growth

Major Risks

Major Opportunities

Project Performance

Trend comparison

Make this page visually polished and executive-friendly.

17. AI COPILOT

Create a dedicated AI Copilot interface.

Do not connect a real LLM yet.

Create the complete UI and API abstraction.

Example interface:

SCIIP COPILOT

Ask SCIIP anything about your business...

[ What should I discuss with Customer A? ]

Suggested Questions:

• Why did demand increase?
• Which customers need attention?
• Which parts are at risk?
• What orders are still open?
• Which customers are growing?
• Which parts should we stock?

Responses should eventually support:

Answer

Evidence

Reasoning

Underlying Data

Related Transactions

Confidence

The UI must emphasize:

"SCIIP explains why."

Do not create fake AI answers that appear to be real.

Use mock responses only when clearly marked as demo data.

18. GLOBAL SEARCH

Add a global search bar.

It should eventually search:

Customers

Parts

Sales Orders

Demand Lines

Projects

Delivery Orders

Invoices

The frontend should use an API service rather than local-only search.

19. DATA STATUS

Create a data status component.

Example:

SAP DATA

Status: Connected

Last Sync:

2026-08-25 14:30

Records:

124,521

Demand Lines:

18,245

This must be demo data initially.

Make the component ready to receive actual backend values.

20. IMPORT / DATA PIPELINE PAGE

Create an administration page for the future Python pipeline.

Title:

Data Pipeline

Show:

Last SAP Import

Import Status

Rows Imported

Rows Cleaned

Rows Excluded

Demand Lines Reconstructed

Open Lines

Closed Lines

Lines Needing Review

Last Processing Time

Add a UI placeholder for:

Upload SAP Sales Register

Run Pipeline

View Processing Log

Download Report

IMPORTANT:

The upload/run buttons should NOT pretend to execute Python yet.

Create the frontend action/service interface so Codex can later connect these buttons to the Python backend.

21. DESIGN LANGUAGE

SCIIP is an enterprise semiconductor supply-chain platform.

Design should feel:

Professional

Technical

Modern

Data-driven

Premium

Enterprise-grade

Clean

Trustworthy

Avoid:

Generic startup landing-page aesthetics

Excessive gradients

Cartoon-like graphics

Excessive rounded cards

Fake AI imagery

Unnecessary animations

Use:

Strong information hierarchy

Dense but readable tables

Clear status indicators

Professional charts

Subtle borders

Consistent spacing

Excellent empty/loading/error states

The dashboard should feel like a serious internal enterprise platform used every day by:

Sales

Supply Chain

Planning

Inventory

Management

22. STATUS COLORS

Use consistent semantic colors.

Success:

Completed / Fulfilled

Warning:

Open / Attention

Critical:

Risk / Stockout / Severe Delay

Neutral:

Information

Never rely only on color.

Use labels/icons as well.

23. MOCK DATA

Create a realistic mock-data layer.

The application must work completely without a backend.

But clearly label demo data where appropriate.

Create mock data for:

Customers

Parts

Projects

Sales Orders

Demand Lines

Deliveries

Invoices

Demand patterns

Dashboard metrics

The mock data should be internally consistent.

For example:

If:

Original Qty = 100

Shipped Qty = 60

Then:

Open Qty = 40

Do not generate contradictory mock data.

24. API PLACEHOLDERS

Create service functions such as:

getDashboardSummary()

getCustomers()

getCustomer(id)

getParts()

getPart(id)

getSalesOrders()

getDemandLines()

getDemandLine(id)

getDeliveries()

getInvoices()

getDemandAnalytics()

getForecast()

getInventory()

getSalesIntelligence()

askCopilot(question)

getPipelineStatus()

uploadSalesRegister(file)

runPipeline()

The initial implementation may return mock data.

Keep these functions isolated so Codex can later replace them with real API calls.

25. PYTHON BACKEND COMPATIBILITY

The future backend will likely be Python/FastAPI.

Design the frontend assuming REST APIs such as:

GET /api/dashboard

GET /api/customers

GET /api/customers/{id}

GET /api/parts

GET /api/parts/{id}

GET /api/orders

GET /api/demand-lines

GET /api/demand-lines/{id}

GET /api/deliveries

GET /api/invoices

GET /api/demand

GET /api/forecast

GET /api/inventory

GET /api/sales-intelligence

POST /api/copilot

GET /api/pipeline/status

POST /api/pipeline/upload

POST /api/pipeline/run

These are interface placeholders, not final backend contracts.

Keep the frontend flexible enough for Codex to modify them later.

26. ERROR / LOADING / EMPTY STATES

Every backend-dependent page must support:

Loading

Empty

Error

Success

No data

Backend unavailable

Example:

"SCIIP backend is currently unavailable."

Do not crash the application if the API is unavailable.

Fallback to mock/demo mode during development.

27. CODE ORGANIZATION

Keep components modular.

Do NOT create one giant React file.

Prefer:

components/
dashboard/
transactions/
customers/
parts/
demand/
forecast/
inventory/
copilot/
shared/

pages/

services/

types/

mock/

hooks/

layouts/

28. IMPORTANT FOR CODEX

Leave clear integration points and TODO comments where backend work will be added.

For example:

// TODO: Replace mockDashboardService with FastAPI endpoint

// TODO: Connect pipeline upload to Python backend

// TODO: Connect demand state explanation to Transaction State Engine

// TODO: Replace mock forecast response with Python forecast service

Do not put Python code inside the frontend.

The Python backend will live separately.

The frontend communicates with it through APIs.

29. FIRST VERSION PRIORITY

Do NOT spend time implementing advanced intelligence.

Build these first and make them excellent:

Application shell

Sidebar/navigation

Command Center dashboard

Transaction Explorer

Demand Line Detail

Customer 360

Part 360

Demand Intelligence

Data Pipeline page

API/service layer

Mock data

Loading/error states

AI Copilot UI

Forecast, Inventory and Sales Intelligence can initially be polished placeholders with proper backend integration interfaces.

30. MOST IMPORTANT RULE

SCIIP must be built around the concept of:

SAP Transaction Data
↓
Business Entities
↓
Business State
↓
Business Knowledge
↓
Intelligence
↓
Explainable Decisions

Do not turn SCIIP into a generic analytics dashboard.

The central entity currently being reconstructed by the Python Transaction State Engine is the Demand Line.

The frontend must make the relationship between:

Sales Order

Demand Line

Delivery

Invoice

Fulfillment State

Customer

Part

Project

very clear.

Build the application so that a user can start from a high-level dashboard and drill all the way down to the underlying transaction data supporting an insight.

The guiding principle is:

"Every insight should be traceable back to the SAP transactions that created it."

Build the frontend architecture now so that Codex can later connect the Python Transaction State Engine, Knowledge Engine, Intelligence Engine, and AI services without requiring a frontend rewrite.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/776e79aa-72de-4b1d-af97-9912d0feef44).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

### Run the Python API and local Ollama Copilot

The dashboard can use its mock data without the API. To enable the Python API and ask
the Copilot questions about the local SCIIP database:

1. Install [Ollama](https://ollama.com/download) on the same computer as the API, then
   download a tool-capable model:

   ```powershell
   ollama pull qwen2.5:7b
   ```

2. Copy `backend/.env.example` to `backend/.env`. The example selects Ollama by default:

   ```dotenv
   AI_PROVIDER=ollama
   OLLAMA_BASE_URL=http://localhost:11434/v1
   OLLAMA_MODEL=qwen2.5:7b
   ```

   Keep `localhost` when Ollama and the Python API run on the same computer. No cloud
   API key is needed for Ollama.

3. In a PowerShell terminal, install the Python dependencies and start the API:

   ```powershell
   cd backend
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   python -m pip install -r ..\requirements.txt
   uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
   ```

4. In another terminal, start the frontend as described above. Verify the API at
   `http://127.0.0.1:8000/docs`; the Copilot health endpoint is
   `http://127.0.0.1:8000/api/copilot/health`.

#### Using the app on another computer

Copy the project files, but do not copy the existing `.env` files or `.venv`. On the
new computer, install Python, Node.js, and Ollama; run `ollama pull qwen2.5:7b`; copy
`backend/.env.example` to `backend/.env`; then create a new Python virtual environment
and install the requirements using the commands above. Keep
`OLLAMA_BASE_URL=http://localhost:11434/v1` if that computer runs both Ollama and the API.
This ensures its own Ollama installation and model are used.

If Ollama runs on a different computer from the API, set `OLLAMA_BASE_URL` in the
API computer's `backend/.env` to `http://<ollama-computer-LAN-IP>:11434/v1`. Ollama must
be configured to listen on the LAN and its port allowed through that computer's firewall.
Only do this on a trusted private network: Ollama's local API does not provide
authentication by default, so do not expose port 11434 to the public internet.
