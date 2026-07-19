# Graph Report - .  (2026-07-19)

## Corpus Check
- 290 files · ~318,853 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2911 nodes · 10480 edges · 150 communities (94 shown, 56 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 109 edges (avg confidence: 0.63)
- Token cost: 418,904 input · 0 output

## Community Hubs (Navigation)
- Backend Domain Types & Store Inputs
- Finance Domain Types (frontend)
- DataStore Finance/Ledger Methods
- Contacts & Custom Fields UI
- Shared Page/Component Utilities
- Route Pages (App Router)
- Backend Auth & Server Bootstrap
- UI Primitives (select/sheet/badge)
- CRM Service Layer
- DataStore Invoicing & Commissions
- App Shell & Sidebar Layout
- DataStore CRM/Project/Task CRUD
- Form & Dialog UI Primitives
- Purchasing Service & Warehouses UI
- Card/Button UI Primitives
- Follow-Ups Page (CRM)
- DataStore Inventory & Lots
- Invoice Document Renderer
- DataStore Vendor Bills & Reports
- Table UI & Inventory Lots Dialog
- HR Service (Attendance/Payroll/Leave)
- Campaign Pages (CRM)
- Finance Service Helpers
- WhatsApp Inbox UI
- Diagram/Gantt/Avatar Components
- Dashboard Currency & Locale Formatting
- Backend HTTP Auth Helpers
- Deployment & Backend Docs (rationale)
- Projects/Tasks Route Pages
- Gantt Chart & Company Context
- API Client & User Service
- Seed Data (Store)
- Alert Dialog & Company Service
- UI Text & Purchases Page
- DataStore (misc module)
- Invoice Designer (visual builder)
- Accordion/Calendar UI Primitives
- TS Project Config
- Usability Review & Roadmap Docs
- Public Invoice Service & Pages
- Notifications Service & Page
- Command Palette & Combobox UI
- Invoice Template Panel
- Project Service & Time Tracking
- NPM Package Manifest
- DataStore (misc module)
- DataStore (misc module)
- DataStore (misc module)
- Notifications (Store)
- shadcn Components Config
- NPM Package Manifest
- NPM Package Manifest
- DataStore (misc module)
- Menubar UI Primitive
- DataStore (misc module)
- TS Project Config
- Toast UI & App Layout
- Product Tour (onboarding)
- Backend Validation Helpers
- DataStore (misc module)
- NPM Package Manifest
- DataStore (misc module)
- Carousel UI Primitive
- DataStore (misc module)
- DataStore (misc module)
- Backend API Test Suite
- Admin Service & Page
- Chart UI & Overview Chart
- Admin Page
- Alert UI & Numbering Settings
- Performance Dashboard (CRM)
- Invoice Document Model
- Ops CLI Script
- CRM Service Fragment
- Financial Reports Panel
- Green API (WhatsApp) Client
- CSV Import/Export
- NPM Package Manifest
- CRM Pipeline Page
- DataStore (misc module)
- DataStore (misc module)
- DataStore (misc module)
- Email Sending (Resend)
- Activity Feed & CRM Service
- NPM Package Manifest
- DataStore (misc module)
- DataStore (misc module)
- DataStore (misc module)
- DataStore (misc module)
- Invoice PDF Generation
- Dropdown Menu UI Primitive
- Finance Service & Delivery Dialog
- DataStore (misc module)
- DataStore (misc module)
- Diagram Route Page
- Role Migration Script
- NPM Package Manifest
- Payroll Page & HR Service
- Bill Matching Page (3-way match)
- NPM Dependency Pair
- NPM Dependency Pair
- NPM Dependency Pair
- NPM Dependency Pair
- NPM Dependency Pair
- Next.js Config
- NPM Dependency Pair
- NPM Dependency Pair
- NPM Dependency Pair
- NPM Dependency Pair
- NPM Dependency Pair
- NPM Dependency Pair
- NPM Dependency Pair
- NPM Dependency Pair
- NPM Dependency Pair
- NPM Dependency Pair
- NPM Dependency Pair
- NPM Dependency Pair
- NPM Dependency Pair
- NPM Dependency Pair
- NPM Dependency Pair
- NPM Dependency Pair
- NPM Dependency Pair
- NPM Dependency Pair
- NPM Dependency Pair
- NPM Dependency Pair
- NPM Dependency Pair
- NPM Dependency Pair
- NPM Dependency Pair
- NPM Dependency Pair
- NPM Dependency Pair
- NPM Dependency Pair
- NPM Dependency Pair
- NPM Dependency Pair
- NPM Dependency Pair
- NPM Dependency Pair
- NPM Dependency Pair
- NPM Dependency Pair
- PostCSS Config
- App Icon Image
- OMR Currency Icon
- Font-Weight Specimen Graphic
- Bold Currency Icon
- Bold Currency Icon (alt)
- Light Currency Icon
- Light Currency Icon (alt)
- Medium Currency Icon
- Medium Currency Icon (alt)

## God Nodes (most connected - your core abstractions)
1. `DataStore` - 513 edges
2. `useI18n()` - 309 edges
3. `useToast()` - 161 edges
4. `useCompany()` - 147 edges
5. `react` - 137 edges
6. `apiFetch()` - 136 edges
7. `cn()` - 94 edges
8. `Button` - 85 edges
9. `useAuthGuard()` - 84 edges
10. `useCompanyCurrency()` - 64 edges

## Surprising Connections (you probably didn't know these)
- `InvoiceDesigner()` --indirect_call--> `warn()`  [INFERRED]
  frontend/src/modules/finance/components/invoice-designer.tsx → backend/test/api.test.js
- `Two-way WhatsApp via Green API Inbound Webhook` --semantically_similar_to--> `Green API WhatsApp Webhook Registration`  [INFERRED] [semantically similar]
  docs/followups-worldclass-plan.md → DEPLOY.md
- `BlockTree()` --indirect_call--> `block()`  [INFERRED]
  frontend/src/modules/finance/components/invoice-designer.tsx → backend/src/invoice-doc.ts
- `InvoiceDesigner()` --indirect_call--> `block()`  [INFERRED]
  frontend/src/modules/finance/components/invoice-designer.tsx → backend/src/invoice-doc.ts
- `DocRenderer()` --indirect_call--> `block()`  [INFERRED]
  frontend/src/modules/finance/doc/doc-renderer.tsx → backend/src/invoice-doc.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Follow-ups Core Daily Loop (entity + outcome + queue + principles)** — docs_followups_worldclass_plan_follow_ups_table, docs_followups_worldclass_plan_outcome_loop, docs_followups_worldclass_plan_today_work_queue, docs_followups_worldclass_plan_design_principles [EXTRACTED 0.90]
- **Procurement Depth Flow (Requisition → RFQ → GRN → 3-way match)** — docs_gig_erp_roadmap_purchase_requisition, docs_gig_erp_roadmap_rfq, docs_gig_erp_roadmap_3way_match, docs_usability_review_todos_purchase_requisitions_unwired [EXTRACTED 0.85]
- **Green API WhatsApp Integration Touchpoints** — deploy_green_api_webhook, deploy_whatsapp_encryption_key, docs_followups_worldclass_plan_two_way_whatsapp [INFERRED 0.80]

## Communities (150 total, 56 thin omitted)

### Community 0 - "Backend Domain Types & Store Inputs"
Cohesion: 0.02
Nodes (135): activityEntityTypes, addMonths(), BudgetLineInput, buildMonthWindows(), CreateAccountInput, CreateActivityEventInput, CreateBudgetInput, CreateCampaignAssignmentInput (+127 more)

### Community 1 - "Finance Domain Types (frontend)"
Cohesion: 0.03
Nodes (114): AccountActivityLine, AccountActivityReport, ActivityEvent, AgingBucket, Budget, BudgetLine, BudgetStatus, BudgetVarianceLine (+106 more)

### Community 2 - "DataStore Finance/Ledger Methods"
Cohesion: 0.03
Nodes (11): DataStore, Budget, BudgetVarianceReport, Department, Expense, InvoiceTemplate, LeaveRequest, LeaveType (+3 more)

### Community 3 - "Contacts & Custom Fields UI"
Cohesion: 0.07
Nodes (64): CustomFieldsForm(), Textarea, ClientsPage(), ALL_ROLES, buildContactPayload(), ContactForm, ContactFormFields(), contactToForm() (+56 more)

### Community 4 - "Shared Page/Component Utilities"
Cohesion: 0.07
Nodes (77): react, ProjectDetailsPage(), PrintInvoicePage(), useConfirm(), ImageUpload(), useCompany(), useToast(), normalizeCurrencyCode() (+69 more)

### Community 5 - "Route Pages (App Router)"
Cohesion: 0.09
Nodes (40): ClientsRoute(), CompaniesRoute(), CompanyProfileRoute(), ContactDetailRoute(), ContactsRoute(), CampaignsRoute(), CommissionsRoute(), FollowupsRoute() (+32 more)

### Community 6 - "Backend Auth & Server Bootstrap"
Cohesion: 0.03
Nodes (66): app, isHashed(), verifyPassword(), activityEntityTypes, AuthedRequest, clientStatuses, companyManagementRoles, contactRoles (+58 more)

### Community 7 - "UI Primitives (select/sheet/badge)"
Cohesion: 0.15
Nodes (41): Badge(), BadgeProps, badgeVariants, Input, Label, labelVariants, MultiSelectItem, SelectContent (+33 more)

### Community 8 - "CRM Service Layer"
Cohesion: 0.05
Nodes (56): RulesTab(), ContributorsPanelProps, activityCategories, ActivityCategory, approveCommission(), CampaignAssignmentStatus, campaignAssignmentStatuses, CampaignDeliverableStatus (+48 more)

### Community 9 - "DataStore Invoicing & Commissions"
Cohesion: 0.09
Nodes (6): Commission, CommissionBasis, CreditNote, Invoice, JournalEntry, Payment

### Community 10 - "App Shell & Sidebar Layout"
Cohesion: 0.06
Nodes (45): AdminLayout(), AppLayout(), Logo(), navItems, SidebarNav(), ConfirmProvider(), Separator, Sidebar (+37 more)

### Community 11 - "DataStore CRM/Project/Task CRUD"
Cohesion: 0.07
Nodes (8): CampaignAssignment, Contact, ContactRoleType, CrmCampaign, CrmProposal, Opportunity, VendorRequest, error()

### Community 12 - "Form & Dialog UI Primitives"
Cohesion: 0.08
Nodes (43): DialogContent, DialogDescription, DialogFooter(), DialogHeader(), DialogOverlay, DialogTitle, FormControl, FormDescription (+35 more)

### Community 13 - "Purchasing Service & Warehouses UI"
Cohesion: 0.06
Nodes (54): emptyForm(), WarehousesPanel(), PurchaseOrderLineItem, PurchaseOrderStatus, emptyPurchaseForm(), PurchasesPage(), adjustInventoryItem(), approvePurchaseOrder() (+46 more)

### Community 14 - "Card/Button UI Primitives"
Cohesion: 0.10
Nodes (30): Button, ButtonProps, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle (+22 more)

### Community 15 - "Follow-Ups Page (CRM)"
Cohesion: 0.06
Nodes (48): ageDays(), atNineAm(), BulkReassignDialog(), CHANNEL_COLOR, CHANNEL_ICON, channelHref(), CompleteDialog(), DueBadge() (+40 more)

### Community 16 - "DataStore Inventory & Lots"
Cohesion: 0.09
Nodes (7): Delivery, InventoryIssue, InventoryItem, InventoryLocationBalance, InventoryTransfer, StockCount, StockMovement

### Community 17 - "Invoice Document Renderer"
Cohesion: 0.08
Nodes (41): alignClass, DEFAULT_COLUMNS, DetailsView(), DocRenderer(), isVisible(), px(), styleToCss(), swapAlign() (+33 more)

### Community 18 - "DataStore Vendor Bills & Reports"
Cohesion: 0.08
Nodes (11): isBetween(), makeLineChart(), makeStackedBarChart(), ActivityEvent, AgingBucket, BillMatch, DashboardChart, PurchaseOrderPayableSummary (+3 more)

### Community 19 - "Table UI & Inventory Lots Dialog"
Cohesion: 0.13
Nodes (33): Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow (+25 more)

### Community 20 - "HR Service (Attendance/Payroll/Leave)"
Cohesion: 0.07
Nodes (42): AttendancePage(), EmployeesPage(), emptyForm(), LeavePage(), AttendanceRecord, AttendanceStatus, createDepartment(), createEmployee() (+34 more)

### Community 21 - "Campaign Pages (CRM)"
Cohesion: 0.08
Nodes (39): CAMPAIGN_PLATFORMS, CampaignsPage(), campaignStatusColor, commissionStatusColor, proposalStatusColor, vendorStatusColor, CampaignAssignment, CampaignDeliverable (+31 more)

### Community 22 - "Finance Service Helpers"
Cohesion: 0.06
Nodes (40): apiFetch(), money(), quarterDefaults(), VatPanel(), StockCountPage(), money(), RfqDetail(), bulkUpdateInvoiceStatus() (+32 more)

### Community 23 - "WhatsApp Inbox UI"
Cohesion: 0.11
Nodes (36): stateBadgeStyles, WhatsappSettingsPanel(), Avatar(), avatarHue(), formatChatPreviewTime(), formatDateLabel(), formatPhone(), formatTime() (+28 more)

### Community 24 - "Diagram/Gantt/Avatar Components"
Cohesion: 0.10
Nodes (28): getNodesAndEdges(), nodeTypes, TaskDiagram(), priorityColors, TaskNode(), UserNav(), GanttChart(), GanttTooltip() (+20 more)

### Community 25 - "Dashboard Currency & Locale Formatting"
Cohesion: 0.08
Nodes (31): CurrencyAmount(), formatCurrency(), getCurrencyMeta(), SupportedCurrencyCode, formatDate(), formatDateTime(), formatNumber(), getCurrentLocale() (+23 more)

### Community 26 - "Backend HTTP Auth Helpers"
Cohesion: 0.17
Nodes (33): canAccessCompany(), getAccessibleCompanyIds(), getEffectiveRole(), HttpError, requireCompanyRole(), createServer(), defaultPassword(), handler() (+25 more)

### Community 27 - "Deployment & Backend Docs (rationale)"
Cohesion: 0.06
Nodes (35): Backend API Overview (auth/login, CRUD, mark-invoiced, /seed), Express + SQLite API (replaces Firebase), seed-data.ts Demo Seeding, TaskFlow Backend README, Bootstrap Admin User Creation, Green API WhatsApp Webhook Registration, Nginx TLS Reverse Proxy Config, PM2 Process Management (+27 more)

### Community 28 - "Projects/Tasks Route Pages"
Cohesion: 0.09
Nodes (23): ScrollArea, ScrollBar, OverviewChart(), ActivityFeed(), GanttChart(), ProjectList(), ProjectsPage(), bucketFor() (+15 more)

### Community 29 - "Gantt Chart & Company Context"
Cohesion: 0.09
Nodes (26): TabsContent, TabsList, TabsTrigger, CompanyContextType, CompaniesPage(), nodeTypes, TaskNodeData, GanttChartProps (+18 more)

### Community 30 - "API Client & User Service"
Cohesion: 0.11
Nodes (28): ApiError, buildHeaders(), clearStoredToken(), getStoredToken(), isApiError(), AddUserFormValues, AddUserSheet(), AddUserSheetProps (+20 more)

### Community 31 - "Seed Data (Store)"
Cohesion: 0.09
Nodes (17): clients, comments, companies, inventoryItems, invoices, positions, projects, purchaseOrders (+9 more)

### Community 32 - "Alert Dialog & Company Service"
Cohesion: 0.16
Nodes (25): runSeedDatabase(), AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter(), AlertDialogHeader(), AlertDialogOverlay (+17 more)

### Community 33 - "UI Text & Purchases Page"
Cohesion: 0.10
Nodes (27): Combobox(), AR_UI_MAP, AR_WORD_MAP, collapse(), isArabicUi(), localizeUiNode(), localizeUiPlaceholder(), localizeUiText() (+19 more)

### Community 34 - "DataStore (misc module)"
Cohesion: 0.10
Nodes (3): CompanyNumberingSetting, NumberingEntityType, SalesOrder

### Community 35 - "Invoice Designer (visual builder)"
Cohesion: 0.09
Nodes (26): BLOCK_DEFAULTS, BlockProperties(), blockSummary(), BlockTree(), cloneBlockWithIds(), ColumnsProperties(), DEFAULT_COLUMNS, DetailsProperties() (+18 more)

### Community 36 - "Accordion/Calendar UI Primitives"
Cohesion: 0.09
Nodes (22): CompanySwitcher(), CreateTaskSheet(), AccordionContent, AccordionItem, AccordionTrigger, buttonVariants, Calendar(), CalendarProps (+14 more)

### Community 37 - "TS Project Config"
Cohesion: 0.07
Nodes (29): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+21 more)

