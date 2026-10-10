from pathlib import Path
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak

BASE_DIR = Path(r'c:\Users\chinn\Desktop\AgroTrace')
PDF_PATH = BASE_DIR / 'agrotrace_detailed_explanation.pdf'

summary_sections = [
    {
        'title': 'Project overview',
        'content': [
            'This repository is an AgroTrace agriculture traceability platform built as a monorepo.',
            'It combines a backend API, a React web dashboard, a Flutter mobile app, machine learning inference, smart contract traceability, and Prisma database models.',
            'The repository also includes extensive documentation, datasets, and deployment configuration.',
        ],
    },
    {
        'title': 'Root files and folders',
        'content': [
            'package.json: Root monorepo manifest that defines workspaces and scripts for building, developing, linting, testing, Docker, Prisma, and deployment.',
            'render.yaml: Render deployment configuration for cloud hosting.',
            'start.bat / start.ps1: Convenience scripts for starting the project on Windows.',
            '.gitignore / .renderignore: Files and folders excluded from version control and deploy builds.',
            'Dataset/: CSV files used for AI training and analytics, such as crop recommendation, yield prediction, and fertilizer guidance.',
            'docs/ and Documentation/: Rich project documentation with architecture, API design, deployment guides, UI guides, hackathon reports, and implementation notes.',
        ],
    },
    {
        'title': 'apps/backend',
        'content': [
            'This folder contains the main server API for AgroTrace.',
            'package.json: Backend dependencies and runtime scripts for dev, build, start, lint, and test.',
            'src/server.ts: Express application entrypoint that configures routes, middleware, and server startup.',
            'src/database/prisma.ts: Initializes the Prisma client and database connection for MongoDB.',
            'src/routes/: Defines API endpoints for auth, cart, chat, crops, farms, fields, marketplace, orders, products, shipments, QR codes, recommendations, supply chain, verification, and weather.',
            'src/controllers/: Implements the request handling logic for each route group.',
            'src/services/: Contains reusable business services such as blockchain integration, chatbot support, ML integration, provenance tracking, QR generation, and external market data ingestion.',
            'src/middleware/: Authentication, role authorization, request validation, security headers, error handling, auditing, and request ID management.',
            'src/validators/schemas.ts: Zod schema definitions for validating incoming API payloads.',
            'src/scripts/: Support utilities for data seeding, legacy hash backfill, area fixes, and test utilities.',
            'src/jobs/: Scheduled tasks such as price snapshot collection.',
        ],
    },
    {
        'title': 'apps/web',
        'content': [
            'The React web app provides the user interface for admin, farmer, distributor, and consumer workflows.',
            'package.json: Frontend dependencies, build configuration, and scripts using Vite.',
            'src/main.tsx: React app bootstrap that mounts the application and enables routing.',
            'src/App.tsx: The main application shell and top-level router setup.',
            'src/AdminRoutes.tsx: Routes and layout for admin-specific pages.',
            'src/pages/: Contains page components for dashboards, marketplace, product tracing, supply chain view, weather intelligence, chatbot, disease detection, and login.',
            'src/components/: Reusable UI elements such as charts, cards, layout components, maps, modals, notifications, QR support, and supply chain visuals.',
            'src/contexts/: React context providers for authentication, theming, and notifications.',
            'src/services/: API client wrappers and service modules for auth, farm operations, crop management, product management, orders, shipments, predictions, soil intelligence, supply chain, and verification.',
            'src/i18n/: Localization setup and translation files for multiple Indian languages plus English.',
            'tailwind.config.js and postcss.config.js: Tailwind CSS and PostCSS configuration for styling.',
        ],
    },
    {
        'title': 'apps/mobile',
        'content': [
            'The mobile app is a Flutter client for farmer and consumer interaction.',
            'pubspec.yaml: Flutter dependency manifest and asset declarations.',
            'lib/main.dart: Mobile app entrypoint and application setup.',
            'lib/screens/: Mobile screens for login, home, farm registration, and QR scanning.',
            'lib/services/auth_service.dart: Mobile authentication and API integration service.',
        ],
    },
    {
        'title': 'apps/ml-inference',
        'content': [
            'This folder hosts the ML inference service used by the application for crop recommendation, yield prediction, disease detection, and health scoring.',
            'main.py: The FastAPI or Flask entrypoint for the ML service.',
            'requirements.txt: Python dependencies including FastAPI, Uvicorn, pandas, scikit-learn, LightGBM, XGBoost, and joblib.',
            'routers/: API route definitions for predictions, recommendations, disease analysis, NDVI health, and retrieval-augmented generation.',
            'services/: Model loading and prediction logic for each inference endpoint.',
            'models/: Serialized machine learning models and encoders used at runtime.',
            'scripts/: Training, synthetic data generation, and model preparation scripts.',
        ],
    },
    {
        'title': 'packages/prisma',
        'content': [
            'This folder defines the database schema and ORM layer for the backend.',
            'schema.prisma: Prisma schema with MongoDB datasource, model definitions, enums, and relations for users, farms, crops, products, orders, shipments, supply chain events, AI predictions, and verification logs.',
            'migrations/: Database migration history and schema changes.',
            'seed.ts: Seed script to populate initial database data.',
        ],
    },
    {
        'title': 'blockchain',
        'content': [
            'The blockchain folder contains the smart contract project for traceability on a blockchain network.',
            'hardhat.config.js: Hardhat configuration for compiling Solidity contracts and defining networks such as localhost and Polygon Amoy.',
            'contracts/Traceability.sol: The smart contract implementing traceability and provenance recording.',
            'scripts/: Deployment and testing scripts for blockchain contracts.',
            'contract-address.json: Stores deployed contract addresses for integration with the backend.',
        ],
    },
    {
        'title': 'services/ai-service',
        'content': [
            'This folder is a separate AI service, likely providing additional model or inference support.',
            'main.py: Service entrypoint for the AI service.',
            'requirements.txt: Python dependencies for the AI stack.',
            'models/: Additional AI model artifacts used by the service.',
            'scripts/: Support and utility scripts for the AI service.',
        ],
    },
    {
        'title': 'Documentation and docs',
        'content': [
            'Documentation/: Extensive written project documentation covering architecture, APIs, deployment, testing, UI design, traceability, QR code implementation, and hackathon presentation materials.',
            'docs/: Shorter documentation files such as API reference and architecture summary.',
        ],
    },
    {
        'title': 'Generated and dependency folders',
        'content': [
            'node_modules/: Installed JavaScript dependencies for the workspace and packages. This folder is generated by npm and should not be edited manually.',
            'blockchain/artifacts / blockchain/cache / packages/prisma/node_modules: Generated build artifacts and dependency caches used by Hardhat and Prisma.',
        ],
    },
]


