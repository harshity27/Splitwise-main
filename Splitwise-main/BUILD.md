# BUILD_PLAN.md

## 1. Product Research

### How I Studied Splitwise

To understand Splitwise deeply, I went beyond simply using the application. I created an account on the official Splitwise platform and explored both the web and mobile versions. I analyzed every major screen, feature, workflow, and user interaction.

I created groups, added friends, performed multiple dummy transactions, experimented with different split methods, and tested settlement flows. I also mapped the navigation structure of the application to understand how pages are connected and how users move between workflows.

In addition to using the product, I studied the user interface in detail, including button placements, navigation patterns, default values, forms, balance summaries, group pages, activity feeds, and chat-related functionality. I documented the relationship between screens and created page flow diagrams to understand the overall product architecture.

I also attempted to reverse engineer the underlying system by estimating the database schema, data flow, business logic, and balance calculation algorithms used by Splitwise.

### What I Learned

Through my research, I learned that Splitwise is primarily a debt-tracking and expense-sharing platform rather than a payment platform. The core value of the product is maintaining accurate balances between users and groups while minimizing confusion regarding who owes money to whom.

Some key concepts I identified include:

- Groups for organizing expenses among specific users.

- Friends and friend relationships.

- Expenses as the central financial transaction object.

- Multiple split methods including equal, unequal, percentage-based, and share-based splits.

- Balance tracking at both group and individual levels.

- Debt simplification to reduce the number of required settlements.

- Settlement recording to mark debts as paid.

- Activity history for maintaining transparency.

- Group-specific communication through expense discussions and comments.

- Summary dashboards showing outstanding balances and recent activities.

I also learned that many seemingly simple actions trigger multiple balance updates behind the scenes, making the balance calculation engine one of the most important parts of the product.

### What Workflows I Identified

**User Onboarding Workflow:** User registers an account, logs in, creates or joins groups, and adds friends.

**Group Management Workflow:** Create group, add members, remove members, view group balances, and view group activity.

**Expense Creation Workflow:** Create expense, select participants, choose split method, calculate individual shares, update balances, and generate activity records.

**Balance Management Workflow:** View total balances, view group balances, view friend balances, track money owed, and track money owed to the user.

**Settlement Workflow:** Select user or group, record payment, update balances, store settlement history, and generate activity updates.

**Communication Workflow:** Open expense, add comments or chat messages, notify relevant participants, and store conversation history.

### Product Assumptions Made

Based on my analysis, I made the following assumptions for my implementation:

**User Entity:** Includes User ID, Name, Email, Password, Friend List, Active Groups, Balance Summary, and Recent Activity History.

**Group Entity:** Includes Group ID, Group Name, Members, Group Expenses, Group Balance Summary, Group Chat History, and Activity Feed.

**Expense Entity:** Includes Expense ID, Title, Description, Amount, Paid By User, Participants, Split Type, Individual Shares, Expense Chat, and Created Timestamp.

**Settlement Entity:** Includes Settlement ID, Payer, Receiver, Amount, Timestamp, Group Reference, and Activity Entity.

**Activity Entity:** Includes Activity ID, User, Action Type, Related Group, Related Expense, and Timestamp.

### Additional Observations

During research, I noticed multiple entry points for creating groups and expenses, which suggests that Splitwise prioritizes reducing user friction. I also observed the use of sensible default values throughout the application. Whenever users do not explicitly provide optional information, the system automatically fills reasonable defaults to simplify the workflow.

I analyzed how balances flow after every transaction and attempted to model the debt simplification algorithm. I also studied credit and debit relationships within groups and how group-level balances contribute to overall user balances. By mapping the page hierarchy and navigation structure, I developed a strong understanding of the product architecture before beginning implementation.

---

## 2. Architecture

### Tech Stack

- **Frontend:** React 19, Vite, react-router-dom, Tailwind CSS.

- **Backend:** Node.js 20+ (ESM), Express 4.x.

- **Database:** SQLite / sqlite3.

- **Authentication:** JWT (jsonwebtoken) and bcryptjs.

- **Deployment Tools:** Docker, Docker Compose, nodemon.

### Database Schema