### Community 38 - "Usability Review & Roadmap Docs"
Cohesion: 0.10
Nodes (29): 3-way Match (PO ↔ GRN ↔ Vendor Bill), Batch/Lot + Expiry + FEFO Traceability (Phase 1, DONE), Budget Control (actual-vs-budget reporting), Cold Chain, Logistics & Dashboards, Global Industrial Gate LLC ERP Roadmap, HR Payroll + WPS Export, Manufacturing/Production (French-fries line, BOM, Work Orders), Migration 056_inventory_lots (+21 more)

### Community 39 - "Public Invoice Service & Pages"
Cohesion: 0.19
Nodes (21): PublicDeliveryPage(), PublicInvoicePage(), Company, InvoiceDesignerProps, InvoiceDocument(), InvoiceDocumentProps, DocRendererProps, templateToDoc() (+13 more)

### Community 40 - "Notifications Service & Page"
Cohesion: 0.18
Nodes (23): CATEGORY_BORDER, NotificationBell(), timeAgo(), CATEGORY_BORDER, NotificationRow(), NotificationsPage(), PreferencesCard(), AppNotification (+15 more)

### Community 41 - "Command Palette & Combobox UI"
Cohesion: 0.22
Nodes (17): ComboboxOption, ComboboxProps, Command, CommandDialog(), CommandDialogProps, CommandEmpty, CommandGroup, CommandInput (+9 more)

