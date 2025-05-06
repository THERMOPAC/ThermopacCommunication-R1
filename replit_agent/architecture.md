# Architecture Overview

## 1. Overview

ThermoPAC is an enterprise resource planning (ERP) system designed for industrial manufacturing and engineering operations. The system manages the entire workflow from project planning and procurement to production, quality management, and after-sales service. The architecture follows a modern full-stack JavaScript/TypeScript approach with a clear separation between frontend and backend components.

## 2. System Architecture

ThermoPAC follows a client-server architecture with:

- **Frontend**: React-based single-page application (SPA) using modern UI components
- **Backend**: Node.js/Express.js RESTful API server
- **Database**: PostgreSQL database with Drizzle ORM for data access
- **Storage**: Google Cloud Storage for file management
- **Authentication**: Session-based authentication with Passport.js

![Architecture Diagram]

### Key Architecture Decisions

1. **Full-Stack TypeScript**: The system uses TypeScript throughout to maintain type safety across frontend and backend boundaries, improving developer experience and reducing runtime errors.

2. **API-First Design**: Clear separation between frontend and backend allows for independent development and potential future mobile clients.

3. **ORM with Schema Validation**: Drizzle ORM combined with Zod validation provides type safety and runtime validation for database operations.

4. **Cloud Storage Integration**: Google Cloud Storage for scalable file handling rather than local filesystem storage.

5. **Modular Organization**: The codebase is organized into modules representing different business domains (projects, production, quality, etc.).

## 3. Key Components

### 3.1 Frontend Components

- **UI Framework**: Uses the Radix UI component library with Shadcn UI theming
- **State Management**: Uses React Query for server state management
- **Form Handling**: Uses React Hook Form with Zod validation
- **Routing**: Custom routing implementation
- **Component Structure**: Follows a common pattern with pages, components, and hooks directories

### 3.2 Backend Components

- **API Server**: Express.js REST API server
- **Database Access**: Drizzle ORM for PostgreSQL
- **Authentication**: Session-based with Passport.js
- **File Storage**: Google Cloud Storage for managing documents and files
- **Email Integration**: SendGrid for email notifications
- **External Services**: Google Gmail API integration

### 3.3 Database Schema

The database schema reflects the business domains:

- **Project Management**: Projects, project items, customers
- **Procurement**: Master items, vendors, item components
- **Production**: Work orders, production records, resource assignments
- **Quality Control**: Inspection orders, reports, non-conformance records
- **Document Management**: WPQR, WPS, material identification
- **After-Sales**: Service requests, activities, contracts
- **Users and Permissions**: User accounts, module permissions

### 3.4 Storage Architecture

- **Cloud Storage**: Uses Google Cloud Storage bucket (`thermopac_storage`) for all file storage
- **Directory Structure**: Organizes files by project, department, and document type
- **Access Control**: Manages file permissions through a database index and GCS permissions

## 4. Data Flow

### 4.1 Authentication Flow

1. User submits credentials via login form
2. Server authenticates with Passport.js
3. Session cookie is created and stored
4. Session is validated on each subsequent request

### 4.2 Project Management Flow

1. Projects are created and assigned to customers
2. Project items are defined, referencing master items
3. Work orders are generated from project items
4. Inspection orders track quality control requirements
5. Documents and files are attached to relevant entities

### 4.3 File Management Flow

1. Files are uploaded to the server via multipart forms
2. Server processes files and uploads to Google Cloud Storage
3. File metadata is stored in the database
4. Files are served via signed URLs or directly from GCS

## 5. External Dependencies

### 5.1 Core Dependencies

- **Database**: PostgreSQL (via Neon Serverless)
- **ORM**: Drizzle with Zod validation
- **Storage**: Google Cloud Storage
- **Email**: SendGrid
- **UI Components**: Radix UI, Shadcn UI

### 5.2 External Services

- **Google Cloud Storage**: For file storage and document management
- **Google Gmail API**: For email integration
- **SendGrid**: For transactional emails

### 5.3 Build and Development Tools

- **Bundling**: Vite for frontend, esbuild for backend
- **Package Management**: npm
- **TypeScript**: For type checking
- **Deployment**: Replit for hosting

## 6. Deployment Strategy

The application is configured for deployment on Replit with integration to cloud services:

### 6.1 Environment Configuration

- Production and development environments are managed through environment variables
- Secrets management through Replit's secrets feature

### 6.2 Database Management

- Uses Neon Serverless PostgreSQL
- Database migrations are managed with Drizzle Kit

### 6.3 File Storage Configuration

- Google Cloud Storage credentials are stored as environment variables
- Storage access patterns are abstracted through utility functions

### 6.4 Deployment Process

1. Code changes are pushed to the repository
2. Replit builds the application using the defined build script
3. Application is deployed to Replit's Cloud Run compatible environment
4. Environment variables are configured in the target environment

### 6.5 CI/CD

- Utilizes Replit's built-in CI/CD capabilities
- Build and deployment workflows defined in `.replit` configuration

## 7. Security Considerations

- **Authentication**: Session-based with secure cookies
- **Authorization**: Role-based access control for different modules
- **Data Validation**: Input validation using Zod schemas
- **File Security**: Secure file uploads with content type validation
- **Credential Management**: Secrets stored in environment variables, not in code
- **Session Management**: Session storage with appropriate timeouts

## 8. Future Architecture Considerations

- Microservices architecture for better scalability of individual modules
- GraphQL API for more efficient data fetching
- WebSocket integration for real-time notifications
- Enhanced mobile support with responsive design patterns
- Expanded integration with third-party systems