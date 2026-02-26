import cors from "cors"
import express from "express"
import { createServer } from "http"
import swaggerUi from 'swagger-ui-express'

import { authRouter } from "./auth.route"
import { cardsRouter } from "./cards.route"
import { decksRouter } from "./decks.router"
import { swaggerDocument } from './docs'
import { env } from "./env"
import { ChatServer } from "./socket/ChatServer"

// Create Express app
export const app = express()

// Middlewares
app.use(
    cors({
        origin: true,  // Autorise toutes les origines
        credentials: true,
    }),
);

app.use(express.json())

app.use(authRouter)
app.use(cardsRouter)
app.use(decksRouter)

// Serve static files (Socket.io test client)
app.use(express.static('public'))

app.use(
    '/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerDocument, {
        customCss: '.swagger-ui .topbar { display: none }',
        customSiteTitle: 'Pokemon Deck API',
    })
)

// Health check endpoint
app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", message: "TCG Backend Server is running" });
});

// Start server only if this file is run directly (not imported for tests)
if (require.main === module) {
    // Create HTTP server
    const httpServer = createServer(app);

    new ChatServer(httpServer)

    // Start server
    try {
        httpServer.listen(env.PORT, () => {
            console.log(`\n🚀 Server is running on http://localhost:${env.PORT}`);
            console.log(`🧪 Socket.io Test Client available at http://localhost:${env.PORT}`);
        });
    } catch (error) {
        console.error("Failed to start server:", error);
        process.exit(1);
    }
}