### Community 42 - "Invoice Template Panel"
Cohesion: 0.12
Nodes (22): AssetUploadField(), AssetUploadFieldProps, cleanForm(), defaultColumns(), emptyForm, InvoiceTemplatePanel(), InvoiceTemplatePreview(), layoutLabels (+14 more)

### Community 43 - "Project Service & Time Tracking"
Cohesion: 0.15
Nodes (22): formatDuration(), TaskTimePanel(), todayIso(), TimeEntry, addProjectMember(), createComment(), createProject(), createTask() (+14 more)

### Community 44 - "NPM Package Manifest"
Cohesion: 0.09
Nodes (23): cmdk, date-fns, dependencies, cmdk, date-fns, dotenv, pdfjs-dist, qrcode.react (+15 more)

### Community 45 - "DataStore (misc module)"
Cohesion: 0.16
Nodes (4): hashPassword(), Project, SanitizedUser, User

### Community 46 - "DataStore (misc module)"
Cohesion: 0.18
Nodes (3): PurchaseOrder, PurchaseRequisition, PurchaseRequisitionStatus

### Community 47 - "DataStore (misc module)"
Cohesion: 0.15
Nodes (3): taskLink(), InventoryLot, Task

### Community 48 - "Notifications (Store)"
Cohesion: 0.14
Nodes (11): DataStoreOptions, defaultNotificationPrefs(), normalizeNotificationPrefs(), NOTIFICATION_CATEGORIES, NOTIFICATION_META, CreateServerOptions, Notification, NotificationCategory (+3 more)