- **Core Entities:** users, profiles, groups, group_members, friendships.

- **Transactions:** expenses, expense_splits, payments.

- **Engagement:** expense_comments, activities.

- **Invites:** friend_invites, group_invites.

### API Design

- **RESTful JSON API:** Standardized endpoints exposed under /api (e.g., /api/signup, /api/groups, /api/expenses).

- **Authentication:** JWT tokens passed via the Authorization: Bearer \<token\> header for protected routes.

- **Real-time Capabilities:** In-memory Server-Sent Events (SSE) hub for live expense comment streaming.

### Frontend Structure

- **Routing:** Public routes (/, /login, /signup) and protected workspace routes (/app, /app/expenses, /app/groups/:groupId) managed by React Router.

- **App Shell:** A central Workspace.jsx component that bootstraps dashboard data, renders sidebar navigation, and manages the main view context.

- **Modals:** Core interactions are encapsulated in modals (CreateGroupModal, ExpenseModal, SettlementModal) to match the low-friction UX identified in research.

### Deployment Approach

- **Local Development:** Split into separate frontend and backend servers utilizing Vite and nodemon with .env configurations.

- **Containerization:** A docker-compose.yml file packages the React SPA, Express backend, and a persisted SQLite data volume for immediate spin-up and local hosting.

---

## 3. AI Collaboration Process

### How I Instructed the AI

I initiated the project by prompting the AI to act as a junior engineer collaborating on an internship assignment. I established strict rules: it could not assume product requirements, it had to ask detailed questions before jumping into implementation, and it had to document everything in a single source-of-truth file.

### What Questions the AI Asked

To define the scope, the AI asked targeted questions covering:

- UI routing, layout preferences, and core screen priorities.

- Backend integration requirements, specifically regarding signup, login, and auth state management.

- Intricacies of group logic, membership validation, and expense split calculations.

- Edge cases for calculating suggested debts and handling balances.

### How the Plan Evolved

- **UI First:** We started by scaffolding the frontend routing and authentication screens.

- **Backend Integration:** We then built the Express server, SQLite schema, and JWT-based auth flows to make the login/signup real.

- **Expense Engine:** The focus shifted to the core logic—group management, calculating splits (equal, exact, percentage, shares), and a greedy algorithm for debt simplification.

- **Real-time Features:** Finally, SSE was introduced for live commenting.

### Maintaining AI_CONTEXT.md

The AI was instructed to update the AI_CONTEXT.md file continuously. Every time a new feature was scoped, a database table was added, or a design decision was made, the document was modified. This ensured the project could be fully reconstructed from this single document at any given time.

---

## 4. Tradeoffs

### What I Simplified

- **Debt Simplification Algorithm:** Implemented a greedy algorithm matching the largest creditor to the largest debtor, rather than a mathematically perfect minimum-transaction graph solver.

- **Authentication Storage:** JWTs are stored in localStorage for simplicity and MVP velocity, rather than using more secure HttpOnly cookies.

- **Real-time Architecture:** Used an in-memory SSE hub which works for a single-node deployment but will not scale horizontally.

### What I Hardcoded

- Local development defaults (ports, local Docker JWT secrets) inside the codebase to prioritize an immediate, frictionless out-of-the-box build.

- The database choice is hardcoded to SQLite for rapid local prototyping without needing a separate database service.

### What I Avoided

- Real payment gateway integrations (Stripe, Plaid, PayPal).

- Production-grade media storage (avatars are saved directly as base64 text strings).

- Comprehensive frontend automated testing.

- Multi-tenant scaling optimizations and strict CSRF/Rate Limiting middleware.

### What I Would Improve With More Time

- **Database:** Migrate from SQLite to PostgreSQL to handle concurrent reads/writes and formalize the data integrity.

- **Security:** Transition from localStorage to secure, HttpOnly, SameSite cookies for JWT management.

- **Infrastructure:** Implement proper cloud storage (like AWS S3) for avatars and file attachments.

- **Observability:** Integrate production-grade logging, error tracking (e.g., Sentry), and audit trails.

- **Testing:** Build a comprehensive suite of E2E tests (Cypress/Playwright) for the critical expense split paths.