def build_pdf(output_path: Path):
    doc = SimpleDocTemplate(
        str(output_path), pagesize=letter,
        leftMargin=0.75 * inch, rightMargin=0.75 * inch,
        topMargin=0.75 * inch, bottomMargin=0.75 * inch,
    )
    styles = getSampleStyleSheet()
    title_style = styles['Title']
    heading_style = styles['Heading2']
    normal_style = styles['BodyText']
    normal_style.spaceAfter = 8
    bullet_style = ParagraphStyle(
        'Bullet', parent=styles['BodyText'], leftIndent=18, bulletIndent=8, spaceAfter=4,
    )

    story = []
    story.append(Paragraph('AgroTrace Detailed File Explanation', title_style))
    story.append(Spacer(1, 0.2 * inch))
    story.append(Paragraph('A detailed explanation of the main folders and files in the AgroTrace repository.', normal_style))
    story.append(Spacer(1, 0.2 * inch))

    for section in summary_sections:
        story.append(PageBreak())
        story.append(Paragraph(section['title'], heading_style))
        story.append(Spacer(1, 0.1 * inch))
        for line in section['content']:
            story.append(Paragraph(line, bullet_style))

    doc.build(story)
    return output_path


if __name__ == '__main__':
    print(f'Generating PDF at {PDF_PATH}')
    build_pdf(PDF_PATH)
    print('Done')