### Community 49 - "shadcn Components Config"
Cohesion: 0.11
Nodes (17): aliases, components, hooks, lib, ui, utils, iconLibrary, rsc (+9 more)

### Community 50 - "NPM Package Manifest"
Cohesion: 0.12
Nodes (17): dependencies, bcryptjs, better-sqlite3, cors, dotenv, express-rate-limit, puppeteer, resend (+9 more)

### Community 51 - "NPM Package Manifest"
Cohesion: 0.12
Nodes (17): devDependencies, supertest, tsx, @types/bcryptjs, @types/better-sqlite3, @types/express, @types/node, @types/supertest (+9 more)

### Community 52 - "DataStore (misc module)"
Cohesion: 0.24
Nodes (4): FollowUp, FollowUpChannel, FollowUpOutcome, FollowUpPriority

### Community 53 - "Menubar UI Primitive"
Cohesion: 0.12
Nodes (11): Menubar, MenubarCheckboxItem, MenubarContent, MenubarItem, MenubarLabel, MenubarRadioItem, MenubarSeparator, MenubarShortcut() (+3 more)

### Community 54 - "DataStore (misc module)"
Cohesion: 0.20
Nodes (3): Employee, PayrollRun, PayrollRunStatus

### Community 55 - "TS Project Config"
Cohesion: 0.12
Nodes (15): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, outDir, rootDir (+7 more)

### Community 56 - "Toast UI & App Layout"
Cohesion: 0.17
Nodes (12): metadata, Providers(), Toast, ToastAction, ToastActionElement, ToastClose, ToastDescription, ToastProps (+4 more)

### Community 57 - "Product Tour (onboarding)"
Cohesion: 0.25
Nodes (12): TourContext, TourContextValue, TourProvider(), useSeenTours(), useTour(), TourHelpButton(), WelcomeTourModal(), TargetRect (+4 more)

### Community 58 - "Backend Validation Helpers"
Cohesion: 0.31
Nodes (13): BoxSpacing, ALIGNS, BLOCK_TYPES, checkBlock(), checkColumns(), checkNumber(), checkSpacing(), checkString() (+5 more)

### Community 59 - "DataStore (misc module)"
Cohesion: 0.18
Nodes (5): AccountActivityReport, LedgerAccountType, VatReturn, VatReturnFigures, VatReturnPreview

### Community 60 - "NPM Package Manifest"
Cohesion: 0.13
Nodes (15): devDependencies, postcss, tailwindcss, @types/node, @types/nodemailer, @types/react, @types/react-dom, typescript (+7 more)

### Community 62 - "Carousel UI Primitive"
Cohesion: 0.14
Nodes (13): Carousel, CarouselApi, CarouselContent, CarouselContext, CarouselContextProps, CarouselItem, CarouselNext, CarouselOptions (+5 more)

### Community 63 - "DataStore (misc module)"
Cohesion: 0.28
Nodes (3): Rfq, RfqLineItem, RfqStatus

### Community 65 - "Backend API Test Suite"
Cohesion: 0.17
Nodes (10): assert, { createServer }, { DataStore }, fs, login(), os, path, request (+2 more)

### Community 66 - "Admin Service & Page"
Cohesion: 0.18
Nodes (12): LoginPageInner(), setStoredToken(), AdminActivityResponse, AdminActivityRow, AdminCompanyRow, AdminHealth, AdminOverview, adminService (+4 more)

### Community 67 - "Chart UI & Overview Chart"
Cohesion: 0.18
Nodes (9): OverviewChart(), ChartConfig, ChartContainer, ChartContext, ChartContextProps, ChartLegendContent, ChartTooltipContent, THEMES (+1 more)

### Community 68 - "Admin Page"
Cohesion: 0.17
Nodes (10): AdminPage(), formatBytes(), formatRelative(), formatUptime(), CompanyProfilePanel(), fromCompany(), EditCompanyDialog(), getCompanyById() (+2 more)

### Community 69 - "Alert UI & Numbering Settings"
Cohesion: 0.24
Nodes (9): Alert, AlertDescription, AlertTitle, alertVariants, currencyLabel(), supportedCurrencies, EditableSetting, entityLabels (+1 more)

### Community 70 - "Performance Dashboard (CRM)"
Cohesion: 0.21
Nodes (9): PerformanceDashboard(), PeriodPreset, periodRange(), SortKey, CrmDashboardSummary, decodeCrmDashboard(), EmployeePerformance, getCrmDashboard() (+1 more)

### Community 71 - "Invoice Document Model"
Cohesion: 0.53
Nodes (10): block(), blockTypes, columns(), finiteNumber(), isRecord(), spacing(), stringValue(), style() (+2 more)

### Community 72 - "Ops CLI Script"
Cohesion: 0.20
Nodes (5): args, dbPath, force, getCount(), showStatus()

### Community 73 - "CRM Service Fragment"
Cohesion: 0.22
Nodes (11): ProposalsPage(), createProposal(), decodeActivity(), decodeCrmProposal(), deleteProposal(), getContactActivities(), getProposals(), logActivity() (+3 more)

### Community 74 - "Financial Reports Panel"
Cohesion: 0.20
Nodes (11): FinancialReportsPanel(), printableReport(), startOfMonthInput(), toInputDate(), downloadFinanceExport(), getAccountActivityReport(), getProfitAndLossReport(), getTrialBalanceReport() (+3 more)

### Community 75 - "Green API (WhatsApp) Client"
Cohesion: 0.22
Nodes (7): greenApi, GreenApiCredentials, GreenApiError, normalizeState(), toChatId(), VALID_STATES, WhatsAppInstanceState

### Community 76 - "CSV Import/Export"
Cohesion: 0.42
Nodes (8): RFC-4180, CsvImportExport(), ImportResult, buildCsv(), downloadAuthedFile(), downloadTextFile(), parseCsv(), readFileText()

### Community 77 - "NPM Package Manifest"
Cohesion: 0.20
Nodes (9): name, private, scripts, build, dev, lint, start, typecheck (+1 more)

### Community 78 - "CRM Pipeline Page"
Cohesion: 0.27
Nodes (10): emptyOpportunityForm(), emptyQuickEntryForm(), inputDate(), PipelinePage(), createOpportunity(), decodeOpportunity(), deleteOpportunity(), getOpportunities() (+2 more)

### Community 79 - "DataStore (misc module)"
Cohesion: 0.33
Nodes (3): CustomFieldDefinition, CustomFieldEntityType, CustomFieldType

### Community 82 - "Email Sending (Resend)"
Cohesion: 0.42
Nodes (8): EmailResult, escapeHtml(), linkHref(), send(), sendNotificationDigestEmail(), sendNotificationEmail(), sendWelcomeEmail(), WelcomeEmailInput

### Community 83 - "Activity Feed & CRM Service"
Cohesion: 0.28
Nodes (8): ActivityFeed(), CATEGORY_COLOR, CATEGORY_ICON, fmt(), Props, Props, CrmActivity, Followup

### Community 84 - "NPM Package Manifest"
Cohesion: 0.25
Nodes (8): scripts, build, dev, ops, ops:migrate, ops:status, start, test

### Community 85 - "DataStore (misc module)"
Cohesion: 0.36
Nodes (3): WhatsAppChatSettings, WhatsAppChatVisibility, WhatsAppMessageDirection

### Community 86 - "DataStore (misc module)"
Cohesion: 0.43
Nodes (3): Contribution, ContributionRole, ContributionSourceType

### Community 88 - "DataStore (misc module)"
Cohesion: 0.43
Nodes (3): RecordAttachment, RecordEntityType, RecordTimelineItem

### Community 89 - "Invoice PDF Generation"
Cohesion: 0.43
Nodes (5): getBrowser(), InvoicePdfOptions, launch(), renderInvoicePdf(), renderOnce()

### Community 90 - "Dropdown Menu UI Primitive"
Cohesion: 0.29
Nodes (6): DropdownMenuCheckboxItem, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuShortcut(), DropdownMenuSubContent, DropdownMenuSubTrigger

### Community 91 - "Finance Service & Delivery Dialog"
Cohesion: 0.43
Nodes (7): DeliveryManagementDialog(), cancelDelivery(), createDelivery(), getDeliveries(), getDeliveriesForSalesOrder(), mapDelivery(), updateDeliveryStatus()

### Community 95 - "Role Migration Script"
Cohesion: 0.50
Nodes (3): content, fs, lines

### Community 96 - "NPM Package Manifest"
Cohesion: 0.50
Nodes (3): name, private, version

### Community 97 - "Payroll Page & HR Service"
Cohesion: 0.67
Nodes (3): money(), RunCard(), downloadWps()

### Community 98 - "Bill Matching Page (3-way match)"
Cohesion: 0.67
Nodes (3): BillMatchingPage(), money(), getBillMatches()

## Ambiguous Edges - Review These
- `Express + SQLite API (replaces Firebase)` → `Login Page with Firebase Authentication`  [AMBIGUOUS]
  frontend/docs/blueprint.md · relation: conceptually_related_to

## Knowledge Gaps
- **641 isolated node(s):** `fs`, `content`, `lines`, `name`, `version` (+636 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **56 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Express + SQLite API (replaces Firebase)` and `Login Page with Firebase Authentication`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `error()` connect `DataStore CRM/Project/Task CRUD` to `DataStore (misc module)`, `Backend API Test Suite`, `Admin Service & Page`, `Shared Page/Component Utilities`, `Admin Page`, `DataStore Invoicing & Commissions`, `App Shell & Sidebar Layout`, `Project Service & Time Tracking`, `DataStore Inventory & Lots`, `DataStore Vendor Bills & Reports`, `Gantt Chart & Company Context`, `Backend HTTP Auth Helpers`, `Projects/Tasks Route Pages`, `DataStore (misc module)`, `API Client & User Service`?**
  _High betweenness centrality (0.306) - this node is a cross-community bridge._
- **Why does `DataStore` connect `DataStore Finance/Ledger Methods` to `Backend Domain Types & Store Inputs`, `Backend Auth & Server Bootstrap`, `DataStore Invoicing & Commissions`, `DataStore CRM/Project/Task CRUD`, `DataStore Inventory & Lots`, `DataStore Vendor Bills & Reports`, `Seed Data (Store)`, `DataStore (misc module)`, `DataStore (misc module)`, `DataStore (misc module)`, `DataStore (misc module)`, `Notifications (Store)`, `DataStore (misc module)`, `DataStore (misc module)`, `DataStore (misc module)`, `DataStore (misc module)`, `DataStore (misc module)`, `DataStore (misc module)`, `Ops CLI Script`, `DataStore (misc module)`, `DataStore (misc module)`, `DataStore (misc module)`, `DataStore (misc module)`, `DataStore (misc module)`, `DataStore (misc module)`, `DataStore (misc module)`, `DataStore (misc module)`, `DataStore (misc module)`?**
  _High betweenness centrality (0.227) - this node is a cross-community bridge._
- **Why does `useI18n()` connect `Route Pages (App Router)` to `Finance Domain Types (frontend)`, `Contacts & Custom Fields UI`, `Shared Page/Component Utilities`, `UI Primitives (select/sheet/badge)`, `CRM Service Layer`, `App Shell & Sidebar Layout`, `Form & Dialog UI Primitives`, `Purchasing Service & Warehouses UI`, `Card/Button UI Primitives`, `Follow-Ups Page (CRM)`, `Table UI & Inventory Lots Dialog`, `HR Service (Attendance/Payroll/Leave)`, `Campaign Pages (CRM)`, `Finance Service Helpers`, `WhatsApp Inbox UI`, `Diagram/Gantt/Avatar Components`, `Dashboard Currency & Locale Formatting`, `Projects/Tasks Route Pages`, `Gantt Chart & Company Context`, `API Client & User Service`, `Alert Dialog & Company Service`, `UI Text & Purchases Page`, `Invoice Designer (visual builder)`, `Accordion/Calendar UI Primitives`, `Public Invoice Service & Pages`, `Notifications Service & Page`, `Command Palette & Combobox UI`, `Invoice Template Panel`, `Project Service & Time Tracking`, `Product Tour (onboarding)`, `Admin Service & Page`, `Chart UI & Overview Chart`, `Admin Page`, `Alert UI & Numbering Settings`, `Performance Dashboard (CRM)`, `CRM Service Fragment`, `Financial Reports Panel`, `CRM Pipeline Page`, `Activity Feed & CRM Service`, `Finance Service & Delivery Dialog`, `Diagram Route Page`, `Payroll Page & HR Service`, `Bill Matching Page (3-way match)`?**
  _High betweenness centrality (0.134) - this node is a cross-community bridge._
- **What connects `fs`, `content`, `lines` to the rest of the system?**
  _641 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Backend Domain Types & Store Inputs` be split into smaller, more focused modules?**
  _Cohesion score 0.019148936170212766 - nodes in this community are weakly interconnected._
- **Should `Finance Domain Types (frontend)` be split into smaller, more focused modules?**
  _Cohesion score 0.03094606542882405 - nodes in this community are weakly interconnected._